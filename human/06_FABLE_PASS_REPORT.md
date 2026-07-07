# Fable Pass Report — v2/track-d-polish

**Date:** 2026-07-07
**Branch:** `v2/track-d-polish` (11 commits this pass, clean tree)
**Author:** Claude Fable 5
**Scope:** Track D closeout → automated verification tier → feature slate → backend output-quality pass

---

## 1. What was done

### Phase 1 — Track D closed out

| Item | What shipped |
|---|---|
| D1 (AUD-1 remainder) | Overlay mirror shadow-wrapped (`attachShadow` + `:host{all:initial}` + tokens), same pattern as popover/ghost/toast. All four surfaces now isolated. |
| Font | Inter Variable bundled (`extension/public/fonts/`, `web_accessible_resources`, `@font-face` threaded through `shadowBaseCss`). No more system-ui fallback. |
| C3 | Shared `src/test/chrome-mock.ts` harness. All 13 "known-stale" vitest failures root-caused (12 = missing `storage.onChanged` stub crashing `main()`; 1 = inverted assertion) and fixed. |
| D2 (OD-7/DEC-1) | CSS Custom Highlights hybrid wired: real-text underlines via `::highlight()` per goal type where supported, overlay mirror carries accept/stale/focus state; graceful downgrade to overlay-only. |
| D3 (AUD-7, BUG-2.3) | Persistent keymap HUD (5 rows + 6-entry clause legend) + one-time coach mark gated on `promptcompiler.onboarding.seen`. |

Verified along the way instead of rebuilt (handoff.md had them listed as open, source says shipped): **BUG-REACT** (WeakSet idempotency — now module-scope per skill rule 8), **BUG-ZINDEX** (modalObserver), **BIND-UX-1** (Tab reviews / Enter accepts), **SEG-1** (classifier temp 0 — regression pin added).

### Phase 2 — Playwright verification tier (`e2e/`)

Hermetic: static 8-site fixture matrix (`:4173`) + mock backend (`:4174`) baked in at build; extension loaded via persistent-context Chromium under `xvfb-run`. **19/19 green.** Coverage mapped 1:1 to the manual guide:

- **A1** idempotency under SPA/React churn, all 8 fixture sites + full SPA navigation drill
- **A2/G-2** numeric rect-diff parity (±1px) + BUG-GEOM clip behavior
- **A3/G-3** zero-retention (DOM-count proxy) on clear and SPA teardown
- **G-1** axe gate, scoped to extension-attributable violations
- **G-4** cold start < budget at 4× CPU throttle (with warmup pass)
- **G-5** keyboard-only review→accept→un-accept→bind flow, no mouse APIs by construction
- **History** full accept→bind→commit cycle asserting persisted storage

The `@live` real-site tier is deliberately unwritten (needs human login; must never gate merges) — see `e2e/README.md`.

### Phase 3 — Feature slate

- **BIND-UX-2**: Backspace/Delete un-accepts the focused accepted clause; closes the bind gate when the last acceptance is withdrawn. HUD + `REVIEW_HINT` teach it.
- **Option E / BIND-DESIGN-1 (non-destructive commit)**: every clause now rides the bind payload — accepted ones with their enhanced expansion, unaccepted ones with **raw user text**, tagged `accepted: boolean` (additive; omitted ⇒ accepted, v1-compatible). Backend serializes `[slot N | goal_type | ACCEPTED|UNACCEPTED]` and preserves unaccepted text near-verbatim. Commit no longer destroys unreviewed clauses.
- **OD-11 slice**: content-script `error`/`unhandledrejection` reporting, filtered to extension-attributable stacks, with pipeline-context snapshots and a single Sentry-ready delivery seam. No DSN decision forced.
- **Prompt history + template library** (new feature): commits persist to `promptcompiler.history` (dedupe, 50-entry cap, pinned exempt); popup gains a History & Templates panel (search / copy / delete / pin, 20-template cap), live via `storage.onChanged`.

### Phase 4 — Backend output-quality pass (BE-QUAL-1)

The user-reported issue — *"the backend isn't really improving the prompt, just blindly appending, with different categorization each time"* — was reproduced empirically against live Groq and fixed at all three prompt layers:

| Layer | Observed failure (probe, before) | Fix | Probe result (after) |
|---|---|---|---|
| Segment classifier | Deterministic (3/3 identical at temp 0) but **wrong**: "give me a step by step plan" → `context`; "don't break if storage is empty" → `constraint` | Ordered disambiguation rules (answer-FORM → `output_format`; missing/failing-state → `edge_case`; `constraint` = solution limits only) | All 6 labels correct, still 3/3 stable |
| Enhance | Padding + invention: "use react and typescript" → boilerplate headers + invented "latest stable versions" | Rewrite-and-sharpen mode instructions; imperative voice; header ban (headers survive binding as seams); "preserve every concrete fact / invent nothing" pinned in base factory; tech_stack forbidden from adding unnamed technologies | Tight, faithful fragments; "Do not use any other frameworks…beyond what is specified" |
| Bind | **Stitching**: one heading per slot ("Step 1: Context Establishment…"), expansions pasted near-verbatim, third-person narrative | Objectives demand a paste-ready prompt in imperative voice; forbid slot-structure mirroring, verbatim reuse, and invention | Single-voice merged prompt, zero slot echo, hallucinated Node.js/npm content gone |

Regression pins added so none of this can silently drift (`Disambiguation rules`, `Rewrite, do not stitch`, anti-invention lines).

**Important:** the classifier instability the user experienced ("different categorization each time") is real *on the deployed backend* — fly.dev predates SEG-1 and everything above. The current code is deterministic and accurate locally; **it is not fixed for users until this branch is deployed.**

---

## 2. Verification state

| Suite | Result |
|---|---|
| `extension` tsc | clean |
| `extension` vitest | **47/47** (was 13 failures at pass start) |
| `backend` bun test | **79 pass / 3 fail** — the 3 are environmental (see gap #1) |
| `e2e` Playwright | **19/19** on a fresh build |
| Live-LLM probe | Classifier 3/3 stable + 6/6 correct labels; bind output manually inspected before/after |

---

## 3. Known gaps (honest list, ranked)

1. **🔴 The Supabase project is gone.** `yrilkwidkpqjzpsbldcr.supabase.co` returns NXDOMAIN from public resolvers (while `supabase.co` resolves fine) — the project has been deleted or paused-and-reclaimed. This is not a test-environment quirk: **production sign-in/sign-up, token refresh, RLS-backed history persistence, and the 3 "environmental" backend integration tests are all dead against it.** Requires provisioning a new Supabase project, updating `SUPABASE_URL`/keys in backend `.env`, extension `.env` (`VITE_SUPABASE_URL`), and fly.dev secrets, and re-running migrations in `supabase/`.
2. **🔴 Deployed backend is stale.** Every backend improvement in this pass (SEG-1 determinism, disambiguation, Option E, BE-QUAL-1) exists only on this branch. The user-visible quality complaints will persist until `fly deploy` (blocked in part by #1 for auth-dependent routes).
3. **🟡 Classifier model headroom.** `llama-3.1-8b-instant` now labels the probe input correctly, but 8B has limited headroom on genuinely ambiguous clauses. If misclassification reports continue after deploy, the surgical next step is bumping `SEGMENT_CLASSIFIER_MODEL` to `llama-3.3-70b-versatile` (same Groq path, tier invariants intact) and re-measuring latency/cost on the 400ms-debounce hot path.
4. **🟡 Quality is prompt-pinned, not eval-gated.** The BE-QUAL-1 regression pins protect the prompt *text*, not the *output quality*. A tiny eval harness (5–10 canonical casual inputs, scripted assertions: label accuracy, no slot-echo in bind, no invented tech) run on demand against live Groq would catch model-behavior drift that string pins cannot.
5. **🟡 Cold-first-run e2e flake.** First suite run after a rebuild can fail 2–3 tests that pass on every rerun (SW/font warmup). Options: warmup fixture or `retries: 1`.
6. **🟢 History race.** `promptcompiler.history` read-modify-write is not transactional; simultaneous commit + popup pin could drop one write. Rare, benign.
7. **🟢 `@live` tier unwritten** (deliberate — see Phase 2).
8. **🟢 Docs debt.** `human/01_GAP_ANALYSIS.md` / `02_OPEN_DECISIONS.md` / `05_RETURN_BRIEFING.md` still describe the pre-pass state. `handoff.md` is rewritten as of this report; the others are cheaper to regenerate than patch when needed.

---

## 4. Next actions (in order)

1. Provision new Supabase project → restore auth end-to-end (gap #1).
2. Deploy backend to fly.dev → users actually receive SEG-1 + BE-QUAL-1 + Option E (gap #2).
3. One manual live-site pass (real ChatGPT/Claude) before store submission.
4. Optional hardening: eval harness (gap #4), classifier model bump if reports persist (gap #3).
