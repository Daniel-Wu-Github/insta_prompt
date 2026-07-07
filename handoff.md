# Handoff — v2/track-d-polish

**Date:** 2026-07-07
**Branch:** `v2/track-d-polish` (clean tree, 11 commits this pass)
**Author:** Claude Fable 5
**Status:** Track D, the Playwright verification tier, the Phase-3 feature slate, and a backend output-quality pass are **complete and verified**. The branch is code-complete; what remains is infrastructure (Supabase re-provisioning, fly.dev deploy) and optional hardening.

Full narrative: `human/06_FABLE_PASS_REPORT.md`. This file is the resume-here card.

---

## Test baseline at HEAD (do not regress)

| Suite | Command | Expected |
|---|---|---|
| Extension types | `cd extension && npx tsc --noEmit --skipLibCheck` | 0 errors |
| Extension unit | `cd extension && npx vitest run` | **47/47 pass** |
| Backend | `cd backend && bun test` | **79 pass / 3 fail** — the 3 (auth ×2, ratelimit) hit the dead Supabase host and will fail until re-provisioning; every other failure is a regression |
| E2E | `cd e2e && npm test` | **19/19 pass** (builds the extension against the mock backend, runs headed under xvfb; first run after a rebuild may flake 2–3 tests — rerun before investigating) |

---

## What is DONE (verify, don't rebuild)

- **Track D**: overlay mirror shadow-wrapped (D1); Inter Variable bundled; Custom Highlights hybrid renderer (D2, resolves OD-7/DEC-1); keymap HUD + one-time coach mark (D3, key `promptcompiler.onboarding.seen`).
- **Old Phase-1 bug list**: BUG-REACT (module-scope WeakSet), BUG-GEOM (clip-ancestor walk), BUG-ZINDEX (modalObserver), BUG-ALIGN diagnostics, BIND-UX-1 — all shipped and covered by vitest/e2e. The 300-line bug dossier this file used to carry is obsolete; git history has it if ever needed.
- **C3**: shared chrome mock at `extension/src/test/chrome-mock.ts` — extend it, never hand-roll `vi.stubGlobal("chrome", ...)` in a test again.
- **E2E tier** (`e2e/`): 8-site fixture matrix + mock backend, covering A1/A2/A3 + G-1/G-2/G-3/G-4/G-5 + the full accept→bind→commit cycle. Mock SSE frames must match the SW's `isStreamEvent` contract (`{type:"token",data}` / `{type:"done"}`).
- **Feature slate**: BIND-UX-2 (Backspace un-accept); **Option E** non-destructive commit (`accepted?: boolean` additive on BindRequest sections — omitted ⇒ accepted; unaccepted clauses ship raw text, preserved near-verbatim by bind); OD-11 error-observability slice (Sentry-ready seam, no DSN yet); **prompt history + template library** (`promptcompiler.history`, popup History & Templates panel).
- **BE-QUAL-1** (backend output quality — this was the "backend not really working" complaint): classifier disambiguation rules (answer-FORM → `output_format`, missing/failing-state → `edge_case`); enhance rewritten to sharpen-not-pad (imperative, no headers, no invention); bind rewritten to compile-not-concatenate (no slot echo, no verbatim stitching, no invention). Empirically verified against live Groq: 3/3 stable runs, 6/6 correct labels, merged single-voice bind output. Regression pins in `prompt.factories.test.ts` / `segment.service.test.ts`.

---

## What is NOT done — resume here, in this order

### 1. 🔴 Supabase project is dead (production blocker)
`yrilkwidkpqjzpsbldcr.supabase.co` is NXDOMAIN from public resolvers — the project no longer exists. Sign-in, token refresh, RLS history, and the 3 backend integration tests are all down. Provision a new project, run the migrations in `supabase/`, update:
- `backend/.env` → `SUPABASE_URL`, service/anon keys
- `extension/.env*` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- fly.dev secrets

### 2. 🔴 Deploy the backend
fly.dev predates everything in this pass — users still get the old nondeterministic classifier and stitching bind until `fly deploy`. (Auth-dependent routes need #1 first.)

### 3. Manual live-site pass
One real ChatGPT/Claude session before store submission (the `@live` e2e tier is deliberately unwritten — needs human login, must not gate merges; see `e2e/README.md`).

### 4. Optional hardening
- Mini eval harness for pipeline quality (string pins protect prompt text, not model behavior): 5–10 canonical inputs, assert label accuracy / no slot-echo / no invented tech, run on demand against live Groq.
- If misclassifications persist post-deploy: bump `SEGMENT_CLASSIFIER_MODEL` (backend `src/services/llm.ts`) from `llama-3.1-8b-instant` to `llama-3.3-70b-versatile` and re-measure the debounce hot path.
- E2E cold-first-run flake: warmup fixture or `retries: 1` in `playwright.config.ts`.
- Sentry DSN decision (OD-11) — the delivery seam is `deliverErrorReport` in `extension/src/content/index.ts`.

---

## Working agreements that saved this pass (keep them)

- **Read source before trusting handoff docs** — this file previously listed four already-fixed bugs as open; source inspection prevented rebuilding them.
- Instrumentation idempotency lives in a **module-scope WeakSet** (content-script-instrumentation rule 8), never attributes, never main()-scope.
- E2E must stay hermetic: any request leaving 127.0.0.1 in the fixture tier is a bug (live-network auth was the original flake source).
- Every listener/observer registers a disposer; `ctx.onInvalidated` tears down everything (AUD-10/G-3).
