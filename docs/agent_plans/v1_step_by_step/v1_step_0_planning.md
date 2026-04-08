# Step 0 Planning Blueprint (Context-Aware)

This document records the completed design and planning outputs for Step 0.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/EXTENSION.md`
- `docs/BACKEND_API.md`
- `docs/LLM_ROUTING.md`
- `docs/DATA_MODELS.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_0.md`

## 0.1 Scope Lock and Source of Truth

### Step 0 scope in one paragraph

Step 0 is a bootstrap slice that makes the repository safe to build on: define shared contracts, enforce runtime validation at every inbound boundary, establish package scripts and environment templates, and document a reproducible local startup workflow. This phase is foundation-only and must preserve all architecture guardrails (proxy-only LLM calls, MV3 process separation, non-destructive commit behavior, canonical bind order, and tier routing invariants).

### Step 0 deliverables extracted from the overarching plan

1. Finalized API contracts and shared TypeScript types.
2. Runtime validation and consistent validation error envelope.
3. Working package manifests/scripts for backend, extension, and web.
4. Environment example files and secret-handling policy.
5. Local startup and smoke-test runbook.
6. Repeatable Copilot workflow for Step 0 and onward.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Core architecture and guardrails | `docs/ARCHITECTURE.md` + `.github/copilot-instructions.md` | Defines invariants that implementation cannot violate. |
| End-user interaction and non-destructive flow | `docs/UX_FLOW.md` + `docs/CLAUSE_PIPELINE.md` | Defines the compile workflow and state/commit semantics. |
| Backend route contracts and middleware order | `docs/BACKEND_API.md` + `docs/LLM_ROUTING.md` | Defines endpoint shapes, SSE envelope, and tier routing. |
| Persistent model shape | `docs/DATA_MODELS.md` | Defines v1 and v2-ready storage schema intent. |
| Extension process boundaries | `docs/EXTENSION.md` | Defines strict MV3 responsibilities. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_0.md` | Defines done criteria for this phase. |
| Step-wide sequencing intent | `docs/agent_plans/v1_overarching_plan.md` | Defines dependencies across future steps. |

### Step 0 out of scope

1. No full feature UX implementation (no completed underline/hover/commit pipeline behavior yet).
2. No full business logic for segmentation quality or production LLM orchestration.
3. No v2 GitHub OAuth/context ingestion implementation (only v2-ready shape preservation).
4. No bypass of middleware order or direct provider calls from extension code.
5. No schema/routing behavior that conflicts with free-tier Groq and pro-tier model constraints.

## 0.2 Copilot Workflow Surface Plan

### Always-on instruction surfaces (confirmed)

1. `.github/copilot-instructions.md`
2. `.github/skills/SKILL_MAP.md`
3. `.github/skills/*/SKILL.md` (loaded per task classification)

### Reusable prompt surfaces (recommended)

1. `.github/prompts/skills-setup.prompt.md` for portable workflow setup.
2. `.github/prompts/step0-plan-review.prompt.md` for design/planning and review-only passes.
3. `.github/prompts/step0-build-slice.prompt.md` for narrow implementation slices (0.3-0.8).

### One-off prompt rule

Keep one-off prompts in chat when they are highly specific to one file diff or a temporary investigation. Promote to `.github/prompts/` only after the pattern repeats.

### Session and approval strategy for Step 0

1. Planning/review sessions are read-only by default.
2. One editing session per file cluster.
3. Default approvals while scaffold is unstable.
4. Bypass approvals only for mechanical, low-risk edits once tests and typechecks are stable.

## Design Decisions for Step 0.3 and 0.4

### Decision D1: Shared contracts live at repo root in `shared/contracts/`

Rationale:

1. Contracts are cross-layer by definition (backend + extension + future web usage).
2. Root placement avoids backend ownership drift and keeps extension imports first-class.
3. Keeps contract evolution visible and isolated from route/service logic.

Planned files:

- `shared/contracts/domain.ts`
- `shared/contracts/api.ts`
- `shared/contracts/sse.ts`
- `shared/contracts/errors.ts`
- `shared/contracts/index.ts`

### Decision D2: Runtime validation uses Zod 4 with strict schemas

Rationale:

1. Zod gives shared runtime + static types from one source definition.
2. Strict object parsing prevents silent extra-key drift at API boundaries.
3. Error flattening utilities support deterministic client-facing validation errors.

Validation strategy:

1. Every route validates input before business logic.
2. Validation helpers return either typed payload or standardized error response.
3. Route handlers do not duplicate schema logic.

### Decision D3: Standard validation error envelope

Proposed shape for Step 0:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      { "path": "section.goal_type", "message": "Required" }
    ]
  }
}
```

### Decision D4: Canonical goal taxonomy and bind order mapping

1. Goal type enum remains: `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`.
2. Canonical bind order remains: context -> tech_stack -> constraints -> action -> output_format -> edge_cases.
3. The bind-order word `constraints` maps to goal type `constraint` (singular enum value) to avoid naming drift.

### Decision D5: SSE envelope is one contract shared by `/enhance` and `/bind`

`token`, `done`, and `error` remain the only allowed event types for Step 0.

## File-Level Plan for Remaining Step 0 Slices

### 0.3 Shared contracts

- `shared/contracts/**`
- `backend/src/routes/*.ts` (schema imports only)
- `extension/src/**` (type imports only, if needed)
- `backend/src/**/*.test.ts` or `backend/test/**/*.test.ts`

Dependencies: none beyond docs and type runtime library choice.

### 0.4 Runtime validation and error shape

- `backend/src/lib/validation.ts`
- `backend/src/lib/errors.ts`
- `backend/src/routes/segment.ts`
- `backend/src/routes/enhance.ts`
- `backend/src/routes/bind.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/projects.ts`
- `backend/src/**/*.test.ts`

Dependencies: 0.3 contract schemas finalized.

### 0.5 Environment templates and secret policy

- `backend/.env.example`
- `extension/.env.example`
- `README.md` or `docs/` runbook note (secret policy section)

Dependencies: variable list synchronized with backend/extension scripts.

### 0.6 Package manifests and scripts

- `backend/package.json`
- `extension/package.json`
- `web/package.json`
- `backend/tsconfig.json`
- `extension/tsconfig.json`
- `web/tsconfig.json`

Dependencies: 0.3/0.4 determines test/typecheck script needs.

### 0.7 Startup and smoke-test runbook

- `README.md` (or `docs/LOCAL_SETUP.md` if README grows too large)

Dependencies: 0.5 and 0.6 complete.

### 0.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_0.md` (checkboxes)
- `logging/progress_log.md`

Dependencies: all prior Step 0 slices complete and verified.

## Risk Register and Mitigations

1. Risk: Contract drift between docs and route handlers.
   Mitigation: make `shared/contracts/` the only route-schema source.
2. Risk: Validation envelope inconsistencies across routes.
   Mitigation: central validation helper and one shared error factory.
3. Risk: Extension accidentally performs direct provider calls.
   Mitigation: keep provider keys/backend fetch only in backend surfaces.
4. Risk: Early DOM mutation violating UX contract.
   Mitigation: do not implement commit mutation logic in Step 0.
5. Risk: Script naming inconsistency across packages.
   Mitigation: standardize on `dev`, `build`, `test`, `typecheck` minimum set.

## Planning Completion Status

Step 0 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Workflow surfaces are classified into always-on vs reusable prompt vs one-off.
4. Contract/validation design choices are locked for implementation.

Status: Complete for 0.1 and 0.2.
