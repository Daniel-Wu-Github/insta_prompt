---
name: mv3-extension-boundaries
description: "Use when implementing Step 5 extension behavior to preserve strict MV3 boundaries across content script, background service worker, and popup."
user-invocable: false
---

# MV3 Extension Boundaries

## When to Use

Use this skill when implementing or changing extension architecture surfaces, including:

- content script DOM instrumentation
- background service worker network and state orchestration
- popup state and sync settings behavior
- runtime Port messaging and storage responsibilities
- keepalive behavior for service worker lifecycle

## When Not to Use

Do not use this skill for:

- backend model routing or prompt assembly
- section taxonomy and canonical ordering logic
- direct route-level middleware enforcement

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `extension/src/background/index.ts`
- `extension/src/popup/`
- `docs/EXTENSION.md`
- `docs/ARCHITECTURE.md`

## Deliverables

- strict separation of DOM, network, and popup concerns
- deterministic state ownership across storage scopes
- safe runtime messaging and stream relay behavior
- service-worker keepalive behavior that tolerates MV3 lifecycle constraints

## Core Invariants

1. Content script owns DOM interaction and hotkey behavior.
2. Background service worker owns backend fetch and privileged orchestration.
3. Popup owns settings UX and sync-level preference storage.
4. Cross-context coordination uses runtime messaging and storage APIs.
5. Extension code never bypasses the backend proxy model.

## Boundary Rules

- Content script: DOM and interaction layer only.
- Background SW: network and per-tab orchestration layer only.
- Popup: settings and account/status UX layer only.

Use message contracts between layers and avoid implicit shared globals.

## Implementation Procedure

1. Confirm responsibility ownership before writing any extension logic.
2. Define explicit message verbs and payload schemas for cross-context communication.
3. Persist per-tab runtime state in the appropriate storage scope.
4. Add keepalive and recovery logic for SW restarts where needed.
5. Add tests or smoke checks for reconnect/recovery and message routing.

## Verification Checklist

- no backend API calls from content script
- no DOM operations from background service worker
- popup writes settings to sync storage only as intended
- messaging contracts are explicit and validated
- keepalive/recovery behavior is present for long-lived operations

## References

- [MV3 boundary matrix](references/MV3_BOUNDARY_MATRIX.md)
- `docs/EXTENSION.md`
- `docs/ARCHITECTURE.md`
