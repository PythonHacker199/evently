/**
 * JSON API: /api/health, /api/config, /api/parse, /api/plan, /api/ask.
 */
import { createHash } from 'node:crypto';

import { getPublicConfig } from '../templates.js';
import { validatePlanInput, validateQuestion, validateDescription } from '../validate.js';
import { buildPlan } from '../planner.js';
import { generateIdeas, answerQuestion, describeError } from '../ideas.js';
import { parseDescription } from '../parse.js';
import { formatISODate, startOfUTCDay } from '../dates.js';
import { HttpError, readJsonBody, sendJson } from '../http/json.js';
import { createRateLimiter, createTtlCache, clientIp } from '../http/limits.js';

/** Identical requests on the same day reuse the Gemini response for this long. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const AI_NOT_CONFIGURED = 'The AI assistant is not configured on this server (missing GEMINI_API_KEY).';

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */
/** @typedef {(req: Req, res: Res) => Promise<void>} Handler */
/** @typedef {Awaited<ReturnType<typeof generateIdeas>>} Ideas */
/** @typedef {{ input: Record<string, unknown>, missing: string[] }} ParseResult */

/**
 * @typedef {object} ApiDeps
 * @property {ReturnType<typeof import('../gemini.js').createGeminiClient> | null} client
 * @property {() => Date} now
 * @property {Pick<Console, 'log' | 'warn' | 'error'>} log
 * @property {{ windowMs: number, max: number }} rateLimit
 * @property {boolean} trustProxy
 */

/**
 * Build the API request handler.
 * @param {ApiDeps} deps
 * @returns {(req: Req, res: Res, method: string, pathname: string) => Promise<void>}
 */
export function createApiRouter({ client, now, log, rateLimit, trustProxy }) {
  const limiter = createRateLimiter(rateLimit);
  /** @type {ReturnType<typeof createTtlCache<Ideas>>} */
  const ideasCache = createTtlCache({ max: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });
  /** @type {ReturnType<typeof createTtlCache<ParseResult>>} */
  const parseCache = createTtlCache({ max: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });
  const aiInfo = { enabled: Boolean(client), model: client?.model ?? null };

  /** @param {Req} req */
  function enforceRateLimit(req) {
    const { allowed, retryAfterSec } = limiter(clientIp(req, trustProxy));
    if (!allowed) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { retryAfterSec });
  }

  function requireClient() {
    if (!client) throw new HttpError(503, AI_NOT_CONFIGURED);
    return client;
  }

  /** @type {Handler} */
  async function plan(req, res) {
    enforceRateLimit(req);
    const today = startOfUTCDay(now());
    const result = validatePlanInput(await readJsonBody(req), today);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields.', { errors: result.errors });

    const built = buildPlan(result.value, today);
    const cacheKey = `${formatISODate(today)}:${built.id}`;
    let ideas = ideasCache.get(cacheKey);
    if (!ideas) {
      ideas = await generateIdeas(built, client, log);
      // Only cache real AI output; a fallback should be retried on the next request.
      if (ideas.source === 'gemini') ideasCache.set(cacheKey, ideas);
    }
    sendJson(res, 200, { plan: { ...built, ideas } });
  }

  /** @type {Handler} */
  async function ask(req, res) {
    enforceRateLimit(req);
    const ai = requireClient();
    const body = /** @type {{ input?: unknown, question?: unknown } | null} */ (await readJsonBody(req));
    const today = startOfUTCDay(now());
    const input = validatePlanInput(body?.input, today);
    if (!input.ok) throw new HttpError(400, 'The plan details are invalid. Generate the plan again.', { errors: input.errors });
    const question = validateQuestion(body?.question);
    if (!question.ok) throw new HttpError(400, question.error);

    try {
      const { answer, model } = await answerQuestion(buildPlan(input.value, today), question.value, ai);
      sendJson(res, 200, { answer, model });
    } catch (err) {
      log.warn(`Gemini ask failed: ${describeError(err)}`);
      throw new HttpError(502, 'The AI assistant could not answer right now. Please try again.');
    }
  }

  /**
   * Free text -> structured plan input. The client then calls /api/plan with `input`
   * (after asking the user for anything listed in `missing`).
   * @type {Handler}
   */
  async function parse(req, res) {
    enforceRateLimit(req);
    const ai = requireClient();
    const body = /** @type {{ text?: unknown } | null} */ (await readJsonBody(req));
    const text = validateDescription(body?.text);
    if (!text.ok) throw new HttpError(400, text.error);

    const today = startOfUTCDay(now());
    // Relative dates ("next Saturday") depend on today, so it is part of the key.
    const cacheKey = `${formatISODate(today)}:${createHash('sha256').update(text.value).digest('base64url')}`;
    let parsed = parseCache.get(cacheKey);
    if (!parsed) {
      try {
        const { input, missing } = await parseDescription(text.value, ai, today);
        parsed = { input, missing };
      } catch (err) {
        log.warn(`Gemini parse failed: ${describeError(err)}`);
        throw new HttpError(502, 'The AI assistant could not read your description right now. Please try again.');
      }
      parseCache.set(cacheKey, parsed);
    }
    sendJson(res, 200, parsed);
  }

  /** @type {Record<string, Record<string, Handler>>} path -> method -> handler */
  const routes = {
    '/api/health': { GET: async (_req, res) => sendJson(res, 200, { status: 'ok', ai: aiInfo }) },
    '/api/config': { GET: async (_req, res) => sendJson(res, 200, { ...getPublicConfig(), ai: aiInfo }) },
    '/api/parse': { POST: parse },
    '/api/plan': { POST: plan },
    '/api/ask': { POST: ask },
  };

  return async (req, res, method, pathname) => {
    const byMethod = routes[pathname];
    if (!byMethod) throw new HttpError(404, 'Unknown API route.');
    const handler = byMethod[method];
    if (!handler) throw new HttpError(405, 'Method not allowed.');
    await handler(req, res);
  };
}
