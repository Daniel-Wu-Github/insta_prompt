# @promptcompiler/core

The platform-agnostic compiler core. **Zero DOM / Node / chrome imports** (plan
R-ARCH-1) so every surface — browser extension, standalone web editor, VS Code, and
future terminal/mobile adapters — consumes it identically and injects its own
`InputSource`, `RenderTarget`, and `TransportClient` (R-ARCH-2).

## Status (Track C)

This is the **boundary spike + first proven slice**, not the finished extraction.
See `docs/agent_plans/v2/c1_core_boundary_spike.md`.

Shipped:
- `clause-order.ts` — canonical clause slot map + stable sort (extracted from the
  content-script monolith; one slot-definition source across surfaces).
- `adapter.ts` — `InputSource` / `RenderTarget` contracts (C2).
- `transport.ts` — `TransportClient` contract (proxy-only, R-PLAT-1).

Sequenced behind the C3 test harness + human review (DEC-2): the section state
machine, dirty/stale propagation, settings model, and orchestration.

## Consumption

Currently imported by relative path (like `shared/`), e.g. from the extension
content script: `import { sortByCanonicalOrder } from "../../../packages/core";`.
Promotion to a real workspace package is an open decision in the spike note.

## Rule

If a unit touches `document` / `window` / `chrome`, it does **not** belong here —
it belongs in an adapter. Core owns *what the compiler decides*; adapters own *how a
platform shows and commits it*.
