/**
 * Minimal Gemini API client (REST, no SDK) so the app has zero runtime dependencies.
 * The API key lives only on the server and is sent in a header, never in a URL.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  /**
   * @param {string} message safe to show to users
   * @param {{ status?: number, cause?: unknown, detail?: string, retryable?: boolean }} [opts]
   *   `detail` is for server logs only; `retryable` means another model may succeed.
   */
  constructor(message, { status, cause, detail, retryable = false } = {}) {
    super(message, { cause });
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
  }
}

/**
 * The parts of a generateContent response this client reads.
 * @typedef {{ text?: string, thought?: boolean }} Part
 * @typedef {{ content?: { parts?: Part[] }, finishReason?: string }} Candidate
 * @typedef {object} GenerateContentResponse
 * @property {Candidate[]} [candidates]
 * @property {{ blockReason?: string }} [promptFeedback]
 * @property {{ status?: string, message?: string }} [error]
 */

/**
 * Join the visible text parts of the first candidate (skipping "thought" parts).
 * @param {GenerateContentResponse | null} data generateContent response body
 * @returns {string}
 */
export function extractText(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new GeminiError(reason ? `Request blocked by safety filters (${reason}).` : 'Gemini returned no candidates.');
  }
  const parts = candidate.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  if (!text.trim()) {
    throw new GeminiError(`Gemini returned an empty response (finishReason: ${candidate.finishReason ?? 'unknown'}).`);
  }
  return text;
}

/** Upstream statuses worth retrying on another model: rate limits, overload, transient server errors. */
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

/**
 * @param {{ apiKey: string, model?: string, fallbackModels?: string[], fetchImpl?: typeof fetch, timeoutMs?: number }} options
 *   `fallbackModels` are tried in order when the primary model is overloaded, rate limited or too slow.
 *   `timeoutMs` is per model attempt, so a hung model costs at most this long before the fallback runs.
 */
export function createGeminiClient({
  apiKey,
  model = 'gemini-flash-latest',
  fallbackModels = ['gemini-flash-lite-latest'],
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) {
  if (!apiKey) throw new Error('createGeminiClient requires an apiKey');
  const models = [...new Set([model, ...fallbackModels].filter(Boolean))];

  /**
   * One generateContent call against one model.
   * @param {string} target model id
   * @param {{ system: string, prompt: string, generationConfig: object }} req
   */
  async function callModel(target, { system, prompt, generationConfig }) {
    let res;
    /** @type {GenerateContentResponse | null} */
    let body;
    try {
      // The timeout signal covers both the response headers and reading the body.
      res = await fetchImpl(`${API_BASE}/${encodeURIComponent(target)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = /** @type {GenerateContentResponse | null} */ (
        await res.json().catch((err) => {
          if (err instanceof Error && err.name === 'TimeoutError') throw err;
          return null;
        })
      );
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new GeminiError(timedOut ? 'Gemini request timed out.' : 'Could not reach Gemini.', {
        cause: err,
        detail: `${target}: ${timedOut ? `no response within ${timeoutMs} ms` : String(err)}`,
        retryable: true,
      });
    }
    if (!res.ok) {
      // Keep Google's reason for server logs, but never echo it to clients.
      const detail = body?.error ? `${body.error.status ?? ''}: ${String(body.error.message ?? '').slice(0, 300)}` : undefined;
      throw new GeminiError(`Gemini API error (HTTP ${res.status}).`, { status: res.status, detail, retryable: RETRYABLE_STATUS.has(res.status) });
    }
    return extractText(body);
  }

  /**
   * Try each model in order, moving on only for retryable errors (overload, rate limit, timeout, network).
   * @param {{ system: string, prompt: string, generationConfig: object }} req
   * @returns {Promise<{ text: string, model: string }>}
   */
  async function generate(req) {
    let lastError;
    for (const target of models) {
      try {
        return { text: await callModel(target, req), model: target };
      } catch (err) {
        lastError = err;
        if (!(err instanceof GeminiError && err.retryable)) throw err;
      }
    }
    throw lastError;
  }

  return {
    model,
    models,

    /**
     * Ask for JSON that matches a response schema.
     * @param {{ system: string, prompt: string, schema: object, maxOutputTokens?: number, temperature?: number }} req
     * @returns {Promise<{ data: any, model: string }>} parsed JSON and the model that produced it
     */
    async generateJson({ system, prompt, schema, maxOutputTokens = 4096, temperature = 0.8 }) {
      const { text, model: used } = await generate({
        system,
        prompt,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens, temperature },
      });
      try {
        return { data: JSON.parse(text), model: used };
      } catch (err) {
        throw new GeminiError('Gemini returned malformed JSON.', { cause: err });
      }
    },

    /**
     * Ask for a plain-text answer.
     * @param {{ system: string, prompt: string, maxOutputTokens?: number, temperature?: number }} req
     * @returns {Promise<{ text: string, model: string }>}
     */
    async generateText({ system, prompt, maxOutputTokens = 2048, temperature = 0.6 }) {
      return generate({ system, prompt, generationConfig: { maxOutputTokens, temperature } });
    },
  };
}
