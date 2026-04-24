# Step 7 - Background Service Worker Core

This is the tactical workboard for Step 7 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to add the background transport layer, per-tab session recovery, and keepalive self-healing while preserving Step 8+ content and Step 11 commit boundaries.

Step 7 is done when the repo has:

1. A production background service worker bridge that accepts Port connections and forwards backend responses to the content script.
2. Deterministic verb routing for `SEGMENT`, `ENHANCE`, `BIND`, and `CANCEL`, with `SEGMENT` returning a single JSON response and streaming verbs forwarding backend SSE.
3. Per-tab runtime state persisted in `chrome.storage.session` so worker restarts do not strand active flows.
4. Immediate cancel propagation that aborts the active backend stream and clears pending state.
5. Keepalive alarm self-registration and recovery on startup.
6. Tests or deterministic validation that cover port bridging, `SEGMENT` response delivery, restart recovery, cancel behavior, and alarm behavior.
7. No Step 8+ content instrumentation, overlay rendering, acceptance, or commit behavior leakage.

## Step 7 Taskboard

### 7.0 Readiness and dependency lock

Goal: ensure Step 3, Step 5, and Step 6 contracts are stable before Step 7 transport work lands.

- [ ] Confirm Step 3 router and prompt contracts still provide stable backend request shapes for `/segment`, `/enhance`, and `/bind`.
- [ ] Confirm Step 5 and Step 6 SSE envelopes still use the shared `token | done | error` stream contract for streaming verbs, and that `SEGMENT` remains a single JSON roundtrip.
- [ ] Confirm the background worker remains the only privileged surface for backend fetches.
- [ ] Confirm the current keepalive alarm exists and can be self-healed without adding new wakeup primitives.
- [ ] Confirm `chrome.storage.session` is the intended runtime state surface for tab-scoped recovery.

Done when:

1. Preconditions are explicit.
2. Background transport assumptions are verified.
3. Step 7 starts from locked Step 3, Step 5, and Step 6 behavior.

### 7.1 Lock scope and source of truth

Goal: make Step 7 boundaries explicit before coding.

- [ ] Read architecture, backend API, clause pipeline, data models, extension, LLM routing, UX flow, and the Step 7 slice in the overarching plan.
- [ ] Extract the exact Step 7 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 8+ content instrumentation, Step 9 overlays, Step 10 acceptance, and Step 11 commit behavior.
- [ ] Record file-level ownership for background orchestration, Port transport, session persistence, and keepalive recovery.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 7.2 Confirm implementation surface and deferments

Goal: keep Step 7 focused on background transport, recovery, and keepalive behavior only.

- [ ] Confirm Step 7 runtime changes are limited to background orchestration, Port transport, and session-recovery surfaces.
- [ ] Confirm Step 8+ content state machine, underlines, acceptance, and commit behavior remain deferred.
- [ ] Confirm no backend route or SSE contract changes are required for Step 7.
- [ ] Confirm Step 7 validation focuses on transport, restart recovery, cancel behavior, and alarm lifecycle.

Runtime-deferred implementation files for Step 7:

1. `extension/src/content/index.ts` beyond the minimal Port endpoint needed for the bridge.
2. `extension/src/popup/**` mode and account UX surfaces.
3. Step 8-11 content instrumentation, overlay rendering, acceptance queue, and commit behavior surfaces.
4. `backend/src/**` route or model logic changes.

Done when:

1. File touch surface is explicit and narrow.
2. Deferred Step 8+ behavior is explicit.
3. Step 7 execution can start without scope ambiguity.

### 7.3 Implement Port bridge and verb dispatch

Goal: connect content-script Port channels to background-driven backend orchestration.

- [ ] Add a `runtime.onConnect` handler for tab-scoped stream channels.
- [ ] Make the content script the Port initiator and the background worker the Port acceptor.
- [ ] Implement deterministic verb dispatch for `SEGMENT`, `ENHANCE`, `BIND`, and `CANCEL`.
- [ ] Route `SEGMENT` as a single JSON request/response path through the bridge instead of as an SSE stream.
- [ ] Keep the content script fetch-free and route all backend requests through the background worker.
- [ ] Ensure unknown or malformed bridge messages are rejected deterministically.

Allowed files for this slice:

- `extension/src/background/index.ts`
- `extension/src/content/index.ts` (minimal Port handshake or relay only)
- `shared/contracts/domain.ts` (only if tab-state typing needs a transport refinement)
- `shared/contracts/sse.ts` (only if normalized event typing needs refinement)

Done when:

1. The worker accepts Port connections for active tabs.
2. Transport verbs route deterministically.
3. The content script never talks to backend routes directly.

### 7.4 Normalize backend SSE into Port-delivered events

Goal: translate backend stream frames into ordered Port messages.

- [ ] Parse backend SSE chunks in the background worker without buffering the full response.
- [ ] Limit SSE normalization to streaming verbs and keep `SEGMENT` out of the SSE parser path.
- [ ] Forward `token` events to the active Port in order.
- [ ] Emit one terminal result only per request.
- [ ] Map backend failures and aborts to deterministic cleanup events.

Allowed files for this slice:

- `extension/src/background/index.ts`
- `shared/contracts/sse.ts` (only if event typing needs tightening)

Done when:

1. Stream forwarding is deterministic and ordered.
2. Duplicate or mixed terminal events are suppressed.
3. The backend SSE contract remains unchanged.

### 7.5 Persist and recover per-tab session state

Goal: survive background-worker restarts without losing active tab orchestration.

- [ ] Store only serializable runtime state required for recovery in `chrome.storage.session`.
- [ ] Keep the persisted state minimal enough to decide whether an in-flight flow should resume or clear after a restart.
- [ ] Recover active flows after a worker restart and resume or clear them deterministically.
- [ ] Clear stale state on completion, cancel, or unrecoverable error.
- [ ] Keep persisted state free of DOM references, provider handles, and secrets.

Allowed files for this slice:

- `extension/src/background/index.ts`
- `shared/contracts/domain.ts` (only if `TabState` needs a recovery-specific refinement)

Done when:

1. Worker restarts do not strand active tab flows.
2. Session state stays minimal and serializable.
3. Restart recovery is deterministic.

### 7.6 Keepalive alarm registration and restart safety

Goal: keep the MV3 worker alive with a self-healing alarm path.

- [ ] Register the keepalive alarm on startup.
- [ ] Recreate the alarm if it is missing.
- [ ] Keep the wakeup logic minimal and non-polling.
- [ ] Confirm alarm handlers do not own transport state.

Allowed files for this slice:

- `extension/src/background/index.ts`
- `extension/manifest.json` (only if the alarm or storage permission assumptions need to change)

Done when:

1. The keepalive alarm is present after startup.
2. Missing alarms are recreated automatically.
3. The worker does not rely on busy loops or polling.

### 7.7 Add Step 7 test matrix

Goal: prove transport, recovery, cancel, and alarm behavior.

- [ ] Add tests or deterministic validation for Port connect and disconnect behavior.
- [ ] Add tests or deterministic validation for `SEGMENT` single-response delivery plus SSE token ordering and one-terminal behavior.
- [ ] Add tests or deterministic validation for session-state persistence, restart recovery, and the resume-or-clear decision.
- [ ] Add tests or deterministic validation for immediate cancel behavior and cleanup.
- [ ] Add tests or deterministic validation for keepalive alarm registration and recreation.
- [ ] Keep validation deterministic and isolated from live backend calls.

Allowed files for this slice:

- `extension/package.json` (only if a real extension test script must be added)
- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `shared/contracts/sse.ts`

Done when:

1. Transport and recovery behavior are regression-resistant.
2. Cancel and restart paths are deterministic.
3. The alarm lifecycle is covered.

### 7.8 Final review and handoff

Goal: ensure Step 7 is complete and Step 8 can begin without reopening transport decisions.

- [ ] Review the diff against Step 7 acceptance criteria.
- [ ] Confirm no Step 8+ content instrumentation or Step 11 commit behavior landed early.
- [ ] Confirm Port transport, session recovery, cancel behavior, and keepalive behavior are covered by validation.
- [ ] Update progress logs and note deferred Step 8 concerns.

Done when:

1. Step 7 taskboard is reflected in code and validation.
2. Step 8 can start without reopening background transport decisions or the `SEGMENT` response path.
3. Out-of-scope behavior remains deferred.

## Step 7 Quality Bar

Treat Step 7 as production transport and recovery work, not temporary scaffolding.

1. Every valid background request is routed through a single privileged transport owner.
2. Port delivery preserves backend stream order and one terminal outcome for streaming verbs, while `SEGMENT` returns exactly one JSON response.
3. Per-tab session recovery survives background-worker restarts without leaking state across browser closes.
4. Cancel and abort paths are deterministic and idempotent.
5. Keepalive behavior is self-healing, not polling.
6. Step 8+ boundaries remain preserved.

## Step 7 Exit Criteria

Do not start Step 8 until all of these are true:

1. Step 7 taskboard is complete.
2. Port bridge, `SEGMENT` response delivery, and session recovery are deterministic on happy and restart paths.
3. Cancel cleanup is immediate and reproducible.
4. Keepalive alarm recovery passes validation.
5. Step 7 transport/restart/cancel/alarm validation passes.
6. No Step 8+ content or Step 11 commit behavior was implemented early.

## Short Version You Can Remember

1. Lock Step 7 scope before touching the worker.
2. Route all backend fetches through the background service worker.
3. Forward backend SSE into Port messages in order.
4. Persist only the minimum per-tab state needed for restart recovery.
5. Make cancel and keepalive behavior deterministic and idempotent.
6. Hand off to Step 8 only after Step 7 boundaries are clean.