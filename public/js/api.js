// JSON API client for the Evently server.

/**
 * GET (no body) or POST JSON. Errors carry the server's message plus `status` and field `errors`.
 * @param {string} url
 * @param {object} [body]
 */
export async function api(url, body) {
  const res = await fetch(
    url,
    body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined,
  );
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    Object.assign(err, { status: res.status, errors: data.errors });
    throw err;
  }
  return data;
}
