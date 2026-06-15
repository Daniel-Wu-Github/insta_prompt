# Track C — Core Extraction Boundary Spike (C1)

**Status:** Design note + first proven slice. **NOT a completed extraction.**
**Branch:** `v2/track-c-core` — to be reviewed by a human and NOT merged until approved (plan §7A.5, DEC-2).
**Plan ref:** mega-plan §6 (Multi-Platform Architecture), §7 Track C, §9 action #4.

---

## 0. Why this note exists

The mega-plan's §9 immediate-next-action #4 is: *"Spike C1 boundaries (what exactly
moves into `core`) as a design note before touching code."* Core extraction is the
single highest-risk refactor in V2 (DEC-2): `extension/src/content/index.ts` is
~3,200 lines with state, render, transport, and DOM fused together. A blind
extraction would destabilize the only shipping surface. This note (a) classifies
every major unit in the monolith as **portable / DOM-bound / mixed**, (b) defines
the `RenderTarget` / `InputSource` / `TransportClient` contracts (C2), (c) sequences
the extraction so each step is behavior-preserving and independently revertible, and
(d) ships ONE proven slice (canonical ordering) end-to-end as evidence the pattern
works.

## 1. What shipped on this branch (the proven slice)

- **`packages/core/`** established as the portable home (pure TS, zero DOM/Node/chrome
  imports — plan R-ARCH-1). Consumed via relative import exactly like `shared/`.
- **`packages/core/src/clause-order.ts`** — the canonical clause order map + sort,
  extracted from `index.ts`'s local `CANONICAL_ORDER_BY_GOAL_TYPE`. The extension now
  imports it; the local duplicate is removed. This fixes a real
  `canonical-clause-ordering` invariant violation ("UI and backend references use the
  same slot definition source") — today the map is duplicated in the extension AND in
  `backend/src/services/segment.ts`.
- **`packages/core/src/adapter.ts`** — the `RenderTarget` and `InputSource` contracts
  (C2). Pure type definitions; no implementation, zero runtime risk.
- **`packages/core/src/transport.ts`** — the `TransportClient` contract (the seam
  every surface uses to reach `/segment` `/enhance` `/bind`; plan R-PLAT-1 proxy-only).
- Unit test proving the extracted canonical sort matches the skill policy.

This slice is low-risk (pure data, value-identical) and demonstrates the
extraction + re-import pattern that every later C step follows.

## 2. Monolith unit classification (the extraction map)

| Unit in `index.ts` | Nature | Target package | Risk |
|---|---|---|---|
| Canonical order map + sort | **Pure** | `core` ✅ (done) | low |
| Clause taxonomy / `GoalType` | **Pure** (already in `shared/contracts`) | `core` (absorb shared/contracts) | low |
| Design tokens + motion | **Pure** (already in `shared/design`) | `core` (absorb shared/design) | low |
| Section model + acceptance queue + dirty/stale derivation | **Mostly pure** (operates on plain `DraftSegment[]` + index sets) | `core` state machine | **high** — the core of DEC-2 |
| Settings (mode, pause, clause-ordering, tier) | Mixed (`chrome.storage`) | `core` settings model + adapter-provided store | medium |
| Segment/enhance/bind orchestration (debounce, abort, requestId routing) | Mixed (logic pure; transport is chrome port) | `core` orchestrator + `TransportClient` | high |
| Bridge port messaging / reconnect | **chrome.* bound** | stays in adapter | n/a |
| Input discovery + instrumentation + cleanup registry | **DOM bound** | `adapter-dom` | n/a |
| Overlay/highlight/geometry/clip-rect | **DOM bound** | `adapter-dom` (`RenderTarget` impl) | n/a |
| Hover popover / ghost panel / toast / legend HUD | **DOM bound** | `adapter-dom` (`RenderTarget` impl) | n/a |
| Modal suppression / z-index ceiling behavior | **DOM bound** | `adapter-dom` | n/a |

**Principle:** `core` owns *what the compiler decides*; adapters own *how a platform
shows and commits it*. The line is "does it touch `document`/`window`/`chrome`?" → if
yes, it is an adapter.

## 3. The C2 contracts (shipped as types this branch)

```
InputSource   — the platform's text surface: read text+selection, subscribe to
                change/geometry events. (textarea, ProseMirror, CodeMirror, VS Code doc)
RenderTarget  — draw underline ranges, show a popover at an anchor, stream ghost text,
                commit text. (DOM overlay, editor decorations, TUI, native)
TransportClient — segment()/enhance()/bind() over the proxy backend; abortable.
                  No surface ever calls a third-party LLM directly (R-PLAT-1).
```

Core is generic over these: `core` never imports a platform; a platform injects an
`InputSource` + `RenderTarget` + `TransportClient` and drives the same state machine.

## 4. Recommended extraction sequence (after review)

1. **(done)** canonical order → core; interfaces defined.
2. Absorb `shared/contracts` + `shared/design` into `core` (pure moves; update import
   paths). Low risk, high tidy-up value.
3. Extract the **section state machine** (segments, acceptance order set, dirty/stale
   propagation, bind-eligibility) into `core` as a pure reducer over `DraftSegment[]` —
   **behind the C3 test harness, which must land first.** This is the DEC-2 crux.
4. Define `adapter-dom` implementing `RenderTarget`/`InputSource`; refactor `index.ts`
   to: instrument → build InputSource → feed core → render via RenderTarget.
5. Extract orchestration (debounce/abort/requestId routing) onto `TransportClient`.

Each step is independently shippable and revertible (plan §7 Track C exit criteria).

## 5. Why we STOP here (escalation, per §7A.5)

Steps 3–5 are the high-blast-radius work and the plan **mandates** they land behind
the C3 test harness with a human-reviewed PR (DEC-2). The current extension test suite
is stale (13 pre-existing failures — see Track A notes), so the harness (C3) is a
prerequisite, not an afterthought. Proceeding into the state-machine extraction now —
without that harness and without a live browser to verify behavior — would risk a
half-extracted monolith. This branch therefore delivers the boundary blueprint + a
proven low-risk slice and hands the high-risk steps to review.

## 6. Open decisions for the reviewer

- **DEC-2 blast radius:** approve the §4 sequence and the `core` vs `adapter-dom` line?
- **`shared/` vs `packages/core`:** absorb `shared/contracts` + `shared/design` into
  `core` (one portable package) or keep `shared/` and have `core` depend on it?
  (This note keeps `core` importing `shared/contracts` transitionally.)
- **Backend canonical order:** unify `backend`'s `canonicalSlotForGoalType` onto the
  same `core` map? (Backend can't import a browser package, but `core` is pure TS and
  could be shared by both — recommended, deferred to avoid backend blast radius now.)
- **Monorepo tooling:** `core` is currently consumed via relative import (like
  `shared/`). Promote to a real workspace package (pnpm/npm workspaces) or keep
  relative? Affects VS Code/web adapters later.
