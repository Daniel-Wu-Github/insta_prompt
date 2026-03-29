# PromptCompiler

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
└── docs/               # Architecture + planning docs (this folder)
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

```bash
# Extension
cd extension && bun install && bun run dev

# Backend
cd backend && bun install && bun run dev

# Web dashboard
cd web && bun install && bun run dev
```

See individual package READMEs for env vars and setup.

---

## License

MIT
