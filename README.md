# PromptCompiler aka InstaPrompt

> A Grammarly-style browser extension that compiles casual vibe-coding notes into fully structured, machine-readable AI prompts — without ever leaving your text box.

---

## What It Does

You type naturally:

```
build a dark mode toggle, use react, deploy to vercel
```

PromptCompiler detects distinct **clauses**, highlights them in color-coded underlines, expands each one behind the scenes, lets you accept them section-by-section with `Tab`, then assembles a single coherent prompt with `Cmd+Enter`.

The result is a fully structured prompt ready to paste into Claude, ChatGPT, Cursor, or any AI tool — with zero context switching.

---

## Docs

| File | Contents |
|---|---|
| [`docs/UX_FLOW.md`](docs/UX_FLOW.md) | Full UX interaction model, hotkey map, state transitions |
| [`docs/CLAUSE_PIPELINE.md`](docs/CLAUSE_PIPELINE.md) | The 8-step clause detection + expansion pipeline |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview, all layers, tech decisions |
| [`docs/EXTENSION.md`](docs/EXTENSION.md) | Chrome extension deep-dive (MV3, content scripts, SW) |
| [`docs/BACKEND_API.md`](docs/BACKEND_API.md) | API endpoints, rate limiting, streaming |
| [`docs/DATA_MODELS.md`](docs/DATA_MODELS.md) | Postgres schema, Redis usage |
| [`docs/LLM_ROUTING.md`](docs/LLM_ROUTING.md) | Model selection, tier routing, cost model |

---

## Monorepo Structure

```
promptcompiler/
├── extension/          # Chrome extension (WXT + TypeScript)
│   ├── src/
│   │   ├── background/ # Service worker — API proxy, auth, state
│   │   ├── content/    # Content scripts — DOM, ghost text, hotkeys
│   │   ├── popup/      # Popup UI — React + Vite (mode, account, history/templates)
│   │   └── lib/        # Client-only helpers (e.g. prompt-history.ts)
│   ├── tests/e2e/      # Playwright suite against the REAL live backend
│   ├── wxt.config.ts
│   └── manifest.json
│
├── backend/            # API server (Bun + Hono + TypeScript)
│   └── src/
│       ├── routes/     # /enhance  /segment  /bind  /auth  /projects  /account
│       ├── services/   # llm.ts  context.ts  supabase.ts  rateLimit.ts  prompts/
│       └── middleware/ # auth.ts  ratelimit.ts  tier.ts
│
├── packages/core/      # Extracted pure-TS canonical-ordering + adapter/transport contracts
│
├── e2e/                # Playwright suite against a hermetic MOCK backend (CI-safe)
│
├── web/                # Account dashboard (React + Vite)
│   └── src/
│       ├── pages/      # Login, Dashboard, Projects, Billing
│       └── components/
│
├── human/              # Dated review/orientation docs — check for a "SUPERSEDED" banner
│                        # before trusting any file here; see human/06_FABLE_PASS_REPORT.md
│                        # and handoff.md for current status
│
└── docs/               # Architecture + planning docs, including docs/agent_plans/v3/
                         # for the current v1 direction (multi-surface + write mode)
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension build | [WXT](https://wxt.dev) + TypeScript |
| Extension popup | React 19 + Vite |
| Backend runtime | Bun + [Hono](https://hono.dev) |
| Auth + DB | Supabase (Postgres + Auth + pgvector) |
| Cache | Redis (Upstash) |
| LLM — free tier | Groq (Llama 3.3 70B) |
| LLM — pro tier | Anthropic Claude (Haiku / Sonnet) |
| Dashboard | React 19 + Vite |
| Deploy | Fly.io (backend, scale-to-zero: 256mb/1 shared CPU, `auto_stop_machines`/`min_machines_running=0` for near-zero idle cost) + Vercel (web dashboard) |

---

## Roadmap

*(Updated 2026-08-02 — most of v1.0 shipped in the 2026-07-07 "fable pass"; see
`human/06_FABLE_PASS_REPORT.md` and `docs/agent_plans/v3/v3_multi_surface_plan.md` for the
current v1 direction, which supersedes v2.0's VS Code line below.)*

### v1.0 — Core Extension
- [x] Content script: textarea + contenteditable detection
- [x] Mirror overlay: clause underline rendering (+ CSS Custom Highlights hybrid)
- [x] Syntactic segmentation (regex, instant)
- [x] Background SW: streaming proxy to backend
- [x] Ghost text renderer at caret position
- [x] Hotkey state machine (Tab / Enter / Backspace / Cmd+Enter / Esc)
- [x] Backend: `/segment`, `/enhance`, `/bind` endpoints
- [x] Groq integration (free tier)
- [x] Supabase auth + user accounts
- [x] Mode toggle: Efficiency / Balanced / Detailed
- [ ] Chrome Web Store submission (still unpacked-load only)

### v2.0 — Context Awareness
- [ ] GitHub OAuth + repo connection
- [ ] Project profiles (tech stack, system context)
- [ ] pgvector context retrieval (semantic file chunking)
- [ ] ~~VS Code extension (InlineCompletionProvider)~~ — **explicitly rejected**, see
      `docs/agent_plans/v3/v3_multi_surface_plan.md` (high cost, narrow win; replaced by a
      CLI + Claude Code skill + MCP server as additional thin clients instead)
- [ ] BYOK (bring your own API key)

### v3.0 — Growth (current direction — see `docs/agent_plans/v3/v3_multi_surface_plan.md`)
- [ ] CLI (`pc` — Termius/terminal reach)
- [ ] Claude Code skill (thin wrapper over the CLI)
- [ ] MCP server (Claude Desktop reach)
- [ ] Write mode (day-to-day writing enhancement, style-control system, distinct from the existing code-mode pipeline)
- [ ] Team accounts
- [ ] Analytics dashboard
- [ ] Firefox extension port

---

## Development

### Prerequisites

- Bun (backend runtime and tests)
- Node.js with npm (extension/web toolchains)

### Environment Setup

```bash
cp backend/.env.example backend/.env
cp extension/.env.example extension/.env
cp web/.env.example web/.env
```

### Secret Policy

- Never commit real secrets.
- Commit only example templates.
- Keep deployment secrets in environment-specific secret stores.

### Startup Order

```bash
# Backend
cd backend && npm install && npm run dev

# Extension (new terminal)
cd extension && npm install && npm run dev

# Web dashboard (new terminal)
cd web && npm install && npm run dev
```

### Smoke Checks

```bash
# Structure and bootstrap checks
bash scripts/smoke-tests.sh

# Backend tests and typing
cd backend && bun test && npm run typecheck

# Strict integration gate (fails fast if integration env is missing)
cd backend && npm run test:integration

# Extension and web type/build checks
cd ../extension && npm run typecheck && npm run build
cd ../web && npm run typecheck && npm run build
```

The strict integration gate requires local Supabase/Redis env exports (for example `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANON_KEY`, `JWT_SECRET`, and `REDIS_URL`).

### Step 0 Behavior Note — superseded

This described the earliest bootstrap state (deterministic placeholders). No longer
accurate: segmentation, LLM routing/orchestration, and persistence are all production
behavior now — see `docs/BACKEND_API.md` and `handoff.md` for current status.

---

## License

MIT

## External Auditor Workflow Prompt

> **Note (2026-08-02):** the "Current Progress" section below describes a Step 1-4
> snapshot that is now far out of date — the project has since shipped the full pipeline,
> a non-destructive bind design, prompt history, a real test/e2e harness, and is now
> planning a multi-surface v1 (see `docs/agent_plans/v3/v3_multi_surface_plan.md`). Kept
> as-written since it's a reusable prompt template for onboarding an external auditor, not
> a status report — update its "Current Progress" section with real current state before
> actually using it with a new auditor.

# Context Transfer: "insta_prompt" Project
Please adopt the persona of a strict, highly disciplined Staff Engineer helping me "vibe code" an application called `insta_prompt`. 

## Project Architecture
- **Backend:** Hono, Bun, Supabase (Postgres/Auth), Redis (Upstash). It acts as a secure reverse-proxy for LLM calls.
- **Client:** Chrome Extension (Manifest V3) that interacts with the DOM and manages its own state machine.
- **Core Rule:** "Proxy-Only Architecture". The client never holds API keys. The backend enforces tier limits, rate limits, and model routing. 

## Current Progress
We are building the backend systematically. 
- **Step 1 (Auth/RLS) & Step 2 (Rate Limiting/Tiers):** 100% complete and manually tested.
- **Step 3 (LLM Service & Prompts):** 100% complete. We built pure-function prompt factories and provider adapters (Groq/Anthropic) returning standard JS objects via `AsyncIterable`, wrapped in a strict 502/504 retry pipeline.
- **Step 4 (/segment JSON Route):** Planning is locked. I am currently executing the build passes. The `/segment` route aggregates the Step 3 stream, normalizes taxonomy, generates Stable IDs via `hash(text + occurrence_count)`, translates dependency indices to IDs, and degrades to a deterministic fallback state on provider failure. 

## Our Workflow
When we move to a new step (e.g., evaluating the Step 4 Manual Testing Guide, or planning Step 5), you must follow this strict workflow:
1. **Critical Evaluation:** When I provide planning docs or testing guides, ruthlessly look for architectural traps, edge cases, race conditions, or AI-hallucination risks. Force me to patch my docs before we code.
2. **Pass Generation:** When we execute, break the work into 4-6 distinct "Vibe Coding Passes". Give me exactly one prompt at a time to feed my Copilot Build Agent.
3. **Strict Constraints:** Each prompt must list "Allowed Files", "Mandatory Requirements", and "Exit Conditions". Prevent the AI from leaking future step behavior into the current step.

Acknowledge this context, confirm your role as the Staff Engineer, and ask me to provide either the **Step 4 Manual Testing Guide** or the **Step 5 Planning Documents** to continue.
