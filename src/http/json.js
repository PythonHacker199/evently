/**
 * JSON request/response helpers and the error type the router turns into JSON responses.
 */

/** Largest accepted request body. Every API payload is a few hundred bytes. */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * An error with an HTTP status that is safe to show to the client.
 */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message shown to the client
   * @param {{ errors?: Record<string, string>, retryAfterSec?: number }} [extra]
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
export function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

/**
 * Read and parse a JSON request body, enforcing content type and size limits.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      req.resume();
      reject(new HttpError(415, 'Content-Type must be application/json.'));
      return;
    }
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      req.resume();
      reject(new HttpError(413, 'Request body too large.'));
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (/** @type {Buffer} */ chunk) => {
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
 * Write an error as JSON: HttpErrors keep their status and message, anything else becomes
 * a generic 500 so internal details never reach the client.
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} err
 * @param {Pick<Console, 'error'>} log
 */
export function sendError(res, err, log) {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    if (err.status === 429) res.setHeader('Retry-After', String(err.extra.retryAfterSec ?? 60));
    sendJson(res, err.status, { error: err.message, ...(err.extra.errors ? { errors: err.extra.errors } : {}) });
    return;
  }
  log.error(err);
  sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
}
