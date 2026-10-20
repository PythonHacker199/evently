/**
 * Evently server: the JSON API plus the static pages, on Node's built-in http module.
 * This file only wires the pieces together; see src/http/* and src/routes/api.js.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGeminiClient } from './src/gemini.js';
import { applySecurityHeaders } from './src/http/security.js';
import { HttpError, sendError } from './src/http/json.js';
import { loadSite, serveStatic } from './src/http/static.js';
import { createApiRouter } from './src/routes/api.js';

export { SECURITY_HEADERS } from './src/http/security.js';
export { CLASSIC_PREFIX } from './src/http/static.js';
export { createRateLimiter, createTtlCache } from './src/http/limits.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} AppOptions
 * @property {string} [apiKey] Gemini API key; when absent the app uses curated ideas.
 * @property {string} [model]
 * @property {string[]} [fallbackModels] tried in order when the primary model is overloaded
 * @property {typeof fetch} [fetchImpl]
 * @property {() => Date} [now]
 * @property {string} [publicDir] classic planner UI, served under /classic/
 * @property {string | null} [webDir] built Evently page (web/dist), served at /; when missing, the classic UI is served at / too
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
    webDir = path.join(ROOT, 'web', 'dist'),
    rateLimit = { windowMs: 60_000, max: 20 },
    trustProxy = false,
    log = console,
  } = options;

  const client = apiKey ? createGeminiClient({ apiKey, model, fallbackModels, fetchImpl }) : null;
  const files = await loadSite({ publicDir, webDir, log });
  const api = createApiRouter({ client, now, log, rateLimit, trustProxy });

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async function handler(req, res) {
    const started = Date.now();
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const isApi = pathname.startsWith('/api/');
    applySecurityHeaders(res);
    if (isApi) {
      // One structured line per API request; Cloud Logging parses JSON automatically.
      res.once('finish', () => {
        const severity = res.statusCode >= 500 ? 'ERROR' : 'INFO';
        log.log(JSON.stringify({ severity, method, path: pathname, status: res.statusCode, ms: Date.now() - started }));
      });
    }

    try {
      if (isApi) await api(req, res, method, pathname);
      else if (method === 'GET' || method === 'HEAD') serveStatic(files, req, res, pathname);
      else throw new HttpError(405, 'Method not allowed.');
    } catch (err) {
      sendError(res, err, log);
    }
  }

  return http.createServer(handler);
}

/**
 * Read server options from environment variables.
 * @param {NodeJS.ProcessEnv} env
 * @returns {AppOptions}
 */
export function optionsFromEnv(env) {
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    model: env.GEMINI_MODEL || undefined,
    // Comma-separated; set to an empty string to disable fallback.
    fallbackModels: env.GEMINI_FALLBACK_MODELS === undefined
      ? undefined
      : env.GEMINI_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean),
    // K_SERVICE is set by Cloud Run, which sits behind Google's front end.
    trustProxy: env.TRUST_PROXY === '1' || Boolean(env.K_SERVICE),
  };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  const options = optionsFromEnv(process.env);
  const port = Number(process.env.PORT) || 8080;
  const server = await createApp(options);
  server.listen(port, () => {
    console.log(`Evently listening on http://localhost:${port} (AI: ${options.apiKey ? 'Gemini' : 'curated fallback'})`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
