/**
 * Minimal Gemini API client (REST, no SDK) so the app has zero runtime dependencies.
 * The API key lives only on the server and is sent in a header, never in a URL.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [opts]
   */
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Join the visible text parts of the first candidate (skipping "thought" parts).
 * @param {any} data generateContent response body
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

/**
 * @param {{ apiKey: string, model?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createGeminiClient({ apiKey, model = 'gemini-flash-latest', fetchImpl = fetch, timeoutMs = 30_000 }) {
  if (!apiKey) throw new Error('createGeminiClient requires an apiKey');

  /**
   * @param {{ system: string, prompt: string, generationConfig: object }} req
   */
  async function generate({ system, prompt, generationConfig }) {
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new GeminiError(timedOut ? 'Gemini request timed out.' : 'Could not reach Gemini.', { cause: err });
    }
    if (!res.ok) {
      // Do not echo the upstream body to clients; it can contain request details.
      throw new GeminiError(`Gemini API error (HTTP ${res.status}).`, { status: res.status });
    }
    return extractText(await res.json());
  }

  return {
    model,

    /**
     * Ask for JSON that matches a response schema.
     * @param {{ system: string, prompt: string, schema: object, maxOutputTokens?: number, temperature?: number }} req
     */
    async generateJson({ system, prompt, schema, maxOutputTokens = 4096, temperature = 0.8 }) {
      const text = await generate({
        system,
        prompt,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens, temperature },
      });
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new GeminiError('Gemini returned malformed JSON.', { cause: err });
      }
    },

    /**
     * Ask for a plain-text answer.
     * @param {{ system: string, prompt: string, maxOutputTokens?: number, temperature?: number }} req
     */
    async generateText({ system, prompt, maxOutputTokens = 2048, temperature = 0.6 }) {
      return generate({ system, prompt, generationConfig: { maxOutputTokens, temperature } });
    },
  };
}
