// Tiny DOM helpers. Everything is built with DOM APIs and textContent (never innerHTML),
// so user- and AI-supplied text can't inject markup.

/** @param {string} selector */
export const $ = (selector) => /** @type {HTMLElement} */ (document.querySelector(selector));

/**
 * Element builder. `text` sets textContent; `on*` attributes attach listeners;
 * `false`, `null` and `undefined` attributes and children are skipped.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/**
 * Link that opens in a new tab, with an accessible name that says so.
 * @param {string} href
 * @param {string} text
 * @param {string} label accessible name
 */
export function extLink(href, text, label) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${label} (opens in a new tab)`, text });
}
