# Handoff — `main`

**Date:** 2026-08-02
**Branch:** `main` (all work merged; the old `v2/track-*` branches and
`v2/track-d-polish` were confirmed redundant and deleted)
**Status:** Track D, the Playwright verification tier, the Phase-3 feature slate, and a
backend output-quality pass are complete and verified (the 2026-07-07 "fable pass"). Since
then: Supabase has been re-provisioned (same project URL, was dead/NXDOMAIN, now live),
Fly.dev has been redeployed with this pass's backend code, a Playwright e2e harness for
the real live backend was added (`extension/tests/e2e/`, separate from the hermetic
`e2e/` mock-backend suite), and a new v1 direction has been planned (not yet implemented):
multi-surface (CLI + Claude Code skill + MCP server, alongside the existing extension) and
a new "write mode" (day-to-day writing enhancement via a style-control system, distinct
from the existing code-mode pipeline). See `docs/agent_plans/v3/v3_multi_surface_plan.md`
for that plan — Phase 0 (this consolidation + the Fly redeploy) is done; Phase 1 (the
write-mode backend + PAT auth) has not been started.

Full fable-pass narrative: `human/06_FABLE_PASS_REPORT.md` (written 2026-07-07, predates
the Supabase/Fly fixes below — read this file for current status, not that one).

---

## Test baseline at HEAD (do not regress)

| Suite | Command | Expected |
|---|---|---|
| Extension types | `cd extension && npx tsc --noEmit --skipLibCheck` | 0 errors |
| Extension unit | `cd extension && npx vitest run` | **47/47 pass** |
| Backend | `cd backend && bun test` | **79 pass / 3 fail** — the 3 (auth ×2, ratelimit) hit Supabase's real "email rate limit exceeded" on repeated signups in integration tests; this is an external rate limit, not a regression |
| E2E (hermetic) | `cd e2e && npm test` | **19/19 pass** (builds the extension against a mock backend, runs headed under xvfb) |
| E2E (real backend) | `cd extension && npx playwright test` | **6/6 pass** — real Supabase session (admin-API minted, no signup email) driving a real `/segment` call against the live Fly.dev deploy |

---

## What is DONE (verify, don't rebuild)

- **Track D**: overlay mirror shadow-wrapped (D1); Inter Variable bundled; Custom Highlights hybrid renderer (D2, resolves OD-7/DEC-1); keymap HUD + one-time coach mark (D3, key `promptcompiler.onboarding.seen`).
- **C3**: shared chrome mock at `extension/src/test/chrome-mock.ts` — extend it, never hand-roll `vi.stubGlobal("chrome", ...)` in a test again.
- **E2E tier** (`e2e/`): 8-site fixture matrix + mock backend, covering A1/A2/A3 + G-1/G-2/G-3/G-4/G-5 + the full accept→bind→commit cycle.
- **Feature slate**: BIND-UX-2 (Backspace un-accept); **Option E** non-destructive commit (`accepted?: boolean` additive on BindRequest sections); OD-11 error-observability slice (capture works, no Sentry DSN/transport wired yet); **prompt history + template library** (`promptcompiler.history`, popup History & Templates panel).
- **BE-QUAL-1** (backend output quality): classifier disambiguation, enhance sharpens instead of padding, bind compiles instead of concatenating. Regression pins in `prompt.factories.test.ts` / `segment.service.test.ts`.
- **Supabase**: re-provisioned under the same project URL (`yrilkwidkpqjzpsbldcr.supabase.co`), confirmed live via real integration-test traffic this session.
- **Fly.dev**: redeployed with the fable-pass backend code; `fly.toml` confirmed at `256mb`/1 shared CPU/`auto_stop_machines=stop`/`min_machines_running=0` for near-zero idle cost; secrets updated from current `backend/.env`.
- **Skill system**: migrated `.github/skills/` → `.claude/skills/` (the harness's Skill tool only discovers skills there).

---

## What is NOT done — resume here, in this order

### 1. 🔴 Rotate secrets (OD-13, `human/02_OPEN_DECISIONS.md`)
`backend/.env` was transferred over Gmail during a machine migration — treat
`SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, `JWT_SECRET`, `UPSTASH_REDIS_TOKEN` as potentially
exposed. Rotate all four before any production/public deploy.

### 2. `ANTHROPIC_API_KEY` is still the `.env.example` placeholder
Pro-tier LLM routing is broken until a real key is set, locally and as a Fly secret.

### 3. Phase 1 of the v3 plan — write-mode architecture + PAT auth
Not started. See `docs/agent_plans/v3/v3_multi_surface_plan.md` — a Personal Access
Token auth path (for the CLI/skill/MCP surfaces) and a `StyleProfile` dial system (three
new backend routes: `/write/analyze`, `/write/profile/parse`, `/write/rewrite`), designed
to be a real differentiator against Grammarly/Wordtune, not a simplified taxonomy clone.

### 4. Manual live-site pass
One real ChatGPT/Claude session before store submission (the `@live` e2e tier is
deliberately unwritten — needs human login, must not gate merges; see `e2e/README.md`).

### 5. Optional hardening
- Mini eval harness for pipeline quality (string pins protect prompt text, not model behavior).
- Sentry DSN decision (OD-11) — the delivery seam is `deliverErrorReport` in `extension/src/content/index.ts`.
- E2E cold-first-run flake: warmup fixture or `retries: 1` in `playwright.config.ts`.

---

## Working agreements that saved this pass (keep them)

- **Read source before trusting handoff docs** — a past version of this file listed
  already-fixed bugs as open; source inspection prevented rebuilding them. `human/00-05`
  are now marked superseded for the same reason — read `06` and this file, not those.
- Instrumentation idempotency lives in a **module-scope WeakSet** (content-script-instrumentation rule 8), never attributes, never main()-scope.
- E2E must stay hermetic: any request leaving 127.0.0.1 in the `e2e/` fixture tier is a bug (live-network auth was the original flake source). The separate `extension/tests/e2e/` tier is deliberately NOT hermetic — it exists specifically to catch real Supabase/backend integration regressions the mock tier can't.
- Every listener/observer registers a disposer; `ctx.onInvalidated` tears down everything (AUD-10/G-3).
