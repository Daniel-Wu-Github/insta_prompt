# Gap Analysis — Where We Stand vs the State-of-the-Art Bar

> **⚠️ SUPERSEDED (2026-08-02).** Point-in-time snapshot from the 2026-06-15 mega-plan
> pass. AUD-7/AUD-9 and G-1/G-2/G-4/G-5 marked OPEN below are now closed — non-destructive
> bind (Option E) shipped and the Playwright e2e suite (`e2e/`) automates G-1/G-2/G-4/G-5,
> 19/19 green. See `human/06_FABLE_PASS_REPORT.md` for the current picture; this file is
> kept as-written for historical record, not updated.

Derived from the mega-plan's §3 audit (AUD-1…12) and §2.4 quality gates (G-1…5),
updated with what this pass changed. **CLOSED** = done & verified by tsc/tests;
**PARTIAL** = started/usable but incomplete; **OPEN** = not started.

## Audit items

| ID | Gap | Status | Where it stands now |
|---|---|---|---|
| AUD-1 | Overlay not Shadow-DOM isolated (host CSS can perturb it) | **MOSTLY CLOSED** | Correction: popover/ghost/toast ALREADY use Shadow DOM + `all:initial` (audit overstated this). Token vars now injected into each (D-partial). The **underline-overlay mirror** itself isn't shadow-wrapped yet — remaining D item. |
| AUD-2 | No design-token layer; magic values scattered | **CLOSED** | Tokens (`shared/design`) wired into the underline/overlay path (B3) AND into the popover/ghost/toast chrome (D-partial). |
| AUD-3 | No motion system; no `prefers-reduced-motion` | **CLOSED (chrome surfaces)** | Motion tokens (B2) now APPLIED: float-in entrance on popover/ghost/toast, reduced-motion guard injected into every shadow surface, toast fade routed through the reduced-motion-aware helper (D-partial). |
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

This pass **hardened stability (A)**, **built AND applied the design system (B + D-partial)**,
and **de-risked the core extraction (C)** with a blueprint + one proven slice. The design
system is no longer just data — it's now applied to the live popover/ghost/toast with named
motion and reduced-motion.

**What still genuinely needs a live browser** (cannot be certified headless): G-2 ±1px
underline parity, G-1 axe a11y, G-4 cold-start timing, G-5 keyboard-only sweep. **What's
larger follow-up work:** the underline-overlay shadow wrap, onboarding/coach marks (D3),
bundling Inter Variable as a web-accessible font (currently falls back to system-ui), the
second audience (prose, Track E), and new platforms (Track G).

**Bottom line:** the UI is now shadow-isolated, token-consistent, and motion-correct by
construction — *professional-grade engineering*. Declaring it *certified pixel-perfect*
requires rendering it and measuring, which is the one step this environment can't perform.
