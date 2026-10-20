# Evently: GenAI Event Planning Assistant

> Built for **PromptWars Virtual**. Describe a wedding, birthday or community event in your own words and get a complete, personalised plan: **budget split, timeline, vendor checklist and ideas**, plus an AI planner you can ask follow-up questions.

## The problem

Planning an event means juggling money, deadlines and a dozen vendors, usually in scattered notes. Generic checklists ignore your date, budget, city and traditions; pure chatbots invent numbers. Evently combines the two: **deterministic planning maths you can trust** plus **Gemini for understanding you and for the creative, personal parts**.

## Two ways in

| Page | URL | What it's for |
|---|---|---|
| **Evently** (React) | `/` | Landing page with a video hero and a frosted-glass prompt card. Type *"120-guest wedding in Kolkata this February, we love marigolds, under ₹15 lakh"* and Gemini turns it into structured details, asks only for what's missing (e.g. the exact date), then shows the full plan. |
| **Classic planner** | `/classic/` | Form-based planner with spend tracking, tick-off checklists, `.ics` export, print view and the "Ask AI" chat. |

Both use the same API and the same planning engine.

## What it does

| Feature | How |
|---|---|
| **Natural-language input** (Gemini) | Free text is parsed into event type, date, guests, budget, currency, city, theme and notes. Fields it can't infer are listed as `missing`, so the UI asks for just those. |
| **Budget split** | Category allocation per event type, weighted towards up to 3 priorities. Uses the largest-remainder method so the parts **always add up exactly** to your total. |
| **Timeline** | Milestones counted back from your event date. Short on time? The timeline is **compressed** (near-event tasks keep their real offsets, earlier ones are squeezed) so nothing lands in the past. |
| **Vendor checklist** | Who to book, a book-by date, each vendor's budget share, and the **questions to ask** before signing. |
| **Personalised ideas** (Gemini) | Theme ideas, a run of show, tips, ways to save and risks, tailored to your theme, city, guest count, traditions and dietary notes. |
| **Ask the planner** (Gemini) | Follow-up questions ("What should I book this week?") answered with your plan as context. |
| **Google integrations** | **Google Calendar** reminders for milestones, **Google Maps** vendor search near your city, `.ics` export. |

## How GenAI is used (and kept honest)

- **Gemini API** (`gemini-flash-latest` by default, override with `GEMINI_MODEL`) with **structured output** (`responseSchema`), so responses are typed JSON and never scraped prose.
- **Model fallback:** if the main model is overloaded, rate limited or doesn't answer within 15 s, the request moves to `gemini-flash-lite-latest` (configure with `GEMINI_FALLBACK_MODELS`). The UI shows which model answered.
- **Numbers never come from the model.** Budgets, dates and per-guest figures are computed server-side; the model gets them as context and is told not to invent prices, businesses or URLs.
- **Prompt-injection guard:** user text is passed as a JSON *data* brief, and the system prompt tells the model to treat it as data, not instructions.
- **Output validation:** AI output is re-validated with the same rules as the form. If it's malformed or Gemini is down, plans fall back to **curated ideas**, labelled honestly in the UI.
- **Caching:** identical parse and plan requests reuse the previous Gemini response for an hour (TTL + LRU cache).

## Architecture

```
web/               Evently page: React + TypeScript + Vite + Tailwind + lucide-react
  src/components/  Hero (video, nav, glass prompt card), PlanSection (results)
  src/lib/         planner.ts: parse -> ask for missing details -> plan
public/            Classic planner (framework-free HTML/CSS/JS), served at /classic/
src/
  templates.js     Planning knowledge: budget splits, milestones, vendors per event type
  planner.js       Deterministic budget allocation, timeline compression, vendor dates
  validate.js      Input validation & sanitisation
  parse.js         Free text -> plan input via Gemini structured output
  ideas.js         Prompts, response schema, AI output sanitiser, curated fallback
  gemini.js        Minimal Gemini REST client (key in header, timeout, model fallback)
  dates.js         Timezone-safe calendar-day maths
server.js          node:http server: API, static files (gzip, ETag, immutable hashed assets), security headers, rate limiting
test/              82 tests using node:test (no test dependencies)
```

**Zero runtime dependencies on the server.** It uses only Node built-ins, which keeps the attack surface small, cold starts fast and the image tiny. The React page is compiled to static files at build time.

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + whether AI is enabled |
| `GET` | `/api/config` | Event types, budget categories, currencies |
| `POST` | `/api/parse` | Body: `{ text }` (≤ 600 chars) → `{ input, missing }` (requires Gemini) |
| `POST` | `/api/plan` | Body: `{ eventType, date, guests, budget, currency, location?, theme?, notes?, priorities? }` → `{ plan }` |
| `POST` | `/api/ask` | Body: `{ input, question }` → `{ answer }` (requires Gemini) |

## Security

- Gemini API key is **server-side only** (env var / Secret Manager), sent in the `x-goog-api-key` header, never in URLs or to the browser.
- Strict **Content-Security-Policy** (`script-src 'self'`, no inline scripts; media only from the hero video's origin), `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer and Permissions policies.
- **Input validation** on every field: types, ranges, allow-lists, length caps, control and bidi character stripping.
- **Request limits:** 16 KB JSON bodies, `application/json` only, per-IP rate limiting (20 requests/min) with `Retry-After`.
- Static files are preloaded from `web/dist` and `public/` only, so path traversal is impossible by construction.
- Upstream error bodies are never echoed to clients; Google's error reason goes to server logs only.

## Accessibility

Semantic landmarks, labelled inputs, linked error messages, keyboard-operable controls with visible focus, live regions for progress, `prefers-reduced-motion`, responsive down to 375 px. The classic planner adds WAI-ARIA tabs, dark mode and print styles.

## Run locally

Requires **Node.js 22+**.

```bash
cp .env.example .env      # add your GEMINI_API_KEY
npm run setup             # install the Evently page's build tools (web/)
npm run build             # build Evently into web/dist
npm run dev               # http://localhost:8080 (Evently at /, classic at /classic/)
npm test                  # 82 tests
```

While working on the React page, run `npm run dev:web` too: Vite serves it with hot reload and proxies `/api` to the server on port 8787 (set `EVENTWISE_API` to change that).

Without a key, the classic planner still works with curated ideas; the Evently prompt card needs Gemini to read free text.

## Deploy to Google Cloud Run

```bash
# one-time: store the key in Secret Manager
printf "%s" "YOUR_GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=-

gcloud run deploy evently \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Cloud Run builds the included multi-stage `Dockerfile`: stage 1 builds the React page, stage 2 is Node 22 Alpine running the server as a non-root user. `K_SERVICE` is detected automatically so client IPs come from `X-Forwarded-For` for rate limiting, and logs are structured JSON for Cloud Logging.

## Google services used

- **Gemini API** (Google AI): free-text parsing, personalised ideas and the Q&A assistant
- **Google Cloud Run**: hosting; **Secret Manager**: API key; **Cloud Logging**: structured request logs
- **Google Calendar**: event-template links for milestones and booking reminders
- **Google Maps**: vendor search near the event city
- **Google Fonts**: Geist and Special Elite (Evently), Fraunces and Inter (classic)

## Assumptions

- Budget splits are sensible starting points, not quotes. Users should confirm prices with vendors.
- Dates are calendar days (UTC-safe); times in the AI run of show are suggestions.
- Plans and progress stay in the user's browser (no accounts, no personal data stored server-side).
