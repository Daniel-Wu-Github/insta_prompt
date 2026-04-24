# Step 7 Planning Blueprint (Background Service Worker Core)

This document records the completed design and planning outputs for Step 7.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/DATA_MODELS.md`
- `docs/EXTENSION.md`
- `docs/LLM_ROUTING.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_6.md`
- `docs/agent_plans/v1_step_by_step/v1_step_7.md`

## 7.1 Scope Lock and Source of Truth

### Phase 7 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 7 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 7) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Privileged transport owner | The background service worker owns all backend network calls and all stream fan-out to content scripts. The content script never calls backend routes directly. | MV3 boundaries and the proxy-only architecture require a single privileged transport layer. | 7.3 port routing, 7.5 stream normalization |
| Port bridge contract | The content script opens `runtime.onConnect` channels for active tab flows, the background worker accepts them, and the bridge multiplexes backend responses by tab-scoped orchestration state. `SEGMENT` returns a single JSON response over the same Port bridge, while streaming verbs continue to emit backend frames. | The bridge must survive worker churn without inventing a second transport model. | 7.3 port wiring, 7.4 recovery |
| SSE normalization contract | Backend `token`, `done`, and `error` frames are parsed once in the background worker for streaming verbs and forwarded as normalized Port messages in order. | The backend stream contract stays canonical and the worker remains a transport boundary. | 7.5 parsing, 7.7 stream tests |
| Session recovery contract | Per-tab runtime state is persisted in `chrome.storage.session` as a minimal serializable tab-flow record so worker restarts can decide whether to resume the active flow or clear it without crossing browser sessions. | MV3 workers are ephemeral and the architecture explicitly reserves session storage for runtime tab state. | 7.4 recovery flow, 7.7 restart tests |
| Cancel and cleanup contract | `CANCEL` immediately aborts the active backend stream, clears pending tab state, and emits one terminal cleanup result to the content script. | Users need immediate stop semantics and stale transport state must not linger after cancellation. | 7.3 cancel handling, 7.5 terminal cleanup |
| Keepalive contract | The keepalive alarm remains the only background wakeup strategy and must self-heal on startup if it is missing. | Chrome MV3 lifecycle behavior requires a deterministic wakeup path without polling. | 7.6 alarm registration, 7.7 lifecycle tests |
| Step boundary rule | Step 7 implements background transport, session recovery, cancel propagation, and keepalive recovery only; Step 8+ content instrumentation and Step 11 commit behavior remain deferred. | Preserves the Step 7/8 split and avoids UI coupling inside the worker. | 7.2 deferment list, Step 8 readiness |

### Step 7 scope in one paragraph

Step 7 adds the privileged transport layer that carries backend responses from the backend to the active content script, with `SEGMENT` using a single JSON roundtrip and `ENHANCE` / `BIND` using streaming SSE, persists only the per-tab runtime state needed to survive background-worker restarts, and keeps the MV3 worker alive with the existing keepalive alarm pattern. It must not add input instrumentation, overlay rendering, acceptance flow, or final commit behavior. Those concerns remain Step 8+.

### Step 7 deliverables extracted from the overarching plan

1. Port-based bridge between content script and backend, including `SEGMENT` JSON roundtrips and streaming verb forwarding.
2. Per-tab state persistence in `chrome.storage.session`.
3. Keepalive alarm strategy compatible with Chrome >=120 behavior.
4. Immediate cancel propagation from content script to the active background stream.

### Runtime-deferred implementation surface for this planning pass

The following runtime files are intentionally deferred until the Step 7 execution slices:

1. `extension/src/background/index.ts` background transport, stream parsing, recovery, and keepalive behavior.
2. `extension/src/content/index.ts` minimal Port handshake and transport relay only, if required for the bridge.
3. `shared/contracts/domain.ts` only if `TabState` needs a transport-recovery refinement.
4. `shared/contracts/sse.ts` only if the background-to-content event shape needs refinement.
5. `extension/manifest.json` only if the current `storage` / `alarms` permission assumptions are proven insufficient.

Planning rule:

1. Do not modify Step 8+ input instrumentation, overlay rendering, or commit logic during this planning pass.
2. Keep transport wiring confined to the background worker plus the minimal content-script endpoint needed to open the port.
3. Treat any new wakeup strategy beyond the keepalive alarm as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| MV3 process boundaries and background responsibilities | `docs/ARCHITECTURE.md` + `docs/EXTENSION.md` | Defines what the background worker may own and what the content script must not own. |
| Stream-envelope semantics and port forwarding expectations | `docs/BACKEND_API.md` + `docs/LLM_ROUTING.md` | Defines the `token | done | error` contract and the background-to-content forwarding model. |
| Per-tab runtime state and storage choice | `docs/DATA_MODELS.md` + `docs/EXTENSION.md` | Defines `chrome.storage.session` as the planned runtime state surface. |
| UX-level cancel and stream-flow expectations | `docs/UX_FLOW.md` + `docs/CLAUSE_PIPELINE.md` | Defines how port-delivered tokens and cancellation fit the user-facing interaction model. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_7.md` | Defines the execution checklist and done criteria. |

### Step 7 out of scope

1. No textarea/contenteditable discovery or MutationObserver re-attach logic.
2. No mirror overlay, ghost text, or hover preview rendering.
3. No Tab / Shift+Tab acceptance graph or dirty-state invalidation.
4. No Cmd+Enter / Enter / Esc commit flow.
5. No popup mode, account, or usage UX.
6. No backend route, prompt, or SSE contract changes.

## 7.2 Planning Surface and Documentation Boundary

### Numbering convention

1. Taskboard execution numbering (`7.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_7.md`.
2. This planning blueprint uses decision labels (`D1..D7`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as the planning lock.

### Planning-only rule for this pass

1. This file is the scope-lock and contract-alignment reference for Step 7.
2. Session choreography and approval preferences are intentionally excluded.
3. Execution workflow details live in the Step 7 taskboard and repository-wide agent instructions.

### Documentation consistency targets

1. Keep background-bridge language aligned across planning, taskboard, and source-of-truth docs.
2. Keep requirements at contract level (`what must be true`), not implementation micro-details (`how to write each line`).
3. Keep Step 8+ and Step 11 deferments explicit so Step 7 execution does not absorb downstream behavior.

## Design Decisions for Step 7 Execution

### Decision D1: The background worker is the sole privileged transport owner

Rationale:

1. MV3 boundaries require one privileged surface for backend fetches and stream fan-out.
2. Keeping network access inside the background worker avoids direct content-script backend coupling.
3. The proxy-only architecture stays intact when the worker owns request orchestration.

Planning rule:

1. Keep backend fetches in `extension/src/background/index.ts`.
2. Route content-script requests through the background worker, never around it.
3. Do not introduce direct backend calls from the content script or popup.

### Decision D2: Port messages stay finite and deterministic

Rationale:

1. A small verb set makes transport behavior easy to reason about and test.
2. The bridge needs a stable contract for `SEGMENT`, `ENHANCE`, `BIND`, and `CANCEL`.
3. Hidden ad hoc verbs would create a second protocol and increase drift risk.

Planning rule:

1. Accept only the documented transport verbs.
2. Keep request routing deterministic by verb and tab scope.
3. Route `SEGMENT` as a single JSON request/response path and route `ENHANCE` / `BIND` as SSE-backed streaming paths.
4. Reject unknown or malformed bridge messages explicitly.

### Decision D3: Backend SSE stays canonical and is normalized only once

Rationale:

1. The backend already owns the `token`, `done`, and `error` wire contract.
2. Normalizing stream frames in one place prevents duplicate parsing logic across the extension.
3. The background worker should translate, not reinterpret, the backend stream contract.

Planning rule:

1. Parse backend SSE in the background worker only for streaming verbs.
2. Preserve token ordering and one terminal outcome.
3. Forward normalized events to the content script without inventing a new semantic stream contract.
4. Forward `SEGMENT` as a single JSON Port response instead of an SSE stream.

### Decision D4: Per-tab runtime state is minimal and session-backed

Rationale:

1. Worker restarts are normal in MV3 and must not strand active tab flows.
2. `chrome.storage.session` is the planned runtime state surface for tab-scoped recovery.
3. Persisting only the minimum recoverable state keeps restart recovery predictable.

Planning rule:

1. Store only serializable per-tab flow data required for recovery.
2. Keep the record minimal enough to decide whether an in-flight flow should resume or clear after a restart.
3. Do not persist DOM references, provider handles, or raw secrets.
4. Clear state on completion, cancel, or unrecoverable error.

### Decision D5: Cancel and restart recovery must be idempotent

Rationale:

1. Users expect immediate stop behavior when a stream is cancelled.
2. Duplicate terminal signals can corrupt downstream content-script state.
3. Worker restarts must not replay stale terminal events or resurrect completed flows.

Planning rule:

1. `CANCEL` aborts the active backend request and stops forwarding tokens immediately.
2. Emit at most one terminal cleanup result per flow.
3. Treat restart recovery as a deterministic resume-or-clear decision, not a speculative replay.

### Decision D6: Keepalive is self-healing, not polling

Rationale:

1. Chrome MV3 lifecycle behavior should be handled with a deterministic wakeup strategy.
2. Busy loops or polling would waste resources and complicate lifecycle reasoning.
3. The existing alarm pattern is already the correct wakeup primitive for Step 7.

Planning rule:

1. Register the keepalive alarm on startup.
2. Recreate it if it is missing.
3. Do not introduce a second wakeup mechanism.

### Decision D7: Step boundary is strict (`transport + recovery + keepalive` only)

Rationale:

1. Step 8 owns input instrumentation and draft-state transitions.
2. Step 9 owns overlays and previews.
3. Step 10 and Step 11 own acceptance and final commit behavior.

Planning rule:

1. Implement only background transport, persistence, cancel propagation, and keepalive recovery in this step.
2. Keep Step 8+ content instrumentation unchanged.
3. Keep Step 11 commit behavior unchanged.

## File-Level Plan for Remaining Step 7 Slices

### 7.3 Port bridge and verb dispatch

- `extension/src/background/index.ts`
- `extension/src/content/index.ts` (minimal Port handshake or relay only)
- `shared/contracts/domain.ts` (only if tab-state typing needs a transport field refinement)
- `shared/contracts/sse.ts` (only if normalized event typing needs refinement)

Dependencies: Step 6 route contracts and the existing `TabState` / SSE shapes.

Execution order constraint:

1. Establish the runtime port bridge first.
2. Dispatch `SEGMENT`, `ENHANCE`, `BIND`, and `CANCEL` deterministically by verb.
3. Keep the content script fetch-free.

### 7.4 Normalize backend SSE into port-delivered stream events

- `extension/src/background/index.ts`
- `shared/contracts/sse.ts` (only if event typing needs tightening)

Dependencies: 7.3 port wiring complete and backend stream contracts unchanged.

Execution order constraint:

1. Parse backend SSE once in the background worker.
2. Forward `token` events in order.
3. Emit one terminal result only.

### 7.5 Persist and recover per-tab session state

- `extension/src/background/index.ts`
- `shared/contracts/domain.ts` (only if `TabState` needs a recovery-specific refinement)

Dependencies: 7.3 port wiring and 7.4 stream normalization complete.

Execution order constraint:

1. Persist only serializable runtime state required for recovery.
2. Recover active tab flows after a worker restart.
3. Clear stale state on completion, cancel, or unrecoverable error.

### 7.6 Keepalive alarm registration and restart safety

- `extension/src/background/index.ts`
- `extension/manifest.json` (only if the alarm or storage permission assumptions need to change)

Dependencies: 7.3 transport wiring complete.

Execution order constraint:

1. Register the keepalive alarm on startup.
2. Recreate it if missing.
3. Keep the handler side-effect surface minimal.

### 7.7 Add Step 7 test matrix

- `extension/package.json` (only if a real extension test script must be added)
- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `shared/contracts/sse.ts`

Dependencies: 7.3-7.6 runtime behavior complete.

Test boundary rule:

1. Cover Port connect and disconnect behavior.
2. Cover SSE token ordering and one-terminal behavior.
3. Cover session-state persistence and restart recovery.
4. Cover immediate cancel behavior and cleanup.
5. Cover keepalive alarm registration and recreation.
6. Keep validation deterministic and isolated from live backend calls.

### 7.8 Final review and handoff

Goal: ensure Step 7 is complete and Step 8 can begin without reopening transport decisions.

- [ ] Review the diff against Step 7 acceptance criteria.
- [ ] Confirm no Step 8+ content instrumentation or Step 11 commit behavior landed early.
- [ ] Confirm Port transport, session recovery, cancel behavior, and keepalive behavior are covered by validation.
- [ ] Update progress logs and note deferred Step 8 concerns.

Done when:

1. Step 7 taskboard is reflected in code and validation.
2. Step 8 can start without reopening background transport decisions.
3. Out-of-scope behavior remains deferred.

## Step 7 Quality Bar

Treat Step 7 as production transport and recovery work, not temporary scaffolding.

1. Every valid background request is routed through a single privileged transport owner.
2. Port delivery preserves backend stream order and one terminal outcome.
3. Per-tab session recovery survives background-worker restarts without leaking state across browser closes.
4. Cancel and abort paths are deterministic and idempotent.
5. Keepalive behavior is self-healing, not polling.
6. Step 8+ boundaries remain preserved.

## Step 7 Exit Criteria

Do not start Step 8 until all of these are true:

1. Step 7 taskboard is complete.
2. Port bridge and session recovery are deterministic on happy and restart paths.
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