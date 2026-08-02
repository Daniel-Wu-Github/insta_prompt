# Open Decisions — You Must Answer These to Continue

Grouped by urgency. Each has context + my recommendation. Nothing past Track C
proceeds until the relevant ones are answered.

## A. Immediate (unblock this pass's output)

### OD-1 — Push the branches & open PRs? — **RESOLVED (2026-08-01)**
Everything from Tracks A-D plus the later fable pass is merged to `main`. The original
`v2/track-*` branches were confirmed redundant and deleted (local + remote).

### OD-2 — Run the manual verification guide
G-2 (±1px parity) and G-3 (zero retained nodes) can only be signed off in a real browser.
See `03_MANUAL_TESTING_GUIDE.md`. **Action:** you (or QA) run it on the target-site matrix.

## B. Core extraction (DEC-2 — gates all of Track C onward)

From `docs/agent_plans/v2/c1_core_boundary_spike.md` §6:

### OD-3 — Approve the extraction sequence & the core/adapter line?
The spike proposes: (1 done) canonical order → core; (2) absorb `shared/contracts` +
`shared/design` into core; (3) extract the section **state machine** as a pure reducer
**behind the C3 test harness**; (4) `adapter-dom` implements the render/input contracts;
(5) orchestration onto `TransportClient`. **Rec:** approve; insist C3 harness lands first.

### OD-4 — `shared/` vs `packages/core`?
Absorb `shared/contracts` + `shared/design` into one portable `packages/core`, or keep
`shared/` and have core depend on it? **Rec:** absorb into core (one portable package).

### OD-5 — Unify backend canonical order onto core?
The canonical slot map is still duplicated in `backend/src/services/segment.ts`. Core is
pure TS and could be the single source for both. **Rec:** yes, but as its own small PR to
contain backend blast radius.

### OD-6 — Monorepo tooling?
`packages/core` is currently consumed by relative import (like `shared/`). Promote to a
real workspace (pnpm/npm workspaces) before the VS Code / web adapters? **Rec:** yes,
before Track G — relative imports won't scale to separately-built adapters.

## C. Product direction (DEC-1, 3, 4, 5 from mega-plan §8)

### OD-7 — DEC-1 Highlight technology (Track D2) — **RESOLVED**
Shipped as a hybrid: CSS Custom Highlights (`::highlight()`) paints unaccepted-clause
underlines on real text nodes where supported; the shadow-wrapped overlay mirror is
retained as the fallback and still owns accepted/stale/focus visuals and hover hit-testing.

### OD-8 — DEC-3 Prose/writing taxonomy (Track E)
The 7-type working set (`thesis · evidence · argument · audience · tone · structure ·
transition`) needs validation against a real essay corpus before committing. Wrong taxonomy
= poor classification. **Rec:** treat E1 as a research spike; I will NOT guess this.

### OD-9 — DEC-5 Bind contract change / "Option E" (Track E4) — **RESOLVED**
Shipped (commit `7de2d85`, "BIND-DESIGN-1 Option E"). `accepted?: boolean` was added as an
additive, optional field to `/bind` sections (omitted ⇒ `true`, so old payloads still
work). Unaccepted clauses now ride the bind payload near-verbatim instead of being
dropped — the "commit replaces your whole input" limitation is fixed.

### OD-10 — DEC-4 Mobile reality (Track G3, later)
OS keyboards heavily constrain inline overlays; mobile may become a share-sheet "compile
this text" flow rather than inline. **Rec:** defer; scope honestly after web/VS Code prove
the core.

## D. Productization & ops (need accounts/secrets — I can't do these)

### OD-11 — Sentry (AUD-12 / observability) — **PARTIALLY RESOLVED**
Client-side capture now exists (`window` `error`/`unhandledrejection` listeners, filtered
to extension-attributable stacks, buffered last 20) — but `deliverErrorReport` is a stub
seam only, no Sentry SDK, no DSN, no network transport. So the real state is a third
option this entry didn't originally offer: capture works, delivery doesn't yet.
**Decision:** provision a Sentry DSN and wire the transport (via the background worker,
proxy-only rule), or leave captured errors client-local for now?

### OD-12 — Stripe billing (Track F1) & deploys/CI (F2)
Need a Stripe account + keys and deploy credentials. Out of reach for an autonomous run.
**Decision:** when do we wire revenue + automated release?

### OD-13 — Rotate secrets before shipping (2026-07-31)
`backend/.env` was transferred from the old machine over Gmail (SCP over Tailscale wasn't
available; email was the fallback). Treat `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`,
`JWT_SECRET`, and `UPSTASH_REDIS_TOKEN` as potentially exposed. **Action required before any
production/public deploy:** rotate all four from their dashboards (Supabase project
settings, Groq console, Upstash console, regenerate `JWT_SECRET` locally), then update
`backend/.env` and Fly.io secrets (`flyctl secrets set ...`) with the new values. Also still
missing: a real `ANTHROPIC_API_KEY` (currently the `.env.example` placeholder) — pro-tier
routing is broken until this is set.

---
**Fastest path to "keep going" (updated 2026-08-02):** OD-1/OD-7/OD-9 are resolved. Answer
**OD-3, OD-4** to continue the core extraction (state machine); note the direction has
since broadened beyond Track C — see `docs/agent_plans/v3/v3_multi_surface_plan.md` for
the current v1 plan (multi-surface: CLI/Claude Code skill/MCP server + a new write mode).
