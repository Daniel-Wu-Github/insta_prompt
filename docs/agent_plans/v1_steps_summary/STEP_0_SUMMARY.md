# Step 0 Summary: Strict Foundation Rebuild

Step 0 now intentionally provides only bootstrap scaffolding:

1. Shared contracts in `shared/contracts/`.
2. Runtime validation and a deterministic validation error envelope.
3. Minimal package scripts (`dev`, `build`, `test`, `typecheck`) for backend, extension, and web.
4. Environment templates for backend, extension, and web.
5. Startup and smoke-test runbook coverage.

## What Is Implemented

- Backend route boundaries with strict Zod validation.
- Middleware ordering: auth -> rate limit -> tier.
- Deterministic SSE envelope with `token`, `done`, and `error` event types.
- Step 0 placeholder route behavior for `/segment`, `/enhance`, and `/bind`.
- Validation and stress tests for route envelopes and middleware behavior.

## What Is Explicitly Deferred

- No production segmentation quality logic.
- No production LLM orchestration/provider calls.
- No production persistence wiring.
- No full extension UX behavior (ghost text, underline pipeline, commit mutation).

## Verification Targets

Use these commands from repository root:

```bash
bash scripts/smoke-tests.sh

cd backend
npm install
bun test
npm run typecheck
```

For extension and web package checks:

```bash
cd extension && npm install && npm run typecheck && npm run build
cd ../web && npm install && npm run typecheck && npm run build
```
