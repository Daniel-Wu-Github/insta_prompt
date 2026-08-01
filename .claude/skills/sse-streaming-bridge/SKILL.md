---
name: sse-streaming-bridge
description: "Use when implementing Step 5 token streaming from backend SSE through background ports into content script preview state, including abort cleanup."
user-invocable: false
---

# SSE Streaming Bridge

## When to Use

Use this skill when implementing or modifying streaming behavior across backend and extension layers, including:

- SSE event generation in backend routes
- background service worker stream parsing and forwarding
- content-script token consumption for preview updates
- abort and cancel propagation from UI to backend

## When Not to Use

Do not use this skill for:

- canonical slot ordering policies
- rate-limiting or tier middleware
- non-streaming endpoint validation behavior

## Files and Surfaces

Primary files:

- `backend/src/lib/sse.ts`
- `backend/src/routes/enhance.ts`
- `backend/src/routes/bind.ts`
- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `shared/contracts/sse.ts`

Primary docs:

- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/EXTENSION.md`

## Deliverables

- deterministic SSE envelope generation on backend
- deterministic stream parsing and forwarding in background worker
- deterministic token accumulation and terminal-state handling in content script
- safe cancellation and cleanup behavior on disconnect/abort

## Core Invariants

1. SSE envelope is limited to `token`, `done`, and `error`.
2. Token events arrive in order for a given stream.
3. Terminal event handling is explicit and idempotent.
4. Abort from UI must release backend stream resources promptly.
5. Stream cleanup must run on both success and failure paths.

## Implementation Procedure

1. Confirm shared stream-event contract in `shared/contracts/sse.ts`.
2. Implement backend stream writer with deterministic event framing.
3. Implement background stream parser with explicit chunk-buffer handling.
4. Forward parsed events through runtime Port to the active content consumer.
5. Implement content token accumulation and terminal-state transition handling.
6. Implement abort propagation and ensure disconnect closes remote stream.
7. Add tests/smokes for complete, cancel, and error stream paths.

## Error and Abort Rules

- emit `error` event for recoverable stream failures
- always close stream and clear per-request state after terminal event
- avoid double-terminal handling by using explicit completion guard

## Verification Checklist

- backend emits valid SSE envelope for token/done/error
- background parser handles chunk boundaries correctly
- content layer handles token order and terminal events deterministically
- abort from content disconnects stream and frees backend resources
- no stale stream state remains after completion or cancellation

## References

- [SSE bridge flow](references/SSE_BRIDGE_FLOW.md)
- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/EXTENSION.md`
