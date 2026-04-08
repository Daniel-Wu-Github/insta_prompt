# Step 0 - Project Bootstrap and Working Agreements

This is the tactical workboard for Step 0 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to turn the repo from a scaffold into a stable foundation that later steps can build on without rework.

Step 0 is done when the repo has:

1. Shared contract definitions for core app data.
2. Runtime validation for every external boundary.
3. Package manifests and scripts for backend, extension, and web.
4. Environment templates and startup docs.
5. A repeatable Copilot workflow that you can reuse for the rest of V1.

## How To Vibe Code Step 0 In VS Code

Use GitHub Copilot Chat like a small production team, not like a single giant chatbot.

### Recommended session layout

Use 3 chat sessions, but only 2 should be active at the same time.

1. Plan session: one session, local Plan agent, read-only.
2. Build session: one session, local Agent, edit and run tools.
3. Review session: one session, local Ask agent, read-only audit and debugging.

For Step 0, do not run more than one editing agent on the same file cluster at once. This step is mostly shared scaffolding, so parallel writers create avoidable merge churn.

If you want the simplest possible setup, use only 2 sessions:

1. Plan or Ask for analysis.
2. Agent for implementation.

Add the Review session only when the first slice is complete and you need a clean audit of the diff.

### Which Copilot mode to use for each phase

1. Plan agent: create the taskboard, sequence the work, identify risks, and define done criteria.
2. Ask agent: inspect the codebase, locate missing files, explain dependencies, and answer narrow questions.
3. Agent: make the actual file changes, run checks, and fix errors.

For a first-time vibe coder, keep permissions conservative.

1. Use Default Approvals while the scaffold is still changing.
2. Use Bypass Approvals only for mechanical edits after the tests are stable.
3. Avoid Autopilot on Step 0 unless the task is tiny and the file list is extremely narrow.

### Prompt pattern that works best

Use short prompts with five parts:

1. Goal.
2. Context.
3. Allowed files.
4. Constraints.
5. Exit condition.

Good prompts are specific enough that the agent can finish without guessing. Bad prompts ask for the whole step in one shot.

Example planning prompt:

```text
Read [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/BACKEND_API.md](../../BACKEND_API.md), [docs/DATA_MODELS.md](../../DATA_MODELS.md), [docs/EXTENSION.md](../../EXTENSION.md), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md), and [docs/UX_FLOW.md](../../UX_FLOW.md).

Create a Step 0 taskboard only.

Output format:
- task
- files touched
- dependencies
- acceptance criteria
- risk

Do not edit files.
```

Example build prompt:

```text
Implement only Step 0.3.

Allowed files:
- shared/contracts.ts
- backend/src/**
- extension/src/** only if the task explicitly requires it

Constraints:
- keep the changes minimal
- do not change unrelated code
- add tests for the new contract layer
- stop when this slice is complete

If a design choice is ambiguous, pick the smallest safe option and explain the tradeoff.
```

Example review prompt:

```text
Review #changes against the Step 0 acceptance criteria.

Find:
- missing files
- contract mismatches
- test gaps
- architecture drift

Do not edit files.
```

### Best-practice rules to follow every time

1. Start a fresh session when changing from planning to implementation.
2. Fork a session if you want to explore an alternate design without losing the original branch.
3. Keep one active builder session per file cluster.
4. Use `#codebase` when you want the agent to reason over the repo.
5. Use `#changes` when you want the agent to review the diff.
6. Use `#problems` when you want the agent to fix errors.
7. Use checkpoints before risky edits so you can roll back quickly.
8. Save a prompt as a reusable `.prompt.md` file only after the workflow stabilizes.
9. Keep always-on repo instructions short and high-signal; do not duplicate them in every prompt.

### What not to do

1. Do not ask one agent to design, implement, review, and debug the same slice in one prompt.
2. Do not keep more than 3 live sessions for Step 0.
3. Do not let two agent sessions edit the same manifest or shared contract file at the same time.
4. Do not start with implementation before the taskboard is stable.
5. Do not use giant prompts with open-ended scope.

## Step 0 Taskboard

### 0.1 Lock scope and source of truth

Goal: make Step 0 unambiguous before writing code.

- [x] Read the architecture, backend API, data model, extension, LLM routing, and UX flow docs.
- [x] Extract the exact Step 0 deliverables from the overarching plan.
- [x] Decide which files are source-of-truth for contracts, config, and runbooks.
- [x] Write down what Step 0 will not do.

Copilot session:

- Plan agent first.
- If you need repo-specific answers, use Ask with `#codebase`.

Prompt:

```text
You are planning Step 0 only.

Read the repo docs and return a taskboard for Step 0 with file-level scope, dependencies, and done criteria.

Do not suggest Step 1 work.
Do not edit files.
```

Done when:

1. You can state the Step 0 scope in one paragraph.
2. You have a clear file map for the bootstrap work.
3. You know which pieces are out of scope for this step.

### 0.2 Set up the Copilot workflow surface

Goal: make the repo easy to work on repeatedly without rewriting context.

- [x] Confirm the existing always-on instruction surface is the right place for project-wide rules.
- [x] Decide whether any reusable prompt files are needed for recurring Step 0 work.
- [x] Make sure the step is aligned with the current repository instructions and architecture guardrails.
- [x] Keep the instructions concise enough that Copilot can follow them without noise.

Copilot session:

- Ask agent for a workspace audit.
- Plan agent if you need to rewrite the workflow for clarity.

Prompt:

```text
Inspect the current workspace instruction surfaces and tell me how to keep Step 0 prompts short, reusable, and aligned with the repo rules.

Focus on the best way to use Copilot Chat, prompt files, and custom instructions for this repo.
```

Done when:

1. You know which instructions are always-on.
2. You know which prompts are one-off and which should become reusable.
3. You are not duplicating the same rule in multiple places.

### 0.3 Define the shared contract layer

Goal: stop shape drift before any route or UI work starts.

- [x] Define the core domain types.
- [x] Define request and response schemas for backend routes.
- [x] Define the SSE event envelope used by streaming endpoints.
- [x] Decide whether the shared contracts live in a repo-level `shared/` area or in the first app that owns them.
- [x] Add tests that prove the contracts match the docs.

Suggested contract set:

- `GoalType`
- `Mode`
- `Section`
- `SectionStatus`
- `TabState`
- `SegmentRequest`
- `SegmentResponse`
- `EnhanceRequest`
- `BindRequest`
- `StreamEvent`

Copilot session:

- Agent session.
- Keep it focused on contracts only.

Prompt:

```text
Create the shared contract layer for Step 0.

Use the docs as the source of truth for the core types and streaming envelope.

Rules:
- keep the contracts small and explicit
- validate all inbound request shapes
- make the types easy to reuse by backend and extension code later
- add tests or fixtures if needed

Stop after the contract layer is complete.
```

Done when:

1. Every Step 0 shape has a named type.
2. The contracts can be imported without circular dependencies.
3. Validation fails fast for invalid payloads.

### 0.4 Build the runtime validation and error shape

Goal: make boundary failures boring and predictable.

- [x] Add validation for all route inputs.
- [x] Add a small error format for validation failures.
- [x] Standardize the way route handlers report bad requests.
- [x] Add tests for invalid payloads and empty payloads.

Copilot session:

- Agent session.
- Ask session only if you need help deciding the minimal error format.

Prompt:

```text
Implement the validation layer for Step 0.

I want one consistent error shape for invalid input across the backend.
Keep the implementation minimal and compatible with the future route handlers.

Do not build any business logic yet.
```

Done when:

1. Invalid input returns the same shape every time.
2. The validation code is reusable by future routes.
3. The tests cover both schema and error output.

### 0.5 Create environment templates and secret policy

Goal: make local setup obvious before any real feature work begins.

- [x] Add `.env.example` files for backend and extension.
- [x] Include every required variable with a clear placeholder.
- [x] Document which secrets are required locally and which belong to deployment only.
- [x] Add a short warning about never committing real secrets.

Suggested backend variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY`
- `ANTHROPIC_API_KEY`
- `UPSTASH_REDIS_URL`
- `UPSTASH_REDIS_TOKEN`
- `JWT_SECRET`
- `PORT`

Suggested extension variables:

- `VITE_API_BASE_URL`
- any build-time flag needed by the popup or background worker

Copilot session:

- Agent session.
- If the env shape is uncertain, use Ask to inspect the architecture docs first.

Prompt:

```text
Create the environment example files and a short secret-handling note for Step 0.

Keep the variables aligned with the docs and with the bootstrap work only.
Do not invent extra secrets unless the repo actually needs them.
```

Done when:

1. A newcomer can tell what needs to be set locally.
2. No secret is hardcoded in docs or code.
3. Each variable has a single obvious purpose.

### 0.6 Create package manifests, scripts, and workspace commands

Goal: make the repo runnable before the product exists.

- [x] Fill in `backend/package.json`.
- [x] Fill in `extension/package.json`.
- [x] Fill in `web/package.json`.
- [x] Add dev, build, test, and typecheck scripts.
- [x] Add the minimum command set needed to run each app locally.
- [x] Make sure the scripts are boring and obvious.

Because the package manifests are currently empty, this task is not a cleanup pass. It is the first real bootstrap of the repo.

Recommended minimum scripts per package:

- `dev`
- `build`
- `test`
- `typecheck`
- `lint` if you are actually going to use it right away

Copilot session:

- Agent session.
- Use a separate Ask session if you want to sanity-check the exact script names before editing.

Prompt:

```text
Create the package manifests and scripts needed for Step 0.

Focus on the smallest set of scripts that makes the repo runnable and testable.

Keep the scripts explicit and easy to remember.
Do not add optional tooling just because it exists.
```

Done when:

1. Each workspace package has a clear entrypoint for development.
2. The scripts are consistent enough to remember without looking them up.
3. The repo can be started from the docs without guessing command names.

### 0.7 Write the local startup and smoke-test runbook

Goal: make future debugging cheaper.

- [x] Write the commands needed to start backend, extension, and web.
- [x] Add a smoke-check list for the minimum viable local boot.
- [x] Include what to expect when each app is healthy.
- [x] Include the first place to look when something fails.

Suggested smoke test order:

1. Start backend.
2. Start extension.
3. Start web dashboard if needed.
4. Verify environment variables are loaded.
5. Verify typecheck or build passes.
6. Verify a basic end-to-end request path is at least reachable.

Copilot session:

- Ask or Agent, depending on whether you are still writing or already editing docs.

Prompt:

```text
Write the Step 0 local startup and smoke-test runbook.

It should be short, specific, and usable by someone who has never opened the repo before.
Include the exact order to start services and the first smoke checks to run.
```

Done when:

1. A newcomer can boot the repo using the runbook alone.
2. The smoke checks tell you what healthy looks like.
3. The failure checklist points to the right next action.

### 0.8 Final Step 0 review and handoff

Goal: make sure the bootstrap is actually usable before moving to Step 1.

- [x] Review the diff against the Step 0 acceptance criteria.
- [x] Check for missing tests or missing env values.
- [x] Confirm the taskboard matches the code and docs.
- [x] Archive or close the sessions you no longer need.
- [x] Save the best prompt you used if it is worth reusing later.

Copilot session:

- Review session with Ask or a read-only Agent setup.

Prompt:

```text
Review the Step 0 work against the taskboard.

Tell me what is missing, what is risky, and what should be fixed before Step 1 starts.
Do not make edits unless I explicitly ask for them.
```

Done when:

1. The Step 0 board is reflected in the files.
2. The bootstrap is repeatable.
3. You are ready to move on without reopening the same questions.

## Step 0 Quality Bar

Treat Step 0 as production work, not throwaway scaffolding.

1. Every boundary gets a type or schema.
2. Every file path is explicit.
3. Every prompt has a stop condition.
4. Every slice ends with a verification check.
5. Every decision that matters is written down.

## Step 0 Exit Criteria

Do not start Step 1 until all of these are true:

1. The Step 0 taskboard is complete.
2. The contract layer is defined.
3. The validation layer is in place.
4. The package manifests and scripts are live.
5. The env templates exist.
6. The startup runbook exists.
7. You can explain the Copilot workflow in under a minute.

## Short Version You Can Remember

1. Use Plan to break the work down.
2. Use Ask to inspect and verify.
3. Use Agent to edit one slice at a time.
4. Keep only 2 or 3 sessions alive.
5. Keep prompts narrow and file-specific.
6. Verify after every slice.
7. Save the reusable prompt only after it works.
