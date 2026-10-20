import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createApp, createRateLimiter, createTtlCache, SECURITY_HEADERS, CLASSIC_PREFIX } from '../server.js';

const NOW = () => new Date('2026-10-19T09:30:00Z');
const quiet = { log() {}, warn() {}, error() {} };
const VALID = { eventType: 'birthday', date: '2026-12-05', guests: 30, budget: 60000, currency: 'INR', location: 'Delhi', priorities: ['cake'] };

/** Start an app on a random port and return a base URL plus a closer. */
async function start(options = {}) {
  // webDir: null = behave like a fresh clone without the Evently build, unless a test passes one.
  const server = await createApp({ now: NOW, log: quiet, webDir: null, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('static routing: Evently at /, classic planner at /classic/', () => {
  let app;
  let webDir;
  before(async () => {
    // A tiny stand-in for web/dist, so the test does not depend on running the Vite build.
    webDir = await mkdtemp(path.join(tmpdir(), 'evently-dist-'));
    await mkdir(path.join(webDir, 'assets'));
    await writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>Evently test</title>');
    await writeFile(path.join(webDir, 'assets', 'index-abc123.js'), 'console.log(1)');
    app = await start({ webDir });
  });
  after(async () => {
    await app.close();
    await rm(webDir, { recursive: true, force: true });
  });

  test('serves the Evently build at /', async () => {
    const res = await fetch(`${app.base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Evently test/);
  });

  test('hashed build assets are cached as immutable', async () => {
    const res = await fetch(`${app.base}/assets/index-abc123.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /immutable/);
  });

  test('serves the classic planner under /classic/ with a redirect for the bare path', async () => {
    const redirect = await fetch(`${app.base}${CLASSIC_PREFIX}`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), `${CLASSIC_PREFIX}/`);
    const page = await fetch(`${app.base}${CLASSIC_PREFIX}/`);
    assert.match(await page.text(), /EventWise/);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.equal((await fetch(`${app.base}${CLASSIC_PREFIX}/app.js`)).status, 200);
  });

  test('CSP allows the hero video origin but nothing else new', async () => {
    const csp = (await fetch(`${app.base}/`)).headers.get('content-security-policy');
    assert.match(csp, /media-src 'self' https:\/\/pollen-batch-41236914\.figma\.site/);
    assert.match(csp, /script-src 'self'(;|$)/);
  });

  test('falls back to the classic planner at / when Evently is not built', async () => {
    const fallback = await start({ webDir: path.join(webDir, 'does-not-exist') });
    try {
      assert.match(await (await fetch(`${fallback.base}/`)).text(), /EventWise/);
    } finally {
      await fallback.close();
    }
  });
});

describe('server without Gemini (curated mode)', () => {
  let app;
  before(async () => { app = await start(); });
  after(() => app.close());

  test('health and config report AI disabled', async () => {
    const health = await (await fetch(`${app.base}/api/health`)).json();
    assert.deepEqual(health, { status: 'ok', ai: { enabled: false, model: null } });
    const config = await (await fetch(`${app.base}/api/config`)).json();
    assert.equal(config.eventTypes.length, 3);
    assert.ok(config.currencies.includes('INR'));
  });

  test('serves the app with security headers, gzip and ETag caching', async () => {
    const res = await fetch(`${app.base}/`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    for (const name of Object.keys(SECURITY_HEADERS)) assert.ok(res.headers.get(name), `missing ${name}`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    const etag = res.headers.get('etag');
    const again = await fetch(`${app.base}/`, { headers: { 'if-none-match': etag } });
    assert.equal(again.status, 304);
  });

  test('does not serve files outside public/', async () => {
    for (const path of ['/../server.js', '/%2e%2e/package.json', '/src/planner.js', '/.env']) {
      const res = await fetch(`${app.base}${path}`);
      assert.equal(res.status, 404, path);
    }
  });

  test('builds a plan with curated ideas', async () => {
    const res = await post(app.base, '/api/plan', VALID);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const { plan } = await res.json();
    assert.equal(plan.eventLabel, 'Birthday');
    assert.equal(plan.budget.categories.reduce((s, c) => s + c.amount, 0), 60000);
    assert.equal(plan.ideas.source, 'curated');
    assert.ok(plan.vendors[0].mapsQuery.includes('Delhi'));
  });

  test('returns field errors for invalid input', async () => {
    const res = await post(app.base, '/api/plan', { ...VALID, guests: 0, date: '2020-01-01' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.guests);
    assert.ok(body.errors.date);
  });

  test('rejects wrong content type, malformed JSON and oversized bodies', async () => {
    const wrongType = await fetch(`${app.base}/api/plan`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    assert.equal(wrongType.status, 415);
    assert.equal((await post(app.base, '/api/plan', '{not json')).status, 400);
    assert.equal((await post(app.base, '/api/plan', { notes: 'x'.repeat(20_000) })).status, 413);
  });

  test('ask endpoint explains that AI is not configured', async () => {
    const res = await post(app.base, '/api/ask', { input: VALID, question: 'What first?' });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /GEMINI_API_KEY/);
  });

  test('unknown routes and wrong methods', async () => {
    assert.equal((await fetch(`${app.base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/plan`)).status, 405);
    assert.equal((await fetch(`${app.base}/`, { method: 'DELETE' })).status, 405);
  });
});

describe('server with a mocked Gemini', () => {
  let app;
  let calls = 0;
  const ideas = {
    summary: 'A cosy dinosaur-themed party.',
    themeIdeas: [{ title: 'Fossil dig', description: 'Bury toy fossils in a sandpit for a dig.' }],
    personalizedTips: ['Keep it under 3 hours for young kids.'],
    agenda: [{ time: '16:00', activity: 'Guests arrive' }],
    savingTips: ['DIY decorations.'],
    risks: ['Sugar overload.'],
  };
  const fetchImpl = async (url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    const isJson = body.generationConfig.responseMimeType === 'application/json';
    const text = isJson ? JSON.stringify(ideas) : 'Book the bakery this week.';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  };

  before(async () => { app = await start({ apiKey: 'test-key', model: 'gemini-test', fetchImpl }); });
  after(() => app.close());

  test('plans include Gemini ideas and identical requests are cached', async () => {
    const first = await (await post(app.base, '/api/plan', VALID)).json();
    assert.equal(first.plan.ideas.source, 'gemini');
    assert.equal(first.plan.ideas.themeIdeas[0].title, 'Fossil dig');
    const callsAfterFirst = calls;
    const second = await (await post(app.base, '/api/plan', VALID)).json();
    assert.deepEqual(second.plan.ideas, first.plan.ideas);
    assert.equal(calls, callsAfterFirst, 'second request should hit the cache');
  });

  test('answers follow-up questions', async () => {
    const res = await post(app.base, '/api/ask', { input: VALID, question: 'What should I do this week?' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.answer, 'Book the bakery this week.');
  });

  test('validates ask payloads', async () => {
    assert.equal((await post(app.base, '/api/ask', { input: VALID, question: '?' })).status, 400);
    assert.equal((await post(app.base, '/api/ask', { input: {}, question: 'Valid question here' })).status, 400);
  });

  test('health reports the model', async () => {
    const health = await (await fetch(`${app.base}/api/health`)).json();
    assert.deepEqual(health.ai, { enabled: true, model: 'gemini-test' });
  });
});

describe('rate limiting', () => {
  test('returns 429 with Retry-After once the limit is hit', async () => {
    const app = await start({ rateLimit: { windowMs: 60_000, max: 2 } });
    try {
      assert.equal((await post(app.base, '/api/plan', VALID)).status, 200);
      assert.equal((await post(app.base, '/api/plan', VALID)).status, 200);
      const limited = await post(app.base, '/api/plan', VALID);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
    } finally {
      await app.close();
    }
  });

  test('limiter resets after the window', () => {
    const limit = createRateLimiter({ windowMs: 1000, max: 1 });
    assert.equal(limit('ip', 0).allowed, true);
    assert.equal(limit('ip', 10).allowed, false);
    assert.equal(limit('ip', 1001).allowed, true);
    assert.equal(limit('other', 10).allowed, true);
  });
});

describe('ttl cache', () => {
  test('expires entries and evicts least recently used', () => {
    const cache = createTtlCache({ max: 2, ttlMs: 100 });
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    assert.equal(cache.get('a', 10), 1); // a is now most recent
    cache.set('c', 3, 10); // evicts b
    assert.equal(cache.get('b', 10), undefined);
    assert.equal(cache.get('a', 200), undefined); // expired
    assert.equal(cache.size, 1);
  });
});
