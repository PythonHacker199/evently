# EventWise: GenAI Event Planning Assistant

> Built for **PromptWars Virtual**. A planning partner that turns a few details about a wedding, birthday or community event into a complete, personalised plan: **budget split, timeline, vendor checklist and ideas**, plus an AI planner you can ask follow-up questions.

## The problem

Planning an event means juggling money, deadlines and a dozen vendors, usually in scattered notes. Generic checklists ignore your date, budget, city and traditions; pure chatbots invent numbers. EventWise combines the two: **deterministic planning maths you can trust** plus **Gemini for the creative, personal parts**.

## What it does

| Feature | How |
|---|---|
| **Budget split** | Category allocation per event type, weighted towards up to 3 priorities you pick. Uses the largest-remainder method so the parts **always add up exactly** to your total. Track actual spend per category with live over/under status. |
| **Timeline** | Milestones counted back from your event date. If you're short on time, the timeline is **compressed intelligently** (near-event tasks keep their real offsets, earlier ones are squeezed) so nothing lands in the past. |
| **Vendor checklist** | Who to book, a book-by date, the budget share for each vendor, and the **questions to ask** before signing. |
| **Personalised ideas** (Gemini) | Theme ideas, a sample run of show, tips, ways to save and risks, tailored to your theme, city, guest count, traditions and dietary notes. |
| **Ask the planner** (Gemini) | Follow-up questions ("What should I book this week?", "Rainy-day backup?") answered with your plan as context. |
| **Google integrations** | One-click **Google Calendar** reminders for every milestone, **Google Maps** vendor search near your city, `.ics` export of the whole plan. |
| **Progress tracking** | Tick off tasks and bookings; progress and spend persist in your browser. |

## How GenAI is used (and kept honest)

- **Gemini via the Gemini API** (`gemini-flash-latest` by default, override with `GEMINI_MODEL`) with **structured output** (`responseSchema`), so responses are typed JSON and never scraped prose.
- **Model fallback:** if the main model is overloaded or rate limited (429/5xx), the request is retried on `gemini-flash-lite-latest` (configure with `GEMINI_FALLBACK_MODELS`). The UI shows which model answered.
- **Numbers never come from the model.** Budgets, dates and per-guest figures are computed server-side; the model gets them as context and is instructed not to invent prices, businesses or URLs.
- **Prompt-injection guard:** user text is passed as a JSON *data* brief, and the system prompt tells the model to treat it as data, not instructions.
- **Output validation:** AI output is sanitised (markdown stripped, lengths capped, invalid items dropped). If it's malformed or Gemini is down, the app **falls back to curated ideas** and labels them honestly in the UI.
- **Caching:** identical plan requests reuse the previous Gemini response for an hour (TTL + LRU cache), which saves tokens and latency.

## Architecture

```
public/            Static, framework-free UI (HTML + CSS + ES module)
  index.html       Accessible form + tabbed results
  app.js           Rendering (DOM APIs only, no innerHTML), localStorage progress, .ics export
  styles.css       Light/dark themes, responsive, print styles
src/
  templates.js     Planning knowledge: budget splits, milestones, vendors per event type
  planner.js       Deterministic budget allocation, timeline compression, vendor dates
  validate.js      Input validation & sanitisation
  ideas.js         Prompts, response schema, AI output sanitiser, curated fallback
  gemini.js        Minimal Gemini REST client (key in header, timeout, error mapping)
  dates.js         Timezone-safe calendar-day maths
server.js          node:http server: API, static files (gzip + ETag), security headers, rate limiting
test/              56 tests using node:test (no test dependencies)
```

**Zero runtime dependencies.** The server uses only Node built-ins, which keeps the attack surface small, cold starts fast and the image tiny.

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + whether AI is enabled |
| `GET` | `/api/config` | Event types, budget categories, currencies |
| `POST` | `/api/plan` | Body: `{ eventType, date, guests, budget, currency, location?, theme?, notes?, priorities? }` → `{ plan }` |
| `POST` | `/api/ask` | Body: `{ input, question }` → `{ answer }` (requires Gemini) |

## Security

- Gemini API key is **server-side only** (env var / Secret Manager), sent in the `x-goog-api-key` header, never in URLs or to the browser.
- Strict **Content-Security-Policy** (`script-src 'self'`, no inline scripts or styles), `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer and Permissions policies.
- **Input validation** on every field: types, ranges, allow-lists, length caps, control and bidi character stripping.
- **Request limits:** 16 KB JSON bodies, `application/json` only, per-IP rate limiting (20 requests/min) with `Retry-After`.
- Static files are preloaded from `public/` only, so path traversal is impossible by construction.
- Upstream error bodies are never echoed to clients. The frontend renders with `textContent` only (no XSS sinks).

## Accessibility

Semantic landmarks, skip link, labelled fields with linked error messages (`aria-invalid`, `aria-describedby`), WAI-ARIA tabs with arrow-key navigation, live regions for status updates, visible focus rings, 44px touch targets, dark mode via `prefers-color-scheme`, `prefers-reduced-motion`, and print-friendly output. The colour palette was chosen for WCAG AA contrast in both themes.

## Run locally

Requires **Node.js 22+**.

```bash
cp .env.example .env      # add your GEMINI_API_KEY (optional; the app works without it)
npm run dev               # http://localhost:8080
npm test                  # 56 tests
```

Without a key, everything works except Gemini ideas and the Ask tab: curated ideas are shown and clearly labelled.

## Deploy to Google Cloud Run

```bash
# one-time: store the key in Secret Manager
printf "%s" "YOUR_GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=-

gcloud run deploy eventwise \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Cloud Run builds the included `Dockerfile` (Node 22 Alpine, non-root user). `K_SERVICE` is detected automatically so client IPs are read from `X-Forwarded-For` for rate limiting, and logs are emitted as structured JSON for Cloud Logging.

## Google services used

- **Gemini API** (Google AI): ideas and the Q&A assistant
- **Google Cloud Run**: hosting; **Secret Manager**: API key; **Cloud Logging**: structured request logs
- **Google Calendar**: event-template links for milestones and booking reminders
- **Google Maps**: vendor search near the event city
- **Google Fonts**: Fraunces and Inter

## Assumptions

- Budget splits are sensible starting points, not quotes. Users should confirm prices with vendors.
- Dates are calendar days (UTC-safe); times in the AI run of show are suggestions.
- Plans and progress stay in the user's browser (no accounts, no personal data stored server-side).
