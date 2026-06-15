# Gap Analysis — Where We Stand vs the State-of-the-Art Bar

Derived from the mega-plan's §3 audit (AUD-1…12) and §2.4 quality gates (G-1…5),
updated with what this pass changed. **CLOSED** = done & verified by tsc/tests;
**PARTIAL** = started/usable but incomplete; **OPEN** = not started.

## Audit items

| ID | Gap | Status | Where it stands now |
|---|---|---|---|
| AUD-1 | Overlay not Shadow-DOM isolated (host CSS can perturb it) | **OPEN** | Track D1 (shadow-root rewrite). Untouched. |
| AUD-2 | No design-token layer; magic values scattered | **CLOSED (render path) / PARTIAL** | Tokens authored (`shared/design`) and wired into the underline/overlay path (B3). Popover/toast CSS-chrome literals deferred to D1 (rewritten there). |
| AUD-3 | No motion system; no `prefers-reduced-motion` | **PARTIAL** | Motion tokens + reduced-motion helper authored & tested (B2). Not yet *applied* to existing transitions — that wiring rides with D. |
| AUD-4 | Pixel-parity only approximate | **OPEN** | Needs live measurement (G-2) + likely CSS Custom Highlights (DEC-1 / D2). |
| AUD-5 | Core logic fused to the browser monolith | **PARTIAL** | C1: canonical ordering extracted to `packages/core`; `InputSource`/`RenderTarget`/`TransportClient` contracts defined. State machine, settings, orchestration still in `index.ts` (the DEC-2 work). |
| AUD-6 | Single mode only (no prose/writing taxonomy) | **OPEN** | Track E. Needs DEC-3. |
| AUD-7 | Discoverability weak; no onboarding/coach marks | **OPEN** | Track D3. (A keymap `REVIEW_HINT` string exists; no coach marks.) |
| AUD-8 | Stale skill/doc drift (confidence still documented) | **CLOSED** | A4 purged it from 5 skills + UX_FLOW/BACKEND_API/CLAUSE_PIPELINE after verifying it's gone from real code. |
| AUD-9 | Bind is destructive (replaces whole input) | **OPEN** | Track E4 "Option E" non-destructive bind. Needs DEC-5 (contract change). |
| AUD-10 | No memory-cleanup registry (ghost-node risk) | **CLOSED** | A3 registry + teardown on removal + `ctx.onInvalidated`. (Heap-snapshot G-3 needs live verify.) |
| AUD-11 | Web app is a shell, not the reference editor | **OPEN** | Track G1. Untouched. |
| AUD-12 | No client observability (silent host-DOM breakage) | **OPEN / ESCALATED** | Needs a Sentry DSN (account decision) — see DEC in 02. |

## Quality gates (§2.4)

| Gate | Target | Status |
|---|---|---|
| G-1 | axe/Lighthouse a11y ≥ 95 on popup + web; 0 critical on overlays | **OPEN** — not measured |
| G-2 | Overlay underlines align within ±1px on target sites | **OPEN** — partial mitigation in code; needs live measurement (manual guide) |
| G-3 | Zero retained `data-insta-*` nodes after a full cycle | **IMPLEMENTED (A3), NEEDS VERIFY** — heap snapshot drill in the manual guide |
| G-4 | Cold-start to first underline < 200ms (4-CPU throttle) | **OPEN** — not measured |
| G-5 | Every interactive element keyboard-operable w/ visible focus | **OPEN** — not audited |

## Honest summary

This pass **hardened stability (A) and built the design-system foundation (B)**, and
**de-risked the core extraction (C)** with a blueprint + one proven slice. The
**visible, pixel-level polish (Track D), the second audience (prose, Track E), and
new platforms (Track G) remain ahead** — and most quality *gates* (G-1/2/4/5) still
need a live browser to measure. The tokens and motion exist as data; making the UI
*look* state-of-the-art is the Track D application step that hasn't happened yet.
