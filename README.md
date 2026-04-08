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
│   │   └── popup/      # Popup UI — React + Vite
│   ├── wxt.config.ts
│   └── manifest.json
│
├── backend/            # API server (Bun + Hono + TypeScript)
│   └── src/
│       ├── routes/     # /enhance  /segment  /bind  /auth  /projects
│       ├── services/   # llm.ts  context.ts  auth.ts  ratelimit.ts
│       └── middleware/ # auth.ts  ratelimit.ts  tier.ts
│
├── web/                # Account dashboard (React + Vite)
│   └── src/
│       ├── pages/      # Login, Dashboard, Projects, Billing
│       └── components/
│
└── docs/               # Architecture + planning docs
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension build | [WXT](https://wxt.dev) + TypeScript |
| Extension popup | React 18 + Vite |
| Backend runtime | Bun + [Hono](https://hono.dev) |
| Auth + DB | Supabase (Postgres + Auth + pgvector) |
| Cache | Redis (Upstash) |
| LLM — free tier | Groq (Llama 3.3 70B) |
| LLM — pro tier | Anthropic Claude (Haiku / Sonnet) |
| Dashboard | React 18 + Vite |
| Deploy | Fly.io (backend) + Vercel (web dashboard) |

---

## Roadmap

### v1.0 — Core Extension
- [ ] Content script: textarea + contenteditable detection
- [ ] Mirror overlay: clause underline rendering
- [ ] Syntactic segmentation (regex, instant)
- [ ] Background SW: streaming proxy to backend
- [ ] Ghost text renderer at caret position
- [ ] Hotkey state machine (Tab / Cmd+Enter / Esc)
- [ ] Backend: `/segment`, `/enhance`, `/bind` endpoints
- [ ] Groq integration (free tier)
- [ ] Supabase auth + user accounts
- [ ] Mode toggle: Efficiency / Balanced / Detailed
- [ ] Chrome Web Store submission

### v2.0 — Context Awareness
- [ ] GitHub OAuth + repo connection
- [ ] Project profiles (tech stack, system context)
- [ ] pgvector context retrieval (semantic file chunking)
- [ ] VS Code extension (InlineCompletionProvider)
- [ ] BYOK (bring your own API key)

### v3.0 — Growth
- [ ] Team accounts
- [ ] Custom mode definitions
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

# Extension and web type/build checks
cd ../extension && npm run typecheck && npm run build
cd ../web && npm run typecheck && npm run build
```

### Step 0 Behavior Note

Step 0 routes and services intentionally use deterministic placeholders. Production-grade segmentation, LLM routing/orchestration, and persistence are deferred to later implementation steps.

---

## License

MIT
