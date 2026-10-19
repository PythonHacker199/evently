// EventWise client. All rendering uses textContent / DOM APIs (never innerHTML) so user and
// AI text can't inject markup. Plan and progress are kept in localStorage only.

const STORAGE_KEY = 'eventwise:v1';
const MAX_SAVED_PROGRESS = 10;
const MAX_PRIORITIES = 3;
const DAY_MS = 86_400_000;
const EVENT_EMOJI = { wedding: '💍', birthday: '🎂', community: '🤝' };
const ASK_SUGGESTIONS = [
  'What should I book this week?',
  'How can I cut 10% from the budget?',
  'Give me a rainy-day backup plan',
  'Suggest a menu that fits our notes',
];

/** @param {string} sel */
const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

/**
 * Tiny element builder. `text` sets textContent; `on*` attaches listeners.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// ---------- State & storage ----------

const state = {
  /** @type {any} */ config: null,
  /** @type {any} */ plan: null,
  aiEnabled: false,
  /** @type {{ role: 'user' | 'ai', text: string }[]} */ chat: [],
  store: loadStore(),
};

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (data && typeof data === 'object') return { plan: data.plan ?? null, progress: data.progress ?? {} };
  } catch {
    /* storage unavailable or corrupted: start fresh */
  }
  return { plan: null, progress: {} };
}

function saveStore() {
  try {
    const ids = Object.keys(state.store.progress);
    if (ids.length > MAX_SAVED_PROGRESS) {
      for (const id of ids.slice(0, ids.length - MAX_SAVED_PROGRESS)) delete state.store.progress[id];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  } catch {
    /* private mode or quota: the app still works for this session */
  }
}

/** @returns {{ tasks: Record<string, boolean>, vendors: Record<string, boolean>, actual: Record<string, number> }} */
function progress() {
  const id = state.plan.id;
  state.store.progress[id] ??= { tasks: {}, vendors: {}, actual: {} };
  return state.store.progress[id];
}

// ---------- Formatting ----------

function todayUTC() {
  const t = new Date();
  return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
}

/** @param {string} iso */
function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** @param {string} iso */
const daysFromToday = (iso) => Math.round((isoToUTC(iso) - todayUTC()) / DAY_MS);

/** @param {number} ms */
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);

/** @param {string} iso */
function fmtDate(iso) {
  return new Date(isoToUTC(iso)).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
/** @param {number} days */
function relDays(days) {
  if (Math.abs(days) >= 60) return rtf.format(Math.round(days / 30), 'month');
  if (Math.abs(days) >= 14) return rtf.format(Math.round(days / 7), 'week');
  return rtf.format(days, 'day');
}

/** @param {number} n */
function money(n) {
  const currency = state.plan?.budget.currency ?? 'INR';
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

/** @param {number} n */
const num = (n) => new Intl.NumberFormat().format(n);

// ---------- Google links (no API key needed) ----------

/** @param {string} title @param {string} iso @param {string} details */
function googleCalendarUrl(title, iso, details) {
  const start = iso.replaceAll('-', '');
  const end = toISO(isoToUTC(iso) + DAY_MS).replaceAll('-', '');
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE', text: title, dates: `${start}/${end}`, details,
  })}`;
}

/** @param {string} query */
const googleMapsUrl = (query) => `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;

/** @param {string} href @param {string} text @param {string} label accessible name */
const extLink = (href, text, label) =>
  h('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${label} (opens in a new tab)`, text });

// ---------- API ----------

/** @param {string} url @param {object} [body] */
async function api(url, body) {
  const res = await fetch(url, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
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

// ---------- Form ----------

const form = /** @type {HTMLFormElement} */ ($('#plan-form'));
const formStatus = $('#form-status');

function renderEventTypes() {
  const wrap = $('#event-type-options');
  wrap.replaceChildren(
    ...state.config.eventTypes.map((t, i) =>
      h('div', { class: 'type-option' },
        h('input', { type: 'radio', name: 'eventType', id: `type-${t.key}`, value: t.key, checked: i === 0, required: true }),
        h('label', { for: `type-${t.key}` }, h('span', { class: 'emoji', 'aria-hidden': 'true', text: EVENT_EMOJI[t.key] ?? '🎉' }), t.label),
      ),
    ),
  );
}

/** @param {string[]} [keep] priorities to keep checked */
function renderPriorities(keep = []) {
  const type = state.config.eventTypes.find((t) => t.key === selectedType());
  const wrap = $('#priority-options');
  wrap.replaceChildren(
    ...type.categories.map((c) =>
      h('div', { class: 'chip' },
        h('input', { type: 'checkbox', name: 'priorities', id: `prio-${c.key}`, value: c.key, checked: keep.includes(c.key) }),
        h('label', { for: `prio-${c.key}`, text: c.label }),
      ),
    ),
  );
  enforcePriorityLimit();
}

function enforcePriorityLimit() {
  const boxes = /** @type {HTMLInputElement[]} */ ([...form.querySelectorAll('input[name="priorities"]')]);
  const full = boxes.filter((b) => b.checked).length >= MAX_PRIORITIES;
  for (const b of boxes) b.disabled = full && !b.checked;
}

function selectedType() {
  return /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="eventType"]:checked'))?.value ?? 'wedding';
}

function collectInput() {
  const fd = new FormData(form);
  return {
    eventType: selectedType(),
    title: String(fd.get('title') ?? ''),
    date: String(fd.get('date') ?? ''),
    guests: Number(fd.get('guests')),
    budget: Number(fd.get('budget')),
    currency: String(fd.get('currency') ?? 'INR'),
    location: String(fd.get('location') ?? ''),
    theme: String(fd.get('theme') ?? ''),
    notes: String(fd.get('notes') ?? ''),
    priorities: fd.getAll('priorities').map(String),
  };
}

/** @param {any} input */
function fillForm(input) {
  const radio = /** @type {HTMLInputElement | null} */ (form.querySelector(`#type-${input.eventType}`));
  if (radio) radio.checked = true;
  for (const key of ['title', 'date', 'guests', 'budget', 'currency', 'location', 'theme', 'notes']) {
    const el = /** @type {HTMLInputElement} */ (form.elements.namedItem(key));
    if (el && input[key] != null) el.value = String(input[key]);
  }
  renderPriorities(input.priorities ?? []);
  updateNotesCount();
}

function updateNotesCount() {
  $('#notes-count').textContent = String(/** @type {HTMLTextAreaElement} */ ($('#notes')).value.length);
}

function clearErrors() {
  for (const el of form.querySelectorAll('.field-error')) {
    /** @type {HTMLElement} */ (el).hidden = true;
    el.textContent = '';
  }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
}

/** @param {Record<string, string>} errors */
function showErrors(errors) {
  let first = null;
  for (const [field, message] of Object.entries(errors)) {
    const msg = document.getElementById(`${field}-error`);
    if (msg) {
      msg.textContent = message;
      msg.hidden = false;
    }
    const input = /** @type {HTMLElement | null} */ (
      document.getElementById(field) ?? form.querySelector(`input[name="${field}"]`)
    );
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    }
  }
  first?.focus();
}

/** Fast client-side checks; the server re-validates everything. */
function clientErrors(input) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!input.date) errors.date = 'Choose the event date.';
  else if (daysFromToday(input.date) < 0) errors.date = 'The event date must be today or in the future.';
  if (!Number.isInteger(input.guests) || input.guests < 1) errors.guests = 'Enter how many guests (at least 1).';
  if (!Number.isFinite(input.budget) || input.budget < 1) errors.budget = 'Enter your total budget.';
  return errors;
}

/** @param {SubmitEvent} event */
async function onSubmit(event) {
  event.preventDefault();
  clearErrors();
  const input = collectInput();
  const errors = clientErrors(input);
  if (Object.keys(errors).length) {
    showErrors(errors);
    setStatus(formStatus, 'Please fix the highlighted fields.', 'error');
    return;
  }

  const button = /** @type {HTMLButtonElement} */ ($('#submit-btn'));
  button.disabled = true;
  button.textContent = state.aiEnabled ? 'Planning with Gemini…' : 'Building your plan…';
  $('#results').setAttribute('aria-busy', 'true');
  setStatus(formStatus, 'Building your plan. This can take a few seconds.');

  try {
    const { plan } = await api('/api/plan', input);
    state.plan = plan;
    state.chat = [];
    state.store.plan = plan;
    saveStore();
    renderPlan();
    setStatus(formStatus, `Plan ready: ${plan.timeline.length} milestones and ${plan.vendors.length} vendors.`);
    $('#plan-title').focus();
  } catch (err) {
    if (err.errors) showErrors(err.errors);
    setStatus(formStatus, err.message || 'Could not build the plan.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Generate my plan';
    $('#results').setAttribute('aria-busy', 'false');
  }
}

/** @param {HTMLElement} el @param {string} text @param {'error'} [tone] */
function setStatus(el, text, tone) {
  el.textContent = text;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

// ---------- Tabs ----------

const tabs = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('[role="tab"]')]);

/** @param {HTMLButtonElement} tab @param {boolean} [focus] */
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    /** @type {HTMLElement} */ (document.getElementById(/** @type {string} */ (t.getAttribute('aria-controls')))).hidden = !selected;
  }
  if (focus) tab.focus();
}

function setupTabs() {
  for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab));
  $('#tablist').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length], true);
  });
}

// ---------- Plan rendering ----------

function renderPlan() {
  const { plan } = state;
  const { input } = plan;
  $('#empty-state').hidden = true;
  $('#plan-view').hidden = false;

  $('#plan-eyebrow').textContent = `${EVENT_EMOJI[input.eventType] ?? '🎉'} ${plan.eventLabel} plan`;
  $('#plan-title').textContent = input.title || `Your ${plan.eventLabel.toLowerCase()}`;
  $('#plan-subtitle').textContent = [fmtDate(input.date), `${num(input.guests)} guests`, input.location, input.theme]
    .filter(Boolean)
    .join(' · ');

  const warnings = $('#warnings');
  warnings.replaceChildren(...plan.warnings.map((w) => h('li', { text: w })));
  warnings.hidden = plan.warnings.length === 0;

  renderOverview();
  renderBudget();
  renderTimeline();
  renderVendors();
  renderIdeas();
  renderAsk();
}

function completion() {
  const p = progress();
  const total = state.plan.timeline.length + state.plan.vendors.length;
  const done = state.plan.timeline.filter((m) => p.tasks[m.id]).length + state.plan.vendors.filter((v) => p.vendors[v.key]).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** @param {string} label @param {string} value */
const stat = (label, value) => h('div', { class: 'stat' }, h('p', { class: 'stat-label', text: label }), h('p', { class: 'stat-value', text: value }));

function renderOverview() {
  const { plan } = state;
  const p = progress();
  const days = daysFromToday(plan.input.date);
  const { done, total, pct } = completion();

  const fill = h('div', { class: 'progress-fill' });
  fill.style.width = `${pct}%`;

  const next = plan.timeline
    .filter((m) => m.phase === 'before' && !p.tasks[m.id])
    .slice(0, 3);

  $('#panel-overview').replaceChildren(
    h('div', { class: 'stat-grid' },
      stat('Days to go', days > 0 ? num(days) : days === 0 ? 'Today!' : 'Done'),
      stat('Guests', num(plan.input.guests)),
      stat('Total budget', money(plan.budget.total)),
      stat('Per guest', money(plan.summary.perGuest)),
    ),
    h('div', { class: 'section' },
      h('h4', { text: 'Progress' }),
      h('p', { class: 'muted', id: 'progress-label', text: `${done} of ${total} tasks and bookings done (${pct}%)` }),
      h('div', { class: 'progress-track', role: 'progressbar', 'aria-labelledby': 'progress-label', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, fill),
    ),
    h('div', { class: 'section' },
      h('h4', { text: 'The big picture' }),
      sourceTag(),
      h('p', { text: plan.ideas.summary }),
    ),
    h('div', { class: 'section' },
      h('h4', { text: 'Up next' }),
      next.length
        ? h('ul', { class: 'tip-list' }, next.map((m) => h('li', {}, h('strong', { text: m.title }), ` by ${fmtDate(m.dueDate)} (${relDays(daysFromToday(m.dueDate))})`)))
        : h('p', { class: 'muted', text: 'All pre-event tasks are done. Enjoy the day!' }),
    ),
  );
}

function sourceTag() {
  const { ideas } = state.plan;
  return h('span', {
    class: 'source-tag',
    'data-source': ideas.source,
    text: ideas.source === 'gemini' ? `✨ Personalised by Gemini${ideas.model ? ` (${ideas.model})` : ''}` : 'Curated ideas (AI offline)',
  });
}

function renderBudget() {
  const { plan } = state;
  const p = progress();
  const totalCell = h('td', { class: 'num' });
  const actualTotalCell = h('td', { class: 'num' });
  const remainingTotalCell = h('td', { class: 'num' });

  /** @type {Map<string, HTMLElement>} */
  const diffCells = new Map();

  function refreshTotals() {
    const spent = plan.budget.categories.reduce((s, c) => s + (p.actual[c.key] || 0), 0);
    totalCell.textContent = money(plan.budget.total);
    actualTotalCell.textContent = money(spent);
    const left = plan.budget.total - spent;
    remainingTotalCell.textContent = left < 0 ? `${money(-left)} over` : `${money(left)} left`;
    remainingTotalCell.className = `num ${left < 0 ? 'diff-over' : ''}`;
    for (const c of plan.budget.categories) {
      const cell = /** @type {HTMLElement} */ (diffCells.get(c.key));
      const actual = p.actual[c.key];
      if (!actual) {
        cell.textContent = '–';
        cell.className = 'num';
        continue;
      }
      const diff = c.amount - actual;
      cell.textContent = diff < 0 ? `${money(-diff)} over` : `${money(diff)} left`;
      cell.className = `num ${diff < 0 ? 'diff-over' : 'diff-under'}`;
    }
  }

  const rows = plan.budget.categories.map((c) => {
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = `${Math.min(100, c.pct)}%`;
    const inputId = `actual-${c.key}`;
    const diff = h('td', { class: 'num' });
    diffCells.set(c.key, diff);
    return h('tr', {},
      h('th', { scope: 'row' }, c.label, c.priority ? h('span', { class: 'priority-pill', text: 'priority' }) : null, h('div', { class: 'bar', 'aria-hidden': 'true' }, fill)),
      h('td', { class: 'num', text: `${c.pct}%` }),
      h('td', { class: 'num', text: money(c.amount) }),
      h('td', { class: 'num' },
        h('label', { for: inputId, class: 'visually-hidden', text: `Actual spent on ${c.label}` }),
        h('input', {
          id: inputId, type: 'number', inputmode: 'numeric', min: 0, step: 1, placeholder: '0',
          value: p.actual[c.key] ?? '',
          oninput: (/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.target).value);
            if (Number.isFinite(v) && v > 0) p.actual[c.key] = Math.round(v);
            else delete p.actual[c.key];
            saveStore();
            refreshTotals();
          },
        }),
      ),
      diff,
    );
  });

  $('#panel-budget').replaceChildren(
    h('p', { class: 'muted', text: 'Suggested split of your budget. Track what you actually spend as you book; it is saved in this browser.' }),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'budget-table' },
        h('caption', { class: 'visually-hidden', text: 'Budget by category: share, planned amount, actual spend and remaining' }),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', text: 'Category' }),
          h('th', { scope: 'col', class: 'num', text: 'Share' }),
          h('th', { scope: 'col', class: 'num', text: 'Planned' }),
          h('th', { scope: 'col', class: 'num', text: 'Actual' }),
          h('th', { scope: 'col', class: 'num', text: 'Status' }),
        )),
        h('tbody', {}, rows),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', text: 'Total' }), h('td', { class: 'num', text: '100%' }), totalCell, actualTotalCell, remainingTotalCell)),
      ),
    ),
    h('p', { class: 'hint', text: 'Amounts are rounded so they add up exactly to your total. Priorities you chose get a bigger share.' }),
  );
  refreshTotals();
}

/**
 * One checklist row (timeline task or vendor booking).
 * @param {{ id: string, checked: boolean, title: string, srSuffix?: string, meta: (string | Node)[], detail?: string, extra?: Node[], links?: Node[], className?: string, onToggle: (checked: boolean) => void }} o
 */
function checkItem(o) {
  const li = h('li', { class: `check-item ${o.checked ? 'done' : ''} ${o.className ?? ''}` });
  const box = h('input', {
    type: 'checkbox', id: o.id, checked: o.checked,
    onchange: (/** @type {Event} */ e) => {
      const checked = /** @type {HTMLInputElement} */ (e.target).checked;
      li.classList.toggle('done', checked);
      o.onToggle(checked);
      saveStore();
      renderOverview();
    },
  });
  li.append(
    box,
    h('label', { for: o.id, class: 'title' }, o.title, o.srSuffix ? h('span', { class: 'visually-hidden', text: o.srSuffix }) : null),
    h('div', { class: 'body' },
      h('div', { class: 'meta' }, o.meta),
      o.detail ? h('p', { class: 'detail', text: o.detail }) : null,
      o.extra ?? [],
      o.links?.length ? h('div', { class: 'links' }, o.links) : null,
    ),
  );
  return li;
}

/** @param {string} iso @param {boolean} done */
function dueMeta(iso, done) {
  const d = daysFromToday(iso);
  const urgent = !done && d <= 7;
  return h('span', { class: urgent ? 'due-soon' : '' }, `${fmtDate(iso)} · ${d < 0 && !done ? 'overdue, ' : ''}${relDays(d)}`);
}

function renderTimeline() {
  const { plan } = state;
  const p = progress();
  const eventName = plan.input.title || plan.eventLabel;
  $('#panel-timeline').replaceChildren(
    h('p', { class: 'muted', text: 'Milestones counted back from your event date. Tick them off as you go, or add them to Google Calendar.' }),
    h('ol', { class: 'checklist' },
      plan.timeline.map((m) =>
        checkItem({
          id: `task-${m.id}`,
          checked: Boolean(p.tasks[m.id]),
          title: m.title,
          className: m.phase === 'event' ? 'phase-event' : '',
          meta: [dueMeta(m.dueDate, Boolean(p.tasks[m.id]))],
          detail: m.detail,
          links: [extLink(googleCalendarUrl(`${eventName}: ${m.title}`, m.dueDate, m.detail), 'Add to Google Calendar', `Add “${m.title}” to Google Calendar`)],
          onToggle: (checked) => {
            if (checked) p.tasks[m.id] = true;
            else delete p.tasks[m.id];
          },
        }),
      ),
    ),
  );
}

function renderVendors() {
  const { plan } = state;
  const p = progress();
  const eventName = plan.input.title || plan.eventLabel;
  $('#panel-vendors').replaceChildren(
    h('p', { class: 'muted', text: plan.input.location
      ? `Who to book and by when. “Find nearby” searches Google Maps around ${plan.input.location}.`
      : 'Who to book and by when. Add a city to get Google Maps search links.' }),
    h('ul', { class: 'checklist' },
      plan.vendors.map((v) => {
        const booked = Boolean(p.vendors[v.key]);
        const links = [extLink(googleCalendarUrl(`Book ${v.name} (${eventName})`, v.bookBy, v.questions.join('\n')), 'Remind me', `Add a reminder to book ${v.name} to Google Calendar`)];
        if (v.mapsQuery) links.unshift(extLink(googleMapsUrl(v.mapsQuery), 'Find nearby on Google Maps', `Find ${v.name} near ${plan.input.location} on Google Maps`));
        return checkItem({
          id: `vendor-${v.key}`,
          checked: booked,
          title: v.name,
          srSuffix: ' (mark as booked)',
          meta: [h('span', {}, 'Book by ', dueMeta(v.bookBy, booked)), h('span', { text: `Budget ≈ ${money(v.allocated)}` })],
          extra: [h('details', {}, h('summary', { text: 'Questions to ask' }), h('ul', {}, v.questions.map((q) => h('li', { text: q }))))],
          links,
          onToggle: (checked) => {
            if (checked) p.vendors[v.key] = true;
            else delete p.vendors[v.key];
          },
        });
      }),
    ),
  );
}

/** @param {string} title @param {string[]} items */
function listSection(title, items) {
  if (!items?.length) return null;
  return h('div', { class: 'section' }, h('h4', { text: title }), h('ul', { class: 'tip-list' }, items.map((t) => h('li', { text: t }))));
}

function renderIdeas() {
  const { ideas } = state.plan;
  $('#panel-ideas').replaceChildren(
    sourceTag(),
    ideas.notice ? h('p', { class: 'muted', text: ideas.notice }) : null,
    h('div', { class: 'section' },
      h('h4', { text: 'Ideas for your event' }),
      h('div', { class: 'idea-grid' }, ideas.themeIdeas.map((i) => h('article', { class: 'idea-card' }, h('h5', { text: i.title }), h('p', { text: i.description })))),
    ),
    ideas.agenda?.length
      ? h('div', { class: 'section' },
          h('h4', { text: 'Sample run of show' }),
          h('ol', { class: 'agenda' }, ideas.agenda.map((a) => h('li', {}, h('span', { class: 'time', text: a.time }), h('span', { text: a.activity })))),
        )
      : null,
    listSection('Tips for you', ideas.personalizedTips),
    listSection('Ways to save', ideas.savingTips),
    listSection('Watch out for', ideas.risks),
  );
}

// ---------- Ask the planner ----------

function renderChat() {
  $('#chat-log').replaceChildren(
    ...state.chat.map((m) =>
      h('li', { class: `msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}` }, h('span', { class: 'who', text: m.role === 'user' ? 'You' : 'EventWise' }), m.text),
    ),
  );
}

function renderAsk() {
  const disabled = !state.aiEnabled;
  const question = /** @type {HTMLTextAreaElement} */ ($('#question'));
  question.disabled = disabled;
  /** @type {HTMLButtonElement} */ ($('#ask-btn')).disabled = disabled;
  $('#ask-suggestions').replaceChildren(
    ...ASK_SUGGESTIONS.map((s) =>
      h('button', {
        type: 'button', class: 'chip-btn', disabled, text: s,
        onclick: () => {
          question.value = s;
          /** @type {HTMLFormElement} */ ($('#ask-form')).requestSubmit();
        },
      }),
    ),
  );
  setStatus($('#ask-status'), disabled ? 'The AI assistant needs a Gemini API key on the server. Everything else works offline.' : '');
  renderChat();
}

/** @param {SubmitEvent} event */
async function onAsk(event) {
  event.preventDefault();
  const question = /** @type {HTMLTextAreaElement} */ ($('#question'));
  const text = question.value.trim();
  const status = $('#ask-status');
  if (text.length < 3) {
    setStatus(status, 'Type a question first.', 'error');
    question.focus();
    return;
  }
  const button = /** @type {HTMLButtonElement} */ ($('#ask-btn'));
  button.disabled = true;
  state.chat.push({ role: 'user', text });
  renderChat();
  question.value = '';
  setStatus(status, 'Thinking…');
  try {
    const { answer } = await api('/api/ask', { input: state.plan.input, question: text });
    state.chat.push({ role: 'ai', text: answer });
    renderChat();
    setStatus(status, '');
  } catch (err) {
    setStatus(status, err.message || 'The assistant could not answer.', 'error');
  } finally {
    button.disabled = !state.aiEnabled;
  }
}

// ---------- Calendar export ----------

/** @param {string} s */
const icsEscape = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold long lines at 73 chars as RFC 5545 requires (continuation lines start with a space). */
const icsFold = (/** @type {string} */ line) => line.match(/.{1,73}/gu)?.join('\r\n ') ?? line;

function downloadIcs() {
  const { plan } = state;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = plan.input.title || plan.eventLabel;
  /** @param {string} uid @param {string} iso @param {string} summary @param {string} desc */
  const vevent = (uid, iso, summary, desc) => [
    'BEGIN:VEVENT',
    `UID:${uid}-${plan.id}@eventwise`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${iso.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${toISO(isoToUTC(iso) + DAY_MS).replaceAll('-', '')}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    'END:VEVENT',
  ];
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EventWise//Planner//EN', 'CALSCALE:GREGORIAN',
    ...plan.timeline.flatMap((m) => vevent(m.id, m.dueDate, `${name}: ${m.title}`, m.detail)),
    ...plan.vendors.flatMap((v) => vevent(`vendor-${v.key}`, v.bookBy, `${name}: book ${v.name}`, v.questions.join('\n'))),
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.map(icsFold).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'event'}-plan.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Boot ----------

function setDateBounds() {
  const date = /** @type {HTMLInputElement} */ ($('#date'));
  const today = todayUTC();
  date.min = toISO(today);
  date.max = toISO(today + 3 * 365 * DAY_MS);
  if (!date.value || daysFromToday(date.value) < 0) date.value = toISO(today + 120 * DAY_MS);
}

async function init() {
  setupTabs();
  const badge = $('#ai-status');
  try {
    state.config = await api('/api/config');
  } catch {
    badge.dataset.state = 'error';
    badge.textContent = 'Server unavailable';
    setStatus(formStatus, 'Could not reach the EventWise server. Please refresh the page.', 'error');
    return;
  }
  state.aiEnabled = Boolean(state.config.ai?.enabled);
  badge.dataset.state = state.aiEnabled ? 'on' : 'off';
  badge.textContent = state.aiEnabled ? 'Gemini AI connected' : 'AI offline: curated ideas';

  $('#currency').replaceChildren(...state.config.currencies.map((c) => h('option', { value: c, text: c })));
  renderEventTypes();
  renderPriorities();

  form.addEventListener('submit', onSubmit);
  form.addEventListener('change', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.name === 'eventType') renderPriorities();
    if (target.name === 'priorities') enforcePriorityLimit();
  });
  $('#notes').addEventListener('input', updateNotesCount);
  $('#ask-form').addEventListener('submit', onAsk);
  $('#ics-btn').addEventListener('click', downloadIcs);
  $('#print-btn').addEventListener('click', () => window.print());

  if (state.store.plan?.id && state.store.plan?.input) {
    state.plan = state.store.plan;
    fillForm(state.plan.input);
    renderPlan();
    setStatus(formStatus, 'Restored your last plan from this browser.');
  }
  setDateBounds();
}

init();
