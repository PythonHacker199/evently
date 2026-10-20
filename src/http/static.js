/**
 * Static file serving: every file is read into memory once at startup (the site is tiny),
 * pre-gzipped and given an ETag. Only preloaded paths can ever be served, so path traversal
 * is impossible by construction.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

/** URL prefix of the classic form-based planner, served next to the Evently page. */
export const CLASSIC_PREFIX = '/classic';

/** @type {Readonly<Record<string, string>>} */
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt']);
const ONE_YEAR_SECONDS = 31_536_000;

/** @typedef {{ body: Buffer, gzip: Buffer | null, type: string, etag: string, immutable: boolean }} StaticFile */
/** @typedef {Map<string, StaticFile>} StaticFiles */

/**
 * Read every servable file under `dir` into memory.
 * @param {string} dir
 * @param {string} [prefix] URL prefix to mount the files under, e.g. "/classic"
 * @returns {Promise<StaticFiles>}
 */
export async function loadStatic(dir, prefix = '') {
  /** @type {StaticFiles} */
  const files = new Map();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const type = MIME[ext];
    if (!type) continue;
    const full = path.join(entry.parentPath, entry.name);
    const body = await readFile(full);
    const relative = '/' + path.relative(dir, full).split(path.sep).join('/');
    files.set(prefix + relative, {
      body,
      gzip: COMPRESSIBLE.has(ext) ? gzipSync(body) : null,
      type,
      etag: `"${createHash('sha1').update(body).digest('base64url')}"`,
      // Vite puts content-hashed files under /assets/, so their URL changes whenever they do.
      immutable: relative.startsWith('/assets/'),
    });
  }
  return files;
}

/**
 * Like loadStatic, but returns null when the directory does not exist (e.g. the Evently page
 * has not been built in a fresh clone).
 * @param {string | null} dir
 * @returns {Promise<StaticFiles | null>}
 */
export async function loadOptionalStatic(dir) {
  if (!dir) return null;
  try {
    return await loadStatic(dir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Mount the Evently build at "/" and the classic planner at CLASSIC_PREFIX.
 * Without an Evently build, the classic planner is served at "/" as well.
 * @param {{ publicDir: string, webDir: string | null, log: Pick<Console, 'warn'> }} opts
 * @returns {Promise<StaticFiles>}
 */
export async function loadSite({ publicDir, webDir, log }) {
  const web = await loadOptionalStatic(webDir);
  if (!web && webDir) log.warn(`Evently build not found at ${webDir}; serving the classic planner at /. Run "npm run build".`);
  const root = web ?? (await loadStatic(publicDir));
  return new Map([...root, ...(await loadStatic(publicDir, CLASSIC_PREFIX))]);
}

/**
 * Serve a preloaded file with ETag revalidation and gzip when the client accepts it.
 * @param {StaticFiles} files
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 */
export function serveStatic(files, req, res, pathname) {
  if (pathname === CLASSIC_PREFIX) {
    // Relative asset URLs in the classic page need the trailing slash.
    res.writeHead(301, { Location: `${CLASSIC_PREFIX}/` });
    res.end();
    return;
  }
  const file = files.get(pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const headers = {
    'Content-Type': file.type,
    ETag: file.etag,
    // Hashed build assets can be cached forever; everything else revalidates (a 304 when unchanged).
    'Cache-Control': file.immutable ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache',
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const gzip = file.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) ? file.gzip : null;
  const body = gzip ?? file.body;
  res.writeHead(200, { ...headers, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}
