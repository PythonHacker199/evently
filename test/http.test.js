import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { optionsFromEnv } from '../server.js';
import { clientIp } from '../src/http/limits.js';
import { HttpError, sendError } from '../src/http/json.js';
import { isEventType } from '../src/templates.js';

/** Minimal stand-in for http.ServerResponse that records what was written. */
function fakeResponse() {
  return {
    headersSent: false,
    statusCode: 0,
    /** @type {Record<string, string>} */
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = v;
    },
    end(body = '') {
      this.body = body;
      this.headersSent = true;
    },
  };
}

describe('optionsFromEnv', () => {
  test('reads Gemini settings and trims the key', () => {
    const opts = optionsFromEnv({ GEMINI_API_KEY: '  abc  ', GEMINI_MODEL: 'm', GEMINI_FALLBACK_MODELS: 'a, b,,' });
    assert.equal(opts.apiKey, 'abc');
    assert.equal(opts.model, 'm');
    assert.deepEqual(opts.fallbackModels, ['a', 'b']);
    assert.equal(opts.trustProxy, false);
  });

  test('an empty fallback list disables fallback; a blank key means no AI', () => {
    const opts = optionsFromEnv({ GEMINI_API_KEY: '   ', GEMINI_FALLBACK_MODELS: '' });
    assert.equal(opts.apiKey, undefined);
    assert.deepEqual(opts.fallbackModels, []);
  });

  test('trusts the proxy on Cloud Run or when asked to', () => {
    assert.equal(optionsFromEnv({ K_SERVICE: 'evently' }).trustProxy, true);
    assert.equal(optionsFromEnv({ TRUST_PROXY: '1' }).trustProxy, true);
  });
});

describe('clientIp', () => {
  const req = (forwarded, remote = '10.0.0.1') => ({ headers: { 'x-forwarded-for': forwarded }, socket: { remoteAddress: remote } });

  test('uses the socket address unless the proxy is trusted', () => {
    assert.equal(clientIp(req('1.2.3.4'), false), '10.0.0.1');
  });

  test('uses the right-most forwarded entry, which the client cannot spoof', () => {
    assert.equal(clientIp(req('6.6.6.6, 1.2.3.4'), true), '1.2.3.4');
    assert.equal(clientIp(req(''), true), '10.0.0.1');
  });
});

describe('sendError', () => {
  const quiet = { error() {} };

  test('HttpErrors keep their status, message and field errors', () => {
    const res = fakeResponse();
    sendError(res, new HttpError(400, 'Bad input', { errors: { date: 'Enter a date.' } }), quiet);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { error: 'Bad input', errors: { date: 'Enter a date.' } });
  });

  test('rate-limit errors carry Retry-After', () => {
    const res = fakeResponse();
    sendError(res, new HttpError(429, 'Slow down', { retryAfterSec: 12 }), quiet);
    assert.equal(res.headers['retry-after'], '12');
  });

  test('unexpected errors become a generic 500 without internal details', () => {
    const res = fakeResponse();
    const logged = [];
    sendError(res, new Error('database password is hunter2'), { error: (e) => logged.push(e) });
    assert.equal(res.statusCode, 500);
    assert.ok(!res.body.includes('hunter2'));
    assert.equal(logged.length, 1);
  });

  test('does nothing once headers were sent', () => {
    const res = fakeResponse();
    res.headersSent = true;
    sendError(res, new HttpError(400, 'late'), quiet);
    assert.equal(res.statusCode, 0);
  });
});

describe('isEventType', () => {
  test('accepts only known event types', () => {
    assert.equal(isEventType('wedding'), true);
    assert.equal(isEventType('funeral'), false);
    assert.equal(isEventType('toString'), false);
    assert.equal(isEventType(42), false);
  });
});
