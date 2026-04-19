# Background Port Recovery Flow

This reference outlines the expected Step 7 message lifecycle in the background worker.

## Message Lifecycle

1. Content script opens named port.
2. Background validates verb envelope.
3. Background creates request context (`tabId`, `requestId`, `verb`, `startedAt`).
4. Background writes recoverable snapshot to `chrome.storage.session`.
5. Background forwards stream events back to the same port.
6. Terminal event (`done` or `error`) clears request-scoped state.
7. `CANCEL` or `onDisconnect` aborts remote stream and clears state.

## Recovery Rules

1. On worker startup, load pending snapshot keys.
2. Drop malformed or expired entries.
3. Mark unresolved streams as canceled if no live port exists.
4. Keep recovery deterministic and idempotent.

## Contract Notes

1. Payloads are JSON-serializable only.
2. Unknown verbs are rejected immediately.
3. Per-tab state is isolated; no cross-tab leakage.
