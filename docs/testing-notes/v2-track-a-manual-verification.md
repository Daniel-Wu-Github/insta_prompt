# V2 Track A — Manual Verification Guide

**Plan ref:** `docs/agent_plans/v2/v2_uiux_megaplan.md` §7 Track A, §2.4 quality gates.
**Branch:** `v2/track-a-stabilize`.
**Why this exists:** Track A's correctness claims (WeakSet idempotency, clip-rect
geometry, and the per-element cleanup registry) can be unit-reasoned but their
**runtime** gates — G-2 (±1px pixel parity) and G-3 (zero retained nodes after a
cycle) — require a real browser on live sites and a DevTools heap snapshot. Those
were **not** auto-verified in the implementation session (no live browser in that
environment) and are escalated here for a human to execute.

---

## 1. What This Covers

| ID | Fix | Code anchor | Gate verified here |
|---|---|---|---|
| A1 | WeakSet instrumentation idempotency (BUG-REACT) | `_instrumentedElements`, `isInstrumented`/`markInstrumented` | no false unsupported-toast, no duplicate listeners on React churn |
| A2 | Clip-rect overlay geometry (BUG-GEOM) | `getClippedVisibleRect`, `updateDraftOverlayGeometry` | G-2 underline alignment within ±1px; no bleed past container |
| A3 | Per-element cleanup registry (AUD-10) | `_instrumentCleanups`, `teardownInstrument`, `ctx.onInvalidated` | G-3 zero retained `data-insta-*` nodes/listeners after a cycle |

Not covered (separate escalations in §9): A1 client observability/Sentry (needs a
DSN), and the full target-site **pixel** matrix beyond ChatGPT/Claude.ai.

## 2. Terminal Setup

One terminal, repo root. The extension is WXT + React.

```bash
cd extension
node -v   # expect a current LTS; WXT needs Node 18+
```

## 3. Preflight

```bash
cd extension
npx tsc --noEmit --skipLibCheck   # expect exit 0
npx vitest run                    # KNOWN: 13 fail / 4 pass — pre-existing stale tests
                                  # (assert removed-confidence + old attribute marker;
                                  #  owned by Track C3, NOT a Track A regression)
```

Rainy day: if `tsc` is non-zero, stop — do not load an extension that fails type
check. If vitest fail count is **higher than 13**, a Track A change regressed;
`git stash` your local changes and re-run to find the delta.

## 4. Build & Load the Extension (Dev)

```bash
cd extension
npm run dev          # WXT builds to .output/chrome-mv3 and watches
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `extension/.output/chrome-mv3`. Pin the extension.

Reset between drills: click the reload ↻ on the extension card (this fires
`ctx.onInvalidated` in the old content script — relevant to A3 below).

## 5. Export Local Env Vars

None required for content-script behavior — the bridge talks to the configured
backend. If testing against a local backend, export per `backend/.env` and run
`cd backend && bun run dev` in a second terminal named **backend**. Re-run the
export block in every new shell.

## 6. Verify Invariants Manually

### Invariant A1 — Idempotency survives React reconciliation
Open `https://chatgpt.com`. Focus the prompt box; type a few words so underlines
appear. Then in DevTools Console:

```js
// Source of truth is a WeakSet, not the attribute. The attribute MAY be absent
// after React reconciles — that is expected and must NOT break anything.
document.querySelectorAll('[contenteditable]').length      // > 0
// Trigger churn: switch models / open+close the sidebar a few times, keep typing.
```

- **Sunny:** underlines keep tracking text; the "PromptCompiler doesn't support
  this input" toast does **not** fire on the main composer; no duplicate underline
  layers stack up.
- **Rainy (the old BUG-REACT):** toast fires on the real composer, or underlines
  visibly double. If seen, A1 regressed.

### Invariant A2 — Overlay clips to the visible container (G-2)
Still on ChatGPT, paste a long multi-paragraph prompt so the composer reaches its
internal `max-height` and scrolls.

- **Sunny:** underlines stay **inside** the visible composer box; nothing renders
  in the 1–2 rows *below* the box border; scrolling the composer keeps underlines
  aligned with their words within ~±1px.
- **Rainy (old BUG-GEOM):** underline rows appear below the composer's bottom edge.

Pixel measurement (G-2, do this to close the gate): screenshot at 200% zoom,
overlay-vs-text horizontal offset must be ≤1px on `action`/`tech_stack` clauses.
Repeat on `https://claude.ai` (ProseMirror) and a plain `<textarea>` site.

## 7. Run the Test Matrix

| Surface | A1 toast-free | A2 no bleed | A3 clean teardown |
|---|---|---|---|
| ChatGPT (chatgpt.com) | ☐ | ☐ | ☐ |
| Claude.ai | ☐ | ☐ | ☐ |
| Notion | ☐ | ☐ | ☐ |
| Linear | ☐ | ☐ | ☐ |
| GitHub (issue/PR box) | ☐ | ☐ | ☐ |
| Gmail compose | ☐ | ☐ | ☐ |
| Slack web | ☐ | ☐ | ☐ |

Automated matrix that proves the same code paths: `cd extension && npx vitest run`
— but note the suite is currently stale (§3). A real harness lands in Track C3;
until then this manual matrix is the source of truth for Track A runtime behavior.

## 8. Manual End-to-End Check — A3 zero-retention (G-3)

This is the gate the implementation session could not run. Use the DevTools Memory
panel (procedure mirrors `dom-memory-management` §"Debugging Memory Leaks"):

1. On ChatGPT, type to get underlines; hover a clause; press `Tab` to accept;
   `Cmd/Ctrl+Enter` to bind; `Enter` to commit; let it reset.
2. DevTools → **Memory** → take **Snapshot 1**.
3. Navigate away (SPA route change) and back, or delete the composer via React
   churn, then take **Snapshot 2**.
4. In Snapshot 2, filter retained objects by `data-insta`. **Sunny:** zero
   retained `data-insta-*` nodes and zero detached MutationObservers/listeners
   bound to the removed input. **Rainy (old AUD-10):** a `clearObserver` /
   detached contenteditable is retained.
5. Reload the extension card (fires `ctx.onInvalidated`); confirm the discovery
   observer + modal observer are gone (no extension scroll/resize listeners remain
   in the Elements → Event Listeners pane for `window`).

## 9. Optional Rainy-Day Drill + Escalations

- **SPA detach/reattach (A3 Rule 6):** on Linear/Notion, navigate between views
  rapidly. Instrumented inputs that leave the DOM must be torn down; the same input
  re-added must re-instrument exactly once (the `isConnected` post-batch sweep must
  not falsely tear down a same-batch React move).
- **ESCALATION — A3 Sentry/observability (plan A3, AUD-12):** client error
  reporting is **not wired**. It needs a Sentry DSN (account decision). Until then,
  host-DOM breakage is silent. Decide: provision a Sentry project + DSN, or defer.
- **ESCALATION — G-2 full matrix:** ±1px parity is asserted here only by eye on a
  subset. A CSS Custom Highlights rewrite (plan DEC-1 / Track D2) is the durable
  fix; this guide verifies the current overlay is "good enough," not pixel-perfect.

## 10. Personal Notes

```
Date:
Tester:
Sunny result (A1/A2/A3 per matrix):
Rainy result / recovery:
Bugs found (file under .claude/debugging_log.md):
Sentry decision (provision DSN? y/n):
```
