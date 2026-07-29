# SSE Bridge Flow

## End-to-End Path

1. Backend emits `text/event-stream` with `token`, `done`, `error` events.
2. Background service worker consumes stream chunks and parses SSE frames.
3. Background forwards parsed events over runtime Port.
4. Content script accumulates token payload into preview state.
5. Terminal event (`done` or `error`) closes stream state.

## Parsing Rules

- handle partial chunks by maintaining a carry buffer
- parse complete event frames only
- ignore malformed fragments safely and emit controlled error when needed

## Abort Rules

- content-side cancel triggers Port disconnect
- Port disconnect triggers background abort
- background abort releases backend stream resources

## Failure Cases

- backend error mid-stream: emit deterministic `error` event and cleanup
- parser failure: terminate stream and emit controlled error
- duplicate terminal events: ignore secondary terminal events via completion guard
