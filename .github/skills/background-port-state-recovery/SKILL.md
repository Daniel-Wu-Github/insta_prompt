---
name: background-port-state-recovery
description: "Use when implementing Step 7 background service-worker port verbs, per-tab stream-state persistence, cancel handling, and restart-safe recovery."
user-invocable: false
---

# Background Port State Recovery

## When to Use

Use this skill when implementing or modifying Step 7 background-worker runtime behavior, including:

- `runtime.onConnect` channel handling
- request verb contracts for `SEGMENT`, `ENHANCE`, `BIND`, `CANCEL`
- per-tab runtime state snapshots in `chrome.storage.session`
- disconnect cleanup and restart rehydration behavior
- keepalive alarm checks tied to stream orchestration

## When Not to Use

Do not use this skill for:

- content-script input discovery and listener attachment
- underline and hover preview rendering
- hotkey-to-commit UX behavior
- backend SSE framing or route handler implementation

## Files and Surfaces

Primary files:

- `extension/src/background/index.ts`
- `shared/contracts/sse.ts`
- `shared/contracts/domain.ts`
- `docs/EXTENSION.md`
- `docs/ARCHITECTURE.md`

## Deliverables

- explicit port channel and message-verb contracts
- deterministic per-tab state persistence and recovery
- stable disconnect cleanup and in-flight request cancellation behavior
- restart-safe background initialization flow

## Core Invariants

1. Background worker owns backend fetch and stream relay orchestration.
2. Message payloads are treated as untrusted and validated before privileged actions.
3. Request-scoped state is keyed and recoverable per tab/session.
4. Port disconnect always triggers deterministic cleanup.
5. Keepalive mechanics do not replace persistence; persistence is still required.

## Implementation Procedure

1. Define a typed verb envelope for `SEGMENT`, `ENHANCE`, `BIND`, and `CANCEL`.
2. Validate incoming port messages before routing.
3. Create per-request and per-tab state keys for active streams.
4. Persist minimal recoverable snapshot state in `chrome.storage.session`.
5. Handle `onDisconnect` for stream abort and state cleanup.
6. Rehydrate session state at worker startup and reject stale/expired work deterministically.
7. Add smoke checks for connect, reconnect, cancel, and restart paths.

## Verification Checklist

- port handlers reject unknown verbs and malformed payloads
- request lifecycle supports immediate cancel semantics
- session snapshot is written and read through `chrome.storage.session`
- restart does not leave orphaned active-stream state
- disconnect cleanup runs on both normal and abrupt teardown

## References

- [Background port recovery flow](references/BACKGROUND_PORT_RECOVERY.md)
- `docs/EXTENSION.md`
- `docs/ARCHITECTURE.md`
