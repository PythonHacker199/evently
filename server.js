import http from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPublicConfig } from './src/templates.js';
import { validatePlanInput, validateQuestion } from './src/validate.js';
import { buildPlan } from './src/planner.js';
import { createGeminiClient } from './src/gemini.js';
import { generateIdeas, answerQuestion, describeError } from './src/ideas.js';
import { formatISODate, startOfUTCDay } from './src/dates.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 16 * 1024;

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
});
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt']);

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

class HttpError extends Error {
  /** @param {number} status @param {string} message @param {object} [extra] */
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Fixed-window rate limiter keyed by client IP. In-memory is fine for a single Cloud Run
 * instance; it resets on cold start, which only makes it more lenient.
 * @param {{ windowMs: number, max: number }} opts
 */
export function createRateLimiter({ windowMs, max }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();
  return (/** @type {string} */ key, now = Date.now()) => {
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  };
}

/**
 * Small TTL + LRU cache so identical plan requests don't spend another Gemini call.
 * @param {{ max: number, ttlMs: number }} opts
 */
export function createTtlCache({ max, ttlMs }) {
  /** @type {Map<string, { value: unknown, expires: number }>} */
  const store = new Map();
  return {
    get(/** @type {string} */ key, now = Date.now()) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires <= now) {
        store.delete(key);
        return undefined;
      }
      store.delete(key); // refresh LRU position
      store.set(key, hit);
      return hit.value;
    },
    set(/** @type {string} */ key, /** @type {unknown} */ value, now = Date.now()) {
      store.delete(key);
      store.set(key, { value, expires: now + ttlMs });
      if (store.size > max) store.delete(store.keys().next().value);
    },
    get size() {
      return store.size;
    },
  };
}

/**
 * Read every file under `dir` into memory once (the site is tiny), with gzip and ETags.
 * Also prevents path traversal by construction: only preloaded paths can ever be served.
 * @param {string} dir
 */
async function loadStatic(dir) {
  /** @type {Map<string, { body: Buffer, gzip: Buffer | null, type: string, etag: string }>} */
  const files = new Map();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    if (!MIME[ext]) continue;
    const body = await readFile(full);
    const urlPath = '/' + path.relative(dir, full).split(path.sep).join('/');
    files.set(urlPath, {
      body,
      gzip: COMPRESSIBLE.has(ext) ? gzipSync(body) : null,
      type: MIME[ext],
      etag: `"${createHash('sha1').update(body).digest('base64url')}"`,
    });
  }
  return files;
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      reject(new HttpError(415, 'Content-Type must be application/json.'));
      req.resume();
      return;
    }
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES) {
      reject(new HttpError(413, 'Request body too large.'));
      req.resume();
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(new HttpError(400, 'Malformed JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/**
 * @typedef {object} AppOptions
 * @property {string} [apiKey] Gemini API key; when absent the app uses curated ideas.
 * @property {string} [model]
 * @property {string[]} [fallbackModels] tried in order when the primary model is overloaded
 * @property {typeof fetch} [fetchImpl]
 * @property {() => Date} [now]
 * @property {string} [publicDir]
 * @property {{ windowMs: number, max: number }} [rateLimit]
 * @property {boolean} [trustProxy] read client IP from X-Forwarded-For (Cloud Run sets it)
 * @property {Pick<Console, 'log' | 'warn' | 'error'>} [log]
 */

/**
 * Build the HTTP server. Exposed as a factory so tests can inject a fake clock and fetch.
 * @param {AppOptions} [options]
 */
export async function createApp(options = {}) {
  const {
    apiKey,
    model,
    fallbackModels,
    fetchImpl,
    now = () => new Date(),
    publicDir = path.join(ROOT, 'public'),
    rateLimit = { windowMs: 60_000, max: 20 },
    trustProxy = false,
    log = console,
  } = options;

  const client = apiKey ? createGeminiClient({ apiKey, model, fallbackModels, fetchImpl }) : null;
  const files = await loadStatic(publicDir);
  const limiter = createRateLimiter(rateLimit);
  const planCache = createTtlCache({ max: 200, ttlMs: 60 * 60 * 1000 });
  const aiInfo = { enabled: Boolean(client), model: client?.model ?? null };

  /** @param {http.IncomingMessage} req */
  function clientIp(req) {
    if (trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      // The right-most entry is the one appended by Google's front end; earlier ones are client-supplied.
      if (fwd.length) return fwd[fwd.length - 1];
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  /** @param {http.IncomingMessage} req */
  function enforceRateLimit(req) {
    const { allowed, retryAfterSec } = limiter(clientIp(req));
    if (!allowed) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { retryAfterSec });
  }

  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
  async function handlePlan(req, res) {
    enforceRateLimit(req);
    const today = startOfUTCDay(now());
    const result = validatePlanInput(await readJsonBody(req), today);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields.', { errors: result.errors });

    const plan = buildPlan(result.value, today);
    const cacheKey = `${formatISODate(today)}:${plan.id}`;
    let ideas = /** @type {Awaited<ReturnType<typeof generateIdeas>> | undefined} */ (planCache.get(cacheKey));
    if (!ideas) {
      ideas = await generateIdeas(plan, client, log);
      // Only cache real AI output; a fallback should be retried on the next request.
      if (ideas.source === 'gemini') planCache.set(cacheKey, ideas);
    }
    sendJson(res, 200, { plan: { ...plan, ideas } });
  }

  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
  async function handleAsk(req, res) {
    enforceRateLimit(req);
    if (!client) throw new HttpError(503, 'The AI assistant is not configured on this server (missing GEMINI_API_KEY).');
    const body = /** @type {any} */ (await readJsonBody(req));
    const today = startOfUTCDay(now());
    const input = validatePlanInput(body?.input, today);
    if (!input.ok) throw new HttpError(400, 'The plan details are invalid. Generate the plan again.', { errors: input.errors });
    const question = validateQuestion(body?.question);
    if (!question.ok) throw new HttpError(400, question.error);

    try {
      const { answer, model: used } = await answerQuestion(buildPlan(input.value, today), question.value, client);
      sendJson(res, 200, { answer, model: used });
    } catch (err) {
      log.warn(`Gemini ask failed: ${describeError(err)}`);
      throw new HttpError(502, 'The AI assistant could not answer right now. Please try again.');
    }
  }

  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res @param {string} pathname */
  function serveStatic(req, res, pathname) {
    const file = files.get(pathname === '/' ? '/index.html' : pathname);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const headers = {
      'Content-Type': file.type,
      ETag: file.etag,
      // Assets are not fingerprinted, so always revalidate; unchanged files cost only a 304.
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === file.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const useGzip = file.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const body = useGzip ? file.gzip : file.body;
    res.writeHead(200, { ...headers, ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  /** @type {http.RequestListener} */
  async function handler(req, res) {
    const started = Date.now();
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (pathname.startsWith('/api/')) {
      // One structured line per API request; Cloud Logging parses JSON automatically.
      res.once('finish', () => {
        log.log(JSON.stringify({ severity: res.statusCode >= 500 ? 'ERROR' : 'INFO', method, path: pathname, status: res.statusCode, ms: Date.now() - started }));
      });
    }

    try {
      if (pathname.startsWith('/api/')) {
        const route = `${method} ${pathname}`;
        if (route === 'GET /api/health') sendJson(res, 200, { status: 'ok', ai: aiInfo });
        else if (route === 'GET /api/config') sendJson(res, 200, { ...getPublicConfig(), ai: aiInfo });
        else if (route === 'POST /api/plan') await handlePlan(req, res);
        else if (route === 'POST /api/ask') await handleAsk(req, res);
        else if (['/api/health', '/api/config', '/api/plan', '/api/ask'].includes(pathname)) throw new HttpError(405, 'Method not allowed.');
        else throw new HttpError(404, 'Unknown API route.');
      } else if (method === 'GET' || method === 'HEAD') {
        serveStatic(req, res, pathname);
      } else {
        throw new HttpError(405, 'Method not allowed.');
      }
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 429) res.setHeader('Retry-After', String(err.extra?.retryAfterSec ?? 60));
        if (!res.headersSent) sendJson(res, err.status, { error: err.message, ...(err.extra?.errors ? { errors: err.extra.errors } : {}) });
      } else {
        log.error(err);
        if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
      }
    }
  }

  return http.createServer(handler);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const server = await createApp({
    apiKey: process.env.GEMINI_API_KEY || undefined,
    model: process.env.GEMINI_MODEL || undefined,
    // Comma-separated; set to an empty string to disable fallback.
    fallbackModels: process.env.GEMINI_FALLBACK_MODELS === undefined
      ? undefined
      : process.env.GEMINI_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === '1' || Boolean(process.env.K_SERVICE),
  });
  server.listen(port, () => {
    console.log(`EventWise listening on http://localhost:${port} (AI: ${process.env.GEMINI_API_KEY ? 'Gemini' : 'curated fallback'})`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
