# Integration Audit: Steps 0-7

## Outcome
Steps 0-6 are largely integrated as a cohesive backend pipeline, with deterministic routing, prompt assembly, streaming, persistence, and segment normalization all covered by tests. Step 7 is present as a background transport layer, but its restart recovery is still clear-only rather than truly resumptive, and the BYOK request path is not actually wired through the production route handlers yet.

## High

1. BYOK routing is not reachable through the production `/enhance` and `/bind` handlers.
Evidence: [backend/src/services/routeHandlers.ts](../../../backend/src/services/routeHandlers.ts#L170), [backend/src/services/routeHandlers.ts](../../../backend/src/services/routeHandlers.ts#L344), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md#L98), [backend/src/services/llm.ts](../../../backend/src/services/llm.ts#L212).
Why this matters: the router contract says BYOK preferences are injected upstream from authenticated profile context, but both production generation handlers hardcode `byokConfig` to `null`. Any `tier: byok` enhance/bind request therefore falls into the unsupported-provider branch instead of the user-configured provider/model path.

## Medium

2. Step 7 restart recovery clears persisted tab state instead of resuming it, and there is no extension test harness to catch regressions.
Evidence: [extension/src/background/index.ts](../../../extension/src/background/index.ts#L89), [extension/src/background/index.ts](../../../extension/src/background/index.ts#L327), [extension/package.json](../../../extension/package.json#L9).
Why this matters: the background worker does persist per-tab state in `chrome.storage.session`, but recovery immediately removes that state and only emits an orphaned-tab error on reconnect. That is deterministic, but it still leaves active flows stranded after a worker restart rather than truly recovering them.

3. Extension documentation now reflects mixed Step 0-7 reality: active Step 7 background bridge with bootstrap-level content instrumentation.
Evidence: [docs/EXTENSION.md](../../EXTENSION.md#L7), [docs/ARCHITECTURE.md](../../ARCHITECTURE.md#L7).
Why this matters: reviewers can now reason about Step 7 transport status without assuming full Step 8+ content instrumentation is already in place.

## What Is Working Well

1. Step 3 model routing and prompt handoff are deterministic and matrix-tested.
Evidence: [backend/src/__tests__/llm.router.test.ts](../../../backend/src/__tests__/llm.router.test.ts#L54), [backend/src/__tests__/llm.handoff.test.ts](../../../backend/src/__tests__/llm.handoff.test.ts#L1), [backend/src/services/llm.ts](../../../backend/src/services/llm.ts#L182).

2. Step 4 segment normalization returns schema-valid fallbacks and stable IDs.
Evidence: [backend/src/services/segment.ts](../../../backend/src/services/segment.ts#L420), [backend/src/__tests__/segment.route.test.ts](../../../backend/src/__tests__/segment.route.test.ts#L103).

3. Step 5 enhance streaming and Step 6 bind persistence both preserve SSE terminal semantics and are covered by route tests.
Evidence: [backend/src/__tests__/enhance.route.test.ts](../../../backend/src/__tests__/enhance.route.test.ts#L103), [backend/src/__tests__/bind.route.test.ts](../../../backend/src/__tests__/bind.route.test.ts#L132), [backend/src/services/routeHandlers.ts](../../../backend/src/services/routeHandlers.ts#L128).

4. Step 7 already centralizes Port verbs, cancel propagation, keepalive alarm registration, and tab-scoped session storage in one background worker surface.
Evidence: [extension/src/background/index.ts](../../../extension/src/background/index.ts#L7), [extension/src/background/index.ts](../../../extension/src/background/index.ts#L541), [extension/src/background/index.ts](../../../extension/src/background/index.ts#L565).

## Open Questions / Assumptions

1. Should BYOK preferences be injected into the route layer now, or is BYOK intentionally deferred until a later auth/profile wiring pass?
2. Is Step 7 restart behavior meant to resume in-flight flows, or is deterministic clearing the intended end state for this stage?
3. Is the extension still intended to be dev-local only, given the hardcoded backend base URL in the background worker and the current bootstrap labels?

## Verification Performed

1. Reviewed the Step 3-7 taskboards and the corresponding runtime surfaces in backend, shared, and extension code.
2. Cross-checked the route-handling, prompt-routing, segment-normalization, SSE, bind persistence, and background bridge implementations against the source-of-truth docs.
3. Inspected the existing backend test coverage for Step 3-6 and confirmed the extension package still exposes no real test command.
4. Did not execute runtime tests in this pass; this audit is based on source inspection and the current checked-in test surfaces.

## Residual Risk and Next Steps

1. Wire authenticated BYOK config into `/enhance` and `/bind` if BYOK is meant to be a live user-facing tier now.
2. Add deterministic extension coverage for Port bridging, cancel, restart recovery, and keepalive behavior before treating Step 7 as fully hardened.
3. Refresh the extension manifest and docs so the current bridge status is described accurately rather than as bootstrap-only surface.

## Documentation Contradiction Closure (Step 0-7)

The following cross-doc contradictions were reconciled in the documentation correction pass and now align with implementation-backed Step 0-7 behavior.

1. Backend route status: `/segment`, `/enhance`, `/bind` are documented as production Step 4-6 behavior, not placeholder-only.
2. Extension runtime status: docs now reflect active Step 7 background bridge plus bootstrap-level content instrumentation.
3. Mode token budgets: standardized to `150 / 500 / 1000`.
4. Runtime state surfaces: tab runtime state documented under extension `chrome.storage.session` (`promptcompiler.tabState.{tab_id}`) with backend Redis keys documented separately.
5. Free-tier cost wording: removed absolute zero-cost claims in architecture wording; retained approximate low-cost framing.
6. RLS examples: write-path examples now match `USING` + `WITH CHECK` guidance.
7. LLM routing table integrity: duplicate/corrupted rows and stray code fragments removed.
8. `/enhance` `project_id` contract wording: documented as nullable optional context hook.
9. Detailed mode wording: chain-of-thought phrasing removed in favor of structured-output wording consistent with prompt constraints.