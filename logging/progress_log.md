# Progress Log

## Entry 001 - 2026-03-29 - Added Always-On Project Instructions

- Task: Add always-on workspace instructions for PromptCompiler workflow and architecture guardrails.
- What the agent did: Added a new always-on instruction file and captured core philosophies, guardrails, and operating requirements from repository docs.
- How the agent did it: Created the instruction file in the repo customization surface and populated it from the canonical docs set.
- Files edited:
	- .github/copilot-instructions.md
- Verification:
	- Confirmed the instruction file exists at the expected path.
	- Confirmed the file format is valid and has no schema/frontmatter diagnostics.
- Task alignment:
	- Fulfillment: Established always-on project instructions as requested.
	- Deviation: None.

## Entry 002 - 2026-03-29 - Standardized Workflow Logging Entries

- Task: Ensure the logging skill correctly updates this log using numbered, dated entries with clear execution and verification details.
- What the agent did: Updated the logging skill to require a strict entry schema and migrated this progress log to that schema.
- How the agent did it: Reviewed current skill and log files, defined required entry fields and rules in the skill, then rewrote log entries into the mandated format.
- Files edited:
	- .github/skills/workflow-logging/SKILL.md
	- logging/progress_log.md
- Verification:
	- Checked that each log entry is numbered, dated (ISO `YYYY-MM-DD`), and has a quick title.
	- Checked that each entry includes: task, what was done, how it was done, files edited, verification steps, and task alignment (fulfillment/deviation).
- Task alignment:
	- Fulfillment: Implements the exact entry-format requirements requested for ongoing agent logging.
	- Deviation: None.

## Entry 003 - 2026-03-29 - Added Automatic Remote Commit Logging

- Task: Add automatic branch-sectioned logging for commits pushed to remote, as an extension of commit messages.
- What the agent did: Added a new remote commit logging skill, extended logging workflow guidance, created a `post-push` hook script that appends detailed commit/file data by branch, and initialized the commit log file.
- How the agent did it: Researched git hook behavior, updated skill governance surfaces, implemented hook automation in `.githooks/post-push`, and wired documentation in skills and logs.
- Files edited:
	- .github/skills/SKILL_MAP.md
	- .github/skills/workflow-logging/SKILL.md
	- .github/skills/remote-commit-logging/SKILL.md
	- .githooks/post-push
	- logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- Confirmed skill map includes the new skill and registry path.
	- Confirmed hook script exists and has valid shell syntax.
	- Confirmed repository hooks path is set to `.githooks` (`git config --get core.hooksPath`).
	- Ran simulated push payload through `.githooks/post-push` and verified branch-grouped commit output with file-level details.
	- Confirmed commit log file exists with automation header.
	- Confirmed diagnostics show no markdown/frontmatter issues for edited skill/log files.
- Task alignment:
	- Fulfillment: Provides automatic remote-push commit logging grouped by branch with commit-level file details.
	- Deviation: None.

## Entry 004 - 2026-03-29 - Fixed Hook Stage for Remote Commit Logging

- Task: Fix remote commit logging not running after `git push`.
- What the agent did: Replaced unsupported local `post-push` hook with supported `pre-push` hook, migrated script/docs references, and preserved branch-sectioned commit detail logging.
- How the agent did it: Verified Git hook documentation, rewired hook file path and skill guidance, then validated by simulated push input and diagnostics.
- Files edited:
	- .githooks/pre-push
	- .github/skills/remote-commit-logging/SKILL.md
	- .github/skills/workflow-logging/SKILL.md
	- logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- Confirmed `.githooks/pre-push` exists and has valid shell syntax.
	- Confirmed `core.hooksPath` remains `.githooks`.
	- Ran simulated push through `.githooks/pre-push` and verified branch-grouped commit entries with file-level details.
	- Confirmed diagnostics show no issues in edited files.
- Task alignment:
	- Fulfillment: Restores automatic log updates during `git push` by using an actual supported Git client hook.
	- Deviation: None.

## Entry 005 - 2026-03-29 - Verified Push Trigger and Backfilled Missed Commit

- Task: Ensure remote commit log updates automatically on `git push` and recover the missed `skills` push entry.
- What the agent did: Ensured `.githooks/pre-push` is executable, verified automatic trigger with a dry-run push, and backfilled the missed `main` push range into `logging/commit_log.md`.
- How the agent did it: Set executable mode, ran a dry-run push with temporary log target to confirm hook invocation, then replayed the actual pushed range (`12d3aed..1c3930a`) into the real commit log.
- Files edited:
	- .githooks/pre-push
	- logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- Confirmed hook file mode is executable (`-rwxr-xr-x`).
	- Confirmed `core.hooksPath` remains `.githooks`.
	- Confirmed dry-run push produced branch-sectioned log output.
	- Confirmed `logging/commit_log.md` now includes branch `main` entry for commit `1c3930a`.
- Task alignment:
	- Fulfillment: Automatic logging now triggers during supported push hook stage and the previously missed push is recorded.
	- Deviation: None.

## Entry 006 - 2026-03-29 - Added Commit Purpose Line to Remote Log Entries

- Task: Ensure every remote commit log entry includes a quick purpose description as an extension of the commit message.
- What the agent did: Updated `.githooks/pre-push` to emit a `Purpose` line per commit, using the first non-empty body line when present and a concise fallback summary when not.
- How the agent did it: Added purpose extraction and fallback summarization logic in the hook, improved scope formatting and body-text truncation for readability, updated logging skill guidance, and patched the existing `main` entry to include purpose.
- Files edited:
	- .githooks/pre-push
	- .github/skills/remote-commit-logging/SKILL.md
	- logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- Confirmed hook shell syntax is valid after changes.
	- Confirmed simulated push output includes `Purpose` per commit.
	- Confirmed `logging/commit_log.md` current `main` entry now includes a `Purpose` line.
- Task alignment:
	- Fulfillment: Every log entry now carries a quick purpose extension beyond commit subject.
	- Deviation: None.

## Entry 007 - 2026-04-08 - Step 0 Corrective Pass and Push-Protection Cleanup

- Task: Resolve GitHub push protection block and enforce strict Step 0 scope boundaries without premature business logic.
- What the agent did: Removed tainted dependency history with git-filter-repo, restored strict Step 0 foundations (shared contracts, validation layer, route stubs, tests, scripts, env templates), added repo guardrails (`.gitignore`, pre-commit scan), and refreshed runbook/planning docs.
- How the agent did it: Performed web-backed remediation research, executed history rewrite and post-rewrite verification, then rebuilt required Step 0 files in small batches with validation-first patterns and placeholder-only route behavior.
- Files edited:
	- .gitignore
	- .githooks/pre-commit
	- backend/.env.example
	- backend/package.json
	- backend/tsconfig.json
	- backend/src/index.ts
	- backend/src/types.ts
	- backend/src/lib/errors.ts
	- backend/src/lib/http.ts
	- backend/src/lib/schemas.ts
	- backend/src/lib/sse.ts
	- backend/src/lib/validation.ts
	- backend/src/middleware/auth.ts
	- backend/src/middleware/ratelimit.ts
	- backend/src/middleware/tier.ts
	- backend/src/routes/auth.ts
	- backend/src/routes/bind.ts
	- backend/src/routes/enhance.ts
	- backend/src/routes/projects.ts
	- backend/src/routes/segment.ts
	- backend/src/services/context.ts
	- backend/src/services/history.ts
	- backend/src/services/llm.ts
	- backend/src/services/prompts/action.ts
	- backend/src/services/prompts/bind.ts
	- backend/src/services/prompts/constraint.ts
	- backend/src/services/prompts/context.ts
	- backend/src/services/prompts/edge_case.ts
	- backend/src/services/prompts/output_format.ts
	- backend/src/services/prompts/tech_stack.ts
	- backend/src/__tests__/routes.validation.test.ts
	- backend/src/__tests__/stress-tests.test.ts
	- shared/contracts/domain.ts
	- shared/contracts/api.ts
	- shared/contracts/sse.ts
	- shared/contracts/errors.ts
	- shared/contracts/index.ts
	- extension/.env.example
	- extension/manifest.json
	- extension/package.json
	- extension/tsconfig.json
	- extension/wxt.config.ts
	- extension/src/background/index.ts
	- extension/src/content/index.ts
	- extension/src/popup/index.html
	- extension/src/popup/main.tsx
	- extension/src/popup/App.tsx
	- extension/src/popup/components/AccountStatus.tsx
	- extension/src/popup/components/ModeToggle.tsx
	- extension/src/popup/components/ProjectSelector.tsx
	- extension/src/popup/components/UpgradeCTA.tsx
	- extension/src/popup/hooks/useSettings.ts
	- web/.env.example
	- web/index.html
	- web/package.json
	- web/tsconfig.json
	- web/vite.config.ts
	- web/src/App.tsx
	- web/src/index.tsx
	- scripts/smoke-tests.sh
	- docs/STEP_0_SUMMARY.md
	- docs/agent_plans/v1_step_by_step/v1_step_0_planning.md
	- README.md
	- logging/progress_log.md
- Verification:
	- Confirmed `backend/node_modules` path history is removed (`git log --all -- backend/node_modules` has zero matches).
	- Confirmed blocked commit hash is no longer present locally (`git cat-file -t <old-hash>` fails).
	- Verified rebuilt Step 0 files exist for contracts, validation, tests, env templates, and smoke script.
	- Pending final package install/typecheck/test/build execution and push verification.
- Task alignment:
	- Fulfillment: Corrective implementation directly addresses push-block root cause and re-establishes strict Step 0 boundaries.
	- Deviation: Initial `--sensitive-data-removal` mode failed due local Git version capability; path-rewrite mode was used with equivalent path-removal outcome.

## Entry 008 - 2026-04-08 - Fixed WXT Entrypoint Discovery and Completed Verification

- Task: Unblock extension install/build after WXT entrypoint detection failure and finish end-to-end Step 0 verification.
- What the agent did: Updated WXT config to use the current source layout (`srcDir: "src"`, `entrypointsDir: "."`), reran package installs/typechecks/builds/tests across backend/extension/web, confirmed smoke checks pass, and tightened ignore rules for generated WXT artifacts.
- How the agent did it: Pulled current WXT project-structure and entrypoint docs, applied a minimal config patch, executed verification commands in each workspace package, validated editor diagnostics, and rechecked git-side push-protection indicators.
- Files edited:
	- extension/wxt.config.ts
	- .gitignore
	- logging/progress_log.md
- Verification:
	- `cd extension && npm install` now succeeds and `wxt prepare` completes.
	- `cd backend && npm install && npm run typecheck && npm test` passes (10 tests).
	- `cd extension && npm run typecheck && npm run build` passes.
	- `cd web && npm install && npm run typecheck && npm run build` passes.
	- `./scripts/smoke-tests.sh` passes (15/15 checks).
	- Editor diagnostics scan reports no errors.
	- `git log --all -- backend/node_modules` remains empty and blocked commit hash `2da7d09f7ec806f4f74ad0f66f89f6ebf2f75553` is absent locally.
- Task alignment:
	- Fulfillment: Removes the remaining extension bootstrap blocker and completes the pending verification checklist for the strict Step 0 corrective pass.
	- Deviation: No push was executed in this pass because no new commit/push request was issued after verification completion.

## Entry 009 - 2026-04-08 - Commit Split Executed and Pre-Push Hook Range Fallback Fixed

- Task: Split Step 0 corrective work into concern-focused commits and push `main`.
- What the agent did: Created six concern-based commits (guardrails, contracts, backend, extension, web, docs), then fixed `.githooks/pre-push` to avoid failing when remote tip SHAs are missing locally after rewritten history.
- How the agent did it: Staged file groups by concern, committed sequentially, diagnosed push failure from invalid revision range, added a remote-tip existence check with safe fallback range generation, and documented the hook behavior update.
- Files edited:
	- .githooks/pre-push
	- .github/skills/remote-commit-logging/SKILL.md
	- logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- `git --no-pager log --oneline -8` shows the six new concern-focused commits in order.
	- Hook logic now checks `git cat-file -e <remote_sha>^{commit}` before range-based `git rev-list`.
	- Commit log partial entry from failed attempt was completed with an explicit `none` marker.
	- Pending final `git push origin main` retry after this hook-fix commit.
- Task alignment:
	- Fulfillment: Commit split is complete and push blocker root cause in the pre-push hook is remediated.
	- Deviation: Initial push attempt failed before this fix due invalid revision range from missing remote tip object.

## Entry 010 - 2026-04-08 - Added Step 1 Planning Docs

- Task: Create the end-to-end Step 1 plan using the same planning-and-workboard structure as Step 0.
- What the agent did: Added a Step 1 planning blueprint and a Step 1 tactical workboard covering Supabase schema, RLS, server-side auth verification, `/auth/token`, tests, risks, and exit criteria.
- How it did it: Reviewed the overarching plan, backend API, data model, extension, and bootstrap summary docs; checked the current auth placeholders and shared contract shape; then wrote the new planning docs to mirror the Step 0 workflow format.
- Files edited:
	- docs/agent_plans/v1_step_by_step/v1_step_1_planning.md
	- docs/agent_plans/v1_step_by_step/v1_step_1.md
	- logging/progress_log.md
- Verification:
	- Confirmed the new Step 1 planning files were added at the expected paths.
	- Confirmed the Step 1 scope matches the Step 1 section of `docs/agent_plans/v1_overarching_plan.md`.
	- Confirmed the docs call out the existing Step 0 baseline and the current auth placeholders that Step 1 must replace.
- Task alignment:
	- Fulfillment: Provides the requested end-to-end Step 1 planning artifacts in the same style as Step 0.
	- Deviation: None.

## Entry 011 - 2026-04-11 - Added Step 0 Testing Notes

- Task: Explain how to open the extension popup in a browser and record the Step 0 bind-stream caveat in the testing notes.
- What the agent did: Added WSL-specific popup-loading instructions to `docs/agent_plans/v1_testing_notes.md` and recorded the current bind-stream word-splitting / trailing-space stub behavior as an explicit Step 0 caveat.
- How the agent did it: Checked the empty testing-notes file, confirmed the WXT dev server warning behavior, then wrote a concise manual test section and caveat note for future verification.
- Files edited:
	- docs/agent_plans/v1_testing_notes.md
	- logging/progress_log.md
- Verification:
	- Confirmed the testing notes now explain how to load `extension/.output/chrome-mv3-dev` as an unpacked extension and open the popup from the toolbar icon.
	- Confirmed the notes warn not to use `http://localhost:3001` as the popup URL.
	- Confirmed the bind-stream caveat is documented exactly where requested.
- Task alignment:
	- Fulfillment: Adds the requested popup-opening guidance and records the Step 0 bind-stream formatting caveat in the appropriate documentation.
	- Deviation: None.

## Entry 012 - 2026-04-11 - Fixed WXT Manifest Permissions for Service Worker Startup

- Task: Diagnose and fix the Chrome extension service worker crash reported as status code 15.
- What the agent did: Moved the extension manifest metadata and permissions into `extension/wxt.config.ts`, rebuilt the extension, and verified that the generated dev manifest now includes `PromptCompiler`, `storage`, and `alarms` before loading in Chrome.
- How the agent did it: Reviewed WXT manifest-generation docs, confirmed the source `manifest.json` was not what WXT loads, patched the global `manifest` config, then rebuilt both production and dev outputs to inspect the emitted manifest.
- Files edited:
	- extension/wxt.config.ts
	- logging/progress_log.md
- Verification:
	- `extension/.output/chrome-mv3-dev/manifest.json` now includes `permissions: ["storage", "alarms", "tabs", "scripting"]`.
	- The generated manifest name is now `PromptCompiler` instead of the package name.
	- `npm run build` and `npm run dev` both complete successfully after the change.
- Task alignment:
	- Fulfillment: Resolves the service worker startup crash by ensuring the generated WXT manifest grants the APIs used by the background worker.
	- Deviation: None.

## Entry 013 - 2026-04-11 - Restored Canonical Step 0 Summary Path

- Task: Verify the Step 0 summary and fix any repository path mismatches.
- What the agent did: Confirmed the summary content was accurate, found that other docs still referenced `docs/STEP_0_SUMMARY.md`, and restored that canonical file so the references resolve again.
- How the agent did it: Rechecked the summary against the backend, extension, web, and smoke-test artifacts, then added the missing root summary file using the existing verified content.
- Files edited:
	- docs/STEP_0_SUMMARY.md
	- logging/progress_log.md
- Verification:
	- `docs/STEP_0_SUMMARY.md` now exists again and matches the verified Step 0 summary content.
	- Existing references in Step 1 planning docs now resolve to a real file.
- Task alignment:
	- Fulfillment: Confirms the summary is correct and repairs the repo path mismatch that would otherwise leave broken links.
	- Deviation: None.

## Entry 014 - 2026-04-11 - Deduplicated Canonical Step 0 Summary

- Task: Ensure the restored canonical Step 0 summary file is a single clean copy.
- What the agent did: Removed the accidental duplicated block from [docs/STEP_0_SUMMARY.md](docs/STEP_0_SUMMARY.md) so the root summary matches the verified content exactly.
- How the agent did it: Re-read the root summary file, compared it to the verified v1_steps_summary copy, and trimmed the appended duplicate block.
- Files edited:
	- docs/STEP_0_SUMMARY.md
	- logging/progress_log.md
- Verification:
	- `docs/STEP_0_SUMMARY.md` now contains one copy of the Step 0 summary content.
	- The file matches the verified summary text and keeps existing references valid.
- Task alignment:
	- Fulfillment: Completes the summary verification by restoring a single canonical root summary file with correct content.
	- Deviation: None.

## Entry 015 - 2026-04-11 - Added Mandatory Scope Creep Guard and Locked Phase F to Planning-Only

- Task: Add an always-loaded anti-scope-creep skill and clarify Phase F boundaries after prior scope drift.
- What the agent did: Created a new `scope-creep-guard` skill, wired it as mandatory in the skill map and always-on workspace instructions, and added an explicit Phase F planning-only boundary section with a no-runtime-edits gate.
- How the agent did it: Reviewed current VS Code Agent Skills and custom instructions docs, then updated the repo customization surfaces and Step 1 planning document to enforce file-surface and behavior-scope constraints.
- Files edited:
	- .github/skills/scope-creep-guard/SKILL.md
	- .github/skills/SKILL_MAP.md
	- .github/copilot-instructions.md
	- docs/agent_plans/v1_step_by_step/v1_step_1_planning.md
	- logging/progress_log.md
- Verification:
	- Confirmed `scope-creep-guard` is present and registered in both human-readable and machine-readable sections of `SKILL_MAP.md`.
	- Confirmed selection order now requires loading `scope-creep-guard` before planning or edits.
	- Confirmed always-on repo instructions now require loading `scope-creep-guard` for every task.
	- Confirmed Step 1 planning doc includes a dedicated Phase F planning-only boundary and disallowed runtime edit list.
- Task alignment:
	- Fulfillment: Enforces an always-on scope guard and clarifies Phase F to prevent repeat scope creep.
	- Deviation: None.

## Entry 016 - 2026-04-11 - Re-aligned Step 1 Work to Original Phase Plan

- Task: Verify that current Step 1 changes still follow the original Phase A-F remediation plan and remove any drift.
- What the agent did: Restored explicit Phase E and Phase F sections in the Step 1 planning blueprint, then rolled back out-of-plan runtime-file edits so this pass remains planning-only.
- How the agent did it: Audited changed files against the original phase contract, patched the planning blueprint with the missing consistency gate and handoff sequence, and reverted implementation-surface deltas under backend/shared/supabase files.
- Files edited:
	- docs/agent_plans/v1_step_by_step/v1_step_1_planning.md
	- backend/package.json
	- backend/src/lib/schemas.ts
	- shared/contracts/api.ts
	- logging/progress_log.md
- Files removed:
	- backend/bun.lock
	- supabase/config.toml
	- supabase/.gitignore
- Verification:
	- Confirmed `Phase E - Consistency Gate Before Implementation Handoff` and `Phase F - Implementation Handoff Sequence` now exist in the planning blueprint.
	- Confirmed planning-pass stop conditions explicitly forbid runtime implementation in this pass.
	- Confirmed `refresh_token` reverted to optional in both shared contract and backend schema validation.
	- Confirmed no local `backend/bun.lock`, `supabase/config.toml`, or `supabase/.gitignore` remains.
	- Confirmed no file diagnostics for edited files.
- Task alignment:
	- Fulfillment: Re-establishes strict adherence to the original phased plan and removes implementation drift from the planning-only pass.
	- Deviation: None.

## Entry 017 - 2026-04-11 - Implemented Phase E and Phase F Planning Artifacts (No Runtime Coding)

- Task: Implement Phase E and Phase F in a planning-only pass with no runtime coding changes.
- What the agent did: Added explicit Phase E execution results and gate status, plus Phase F per-slice stop conditions in the Step 1 planning blueprint.
- How the agent did it: Performed a cross-doc consistency check, confirmed Step boundary language, then patched the planning doc to encode handoff-ready execution sequencing constraints.
- Files edited:
	- docs/agent_plans/v1_step_by_step/v1_step_1_planning.md
	- logging/progress_log.md
- Verification:
	- Confirmed the planning doc includes `Phase E execution result (planning-only pass)`.
	- Confirmed the planning doc includes an explicit `Open consistency item` for `shared/contracts/api.ts` optional `refresh_token` mismatch.
	- Confirmed `Phase E gate status` is present and marked conditional for runtime handoff.
	- Confirmed `Slice stop conditions (for execution pass)` are present for all eight implementation slices.
	- Confirmed no diagnostics in the edited planning file.
- Task alignment:
	- Fulfillment: Completes Phase E and Phase F as documentation-only outputs and preserves the no-runtime-coding constraint.
	- Deviation: None.

## Entry 018 - 2026-04-11 - Final Step 1 Security and Production-Readiness Alignment

- Task: Perform one final Step 1 document security/readiness check and execute remaining plan fixes.
- What the agent did: Closed the remaining auth token contract mismatch, added explicit `SECURITY DEFINER` trigger hardening requirements, and removed a direct `/auth/token` contradiction in `ARCHITECTURE.md`.
- How the agent did it: Ran a cross-doc audit across Step 1 planning/taskboard/source-of-truth files, patched only the required docs/contracts, then re-verified consistency and diagnostics.
- Files edited:
	- shared/contracts/api.ts
	- docs/agent_plans/v1_step_by_step/v1_step_1.md
	- docs/agent_plans/v1_step_by_step/v1_step_1_planning.md
	- docs/DATA_MODELS.md
	- docs/ARCHITECTURE.md
	- logging/progress_log.md
- Verification:
	- Confirmed `AuthTokenRequest.refresh_token` is now required in shared contract.
	- Confirmed Step 1 taskboard and planning docs now require `SECURITY DEFINER` on the profile-bootstrap trigger function.
	- Confirmed Phase E status in planning now reports documentation and contract consistency as pass.
	- Confirmed `BACKEND_API.md` retains the strict `[TODO: Step 2 IP-based Rate Limit]` marker for public `/auth/token`.
	- Confirmed no diagnostics in edited files.
- Task alignment:
	- Fulfillment: Delivers the requested final Step 1 security/readiness pass and executes remaining remediation fixes from the plan.
	- Deviation: None.

## Entry 019 - 2026-04-12 - Documented Non-Specific Skills and VS Code Replication Workflow

- Task: Capture all non-project-specific skills in a dedicated document, include a detailed agent prompt, replicate workflow guidance for VS Code usage, and prepare an exportable archive.
- What the agent did: Authored a comprehensive non-specific skills handbook with full skill catalog coverage, load-order model, a reusable detailed bootstrap prompt, VS Code integration guidance, extension-contributed skill replication pattern, rollout checklist, and export manifest.
- How the agent did it: Loaded all repository skill definitions and workflow instruction surfaces, validated current VS Code/GitHub/Agent Skills behaviors against official docs, then wrote the consolidated guide in one pass aligned to existing skill-map and instruction contracts.
- Files edited:
	- docs/NONSPECIFIC_SKILLS.md
	- logging/progress_log.md
- Verification:
	- Confirmed `docs/NONSPECIFIC_SKILLS.md` now contains all 10 current skills with brief purpose summaries.
	- Confirmed the document includes a detailed reusable agent prompt block.
	- Confirmed the document includes full replication guidance for `.github/skills`, `SKILL_MAP.md`, `.github/copilot-instructions.md`, and extension `chatSkills` contribution.
	- Confirmed this progress entry follows the required numbered, dated workflow-log schema.
- Task alignment:
	- Fulfillment: Delivers the requested highly detailed documentation and workflow replication guidance prior to archiving.
	- Deviation: None.

## Entry 020 - 2026-04-12 - Built Sanitized Template Repo Bundle

- Task: Separate the reusable workflow files into a template-ready bundle and flag project-specific content that should stay out of the shared starter repo.
- What the agent did: Created a sanitized `template-repo/` folder with generic instructions, prompts, skills, logs, README, and hook support; removed PromptCompiler-specific examples from the copied workflow docs; initialized the folder as its own local git repository; and packaged the bundle into a zip archive for handoff.
- How the agent did it: Copied the portable workflow assets into a dedicated template directory, rewrote the project-specific surfaces to generic equivalents, re-scanned for leakage, initialized a standalone git repository in the template folder, and verified the archive contents and checksum.
- Files edited:
	- template-repo/README.md
	- template-repo/.gitignore
	- template-repo/.github/copilot-instructions.md
	- template-repo/.github/prompts/build-slice.prompt.md
	- template-repo/.github/prompts/plan-review.prompt.md
	- template-repo/.github/skills/scope-creep-guard/SKILL.md
	- template-repo/.github/skills/documentation-cohesion/SKILL.md
	- template-repo/logging/progress_log.md
	- template-repo/logging/commit_log.md
	- logging/progress_log.md
- Verification:
	- Confirmed `template-repo/` is initialized as a standalone git repository.
	- Confirmed the template repo no longer contains PromptCompiler, Step 0/Step 1, vector-extension, auth.users, Supabase, or WXT references.
	- Confirmed the archive `exports/skill-workflow-template-repo_2026-04-12.zip` contains the sanitized template repository layout.
	- Confirmed the archive checksum is `a4609ccb02d8a54999ec9bfc1a69543964ab9d956c8eb02e632ade302e78f6c4`.
- Task alignment:
	- Fulfillment: Produces a reusable template bundle with the project-specific content removed and the workflow assets preserved.
	- Deviation: A GitHub remote repository was not created in this session because no commit/push step was requested and the environment policy does not allow automatic commits.

## Entry 021 - 2026-04-13 - Implemented Step 2-5 Skill Pack and Synced Skill Map

- Task: Start implementation of the planned high-value skills for Step 2 through Step 5 and register them in governance surfaces.
- What the agent did: Added seven project-specific skills with reference docs, then updated the skill map selection order, registry table, and machine-readable index to include the new skills.
- How the agent did it: Created each skill folder with a dedicated `SKILL.md` and a focused references file, patched `SKILL_MAP.md` to encode step-aware load conditions, and validated file presence plus map registration via workspace searches.
- Files edited:
	- .github/skills/rate-limiting-tier-enforcement/SKILL.md
	- .github/skills/rate-limiting-tier-enforcement/references/RATE_LIMIT_MATRIX.md
	- .github/skills/llm-router-and-model-selection/SKILL.md
	- .github/skills/llm-router-and-model-selection/references/ROUTING_MATRIX.md
	- .github/skills/system-prompt-assembly/SKILL.md
	- .github/skills/system-prompt-assembly/references/PROMPT_ASSEMBLY_CHECKLIST.md
	- .github/skills/canonical-clause-ordering/SKILL.md
	- .github/skills/canonical-clause-ordering/references/CANONICAL_ORDER_MAP.md
	- .github/skills/clause-state-management/SKILL.md
	- .github/skills/clause-state-management/references/STATE_MACHINE_NOTES.md
	- .github/skills/mv3-extension-boundaries/SKILL.md
	- .github/skills/mv3-extension-boundaries/references/MV3_BOUNDARY_MATRIX.md
	- .github/skills/sse-streaming-bridge/SKILL.md
	- .github/skills/sse-streaming-bridge/references/SSE_BRIDGE_FLOW.md
	- .github/skills/SKILL_MAP.md
	- logging/progress_log.md
- Verification:
	- Confirmed all seven new `SKILL.md` files exist under `.github/skills/`.
	- Confirmed all seven new reference files exist under each skill's `references/` directory.
	- Confirmed `SKILL_MAP.md` now includes all seven skills in selection order, registry table, and machine-readable `selectionOrder`/`registry` blocks.
- Task alignment:
	- Fulfillment: Executes the requested start of implementation by delivering the full Step 2-5 skill pack and synchronizing governance indexing.
	- Deviation: None.

## Entry 022 - 2026-04-15 - Completed Pass 4 Final Verification and Closure

- Task: Execute Pass 4 as the final verification/reconciliation pass after Pass 1-3 remediation.
- What the agent did: Ran strict harness-backed integration verification, ran the full backend test/typecheck matrix with local Supabase/Redis env, and updated the Step 0-2 integration audit with resolved-vs-residual closure status.
- How the agent did it: Brought up local Redis/Supabase services, exported runtime env from `supabase status -o env`, executed strict and full backend test commands, then patched the integration-audit artifact with concrete evidence links and verification outcomes.
- Files edited:
	- docs/agent_plans/integration_audits/steps0-2.md
	- logging/progress_log.md
- Verification:
	- `cd backend && npm run test:integration` passed (18 pass, 0 fail) with local harness env.
	- `cd backend && npm test` passed (32 pass, 0 fail) with local harness env.
	- `cd backend && npm run typecheck` passed.
	- Confirmed integration audit file now includes a dedicated Pass 4 closure section with resolved findings and deferred items.
- Task alignment:
	- Fulfillment: Delivers the requested Pass 4 execution with end-to-end verification and written closure.
	- Deviation: None.

## Entry 023 - 2026-04-16 - Recorded Step 3 Rainy-Path Validation

- Task: Manually validate Step 3 rainy-day error handling and record the results.
- What the agent did: Reran the Step 3 unit matrix and manual probes for Groq missing key, Groq malformed stream, Anthropic retry exhaustion, and BYOK missing-config fallback after the interruption; then captured the observations in the testing notes.
- How the agent did it: Used bun test plus bun -e probes against the local provider adapters and router selection, then updated the Step 3 notes section in docs/agent_plans/v1_testing_notes.md.
- Files edited:
	- docs/agent_plans/v1_testing_notes.md
	- logging/progress_log.md
- Verification:
	- Step 3 unit matrix passed with 30 pass and 0 fail.
	- Groq missing-key probe emitted PROVIDER_KEY_MISSING with retryable false.
	- Groq malformed-stream probe emitted PROVIDER_INVALID_RESPONSE with retryable false.
	- Anthropic retry-exhaustion probe ran 3 attempts and ended with PROVIDER_UNAVAILABLE, retryable true, status 503.
	- BYOK missing-config probe returned provider user and model byok-config-missing.
- Task alignment:
	- Fulfillment: Records the requested rainy-path validation results and keeps the testing guide current.
	- Deviation: None.

## Entry 024 - 2026-04-16 - Reconciled Stale Step 2 Audit Note

- Task: Resolve the remaining stale documentation note about auth-token IP limiting in the Step 0-2 integration audit.
- What the agent did: Updated the integration audit so the historical baseline note now matches the live backend API docs and no longer claims the Step 2 IP limiter is still TODO.
- How the agent did it: Re-read the live backend API contract and the audit wording, then patched only the stale audit item to reflect the current aligned state.
- Files edited:
	- docs/agent_plans/integration_audits/steps0-2.md
	- logging/progress_log.md
- Verification:
	- Confirmed [docs/BACKEND_API.md](../docs/BACKEND_API.md) already documents the Step 2 IP limiter at the live route level.
	- Confirmed the audit no longer claims auth-token IP limiting is still TODO.
	- Confirmed `npx --yes supabase status -o env` returns local Supabase environment variables; the status output also reported stopped `imgproxy`, `edge_runtime`, and `pooler` services, so the harness was not treated as fully started in this pass.
- Task alignment:
	- Fulfillment: Removes the last stale Step 0-2 audit contradiction found in the focused pass.
	- Deviation: None.

## Entry 025 - 2026-04-19 - Completed Skills Steps 6-11 Phase 2 Recommendations

- Task: Proceed phase by phase and complete Phase 2 for Step 6-11 project-specific skill planning.
- What the agent did: Produced a Phase 2 gap-analysis and recommendation artifact that converts Phase 1 baseline ratings into a minimum new-skill set with overlap controls and a Phase 3 drafting handoff, then linked the Phase 1 handoff section to the completed Phase 2 artifact.
- How the agent did it: Re-read Phase 1 baseline plus source-of-truth docs, reviewed current skill boundaries, validated MV3/runtime/content-script references, then documented per-step decisions for partial/missing rows.
- Files edited:
	- docs/agent_plans/v1_skills_steps6-11_phase1.md
	- docs/agent_plans/v1_skills_steps6-11_phase2.md
	- logging/progress_log.md
- Verification:
	- Confirmed the Phase 1 handoff section now points to the Phase 2 artifact for direct phase navigation.
	- Confirmed the new Phase 2 doc exists and includes scope lock, gap decisions, minimum new-skill recommendations, overlap controls, and phase handoff.
	- Confirmed the Phase 2 planning file has no diagnostics from workspace error checks.
	- Confirmed no skill files, SKILL_MAP, or runtime code were edited in this phase.
- Task alignment:
	- Fulfillment: Completes the requested Phase 2 step in sequence with recommendations-only output.
	- Deviation: None.

## Entry 026 - 2026-04-19 - Completed Skills Steps 6-11 Phase 3 Drafting

- Task: Execute Phase 3 by drafting new Step 7-11 skills and synchronizing governance surfaces.
- What the agent did: Added four new project-specific skills (each with a focused reference note), updated SKILL_MAP selection/registry/index surfaces, and recorded a Phase 3 execution artifact with phase handoff linkage.
- How the agent did it: Used the Phase 2 recommendations as input, drafted narrow-scope SKILL.md files with explicit do/do-not boundaries, synchronized SKILL_MAP entries in the same pass, and updated phase docs and workflow logging.
- Files edited:
	- .github/skills/background-port-state-recovery/SKILL.md
	- .github/skills/background-port-state-recovery/references/BACKGROUND_PORT_RECOVERY.md
	- .github/skills/content-script-instrumentation/SKILL.md
	- .github/skills/content-script-instrumentation/references/INSTRUMENTATION_FLOW.md
	- .github/skills/underline-preview-rendering/SKILL.md
	- .github/skills/underline-preview-rendering/references/RENDERING_STATE_MAP.md
	- .github/skills/hotkey-bind-commit-ux/SKILL.md
	- .github/skills/hotkey-bind-commit-ux/references/HOTKEY_GUARD_MATRIX.md
	- .github/skills/SKILL_MAP.md
	- docs/agent_plans/v1_skills_steps6-11_phase2.md
	- docs/agent_plans/v1_skills_steps6-11_phase3.md
	- logging/progress_log.md
- Verification:
	- Confirmed all four new skill directories and SKILL.md files exist at the expected paths.
	- Confirmed SKILL_MAP now includes all four new skills in selection order, registry table, and machine-readable index blocks.
	- Confirmed Phase 2 now links to the completed Phase 3 artifact for phase navigation.
	- Confirmed no backend or extension runtime implementation files were edited.
- Task alignment:
	- Fulfillment: Completes requested Phase 3 execution with synchronized skill drafting and governance updates.
	- Deviation: None.

## Entry 027 - 2026-04-19 - Completed Skills Steps 6-11 Phase 4 Validation

- Task: Execute Phase 4 by validating non-explicit skill auto-loading behavior and tightening weak trigger wording.
- What the agent did: Ran fallback and targeted smoke tests, identified trigger weaknesses for Step 7 and Step 8 prompts, applied minimal description refinements to two skills, and published a Phase 4 validation artifact with scorecards and outcomes.
- How the agent did it: Used the skill-improvement fallback script plus four non-explicit Step 7-11 prompts with a transparent overlap heuristic, compared pre/post scores, then patched only the affected skill descriptions and phase handoff docs.
- Files edited:
	- .github/skills/background-port-state-recovery/SKILL.md
	- .github/skills/content-script-instrumentation/SKILL.md
	- docs/agent_plans/v1_skills_steps6-11_phase3.md
	- docs/agent_plans/v1_skills_steps6-11_phase4.md
	- /memories/repo/customization-notes.md
	- logging/progress_log.md
- Verification:
	- Confirmed fallback script executed successfully for non-explicit prompts.
	- Confirmed post-tuning targeted checks rank `background-port-state-recovery` highest for the Step 7 recovery prompt and `content-script-instrumentation` highest for the Step 8 instrumentation prompt.
	- Confirmed `underline-preview-rendering` and `hotkey-bind-commit-ux` remain top-ranked for Step 9 and Step 11 prompts respectively.
	- Confirmed no skill catalog additions/removals and no runtime backend/extension implementation edits in this phase.
	- Added reusable memory note to prefer `grep` fallback when `rg` is unavailable in this environment.
- Task alignment:
	- Fulfillment: Completes requested Phase 4 validation and wording-tuning pass for the Step 6-11 skill cycle.
	- Deviation: None.

## Entry 028 - 2026-04-19 - Completed Skills Steps 6-11 Phase 5 Wrap-Up

- Task: Execute Phase 5 and wrap up the Step 6-11 skill expansion cycle.
- What the agent did: Added a final Phase 5 closure artifact, fixed a duplicated content block in the Phase 4 artifact, linked Phase 4 forward to Phase 5, and recorded final cycle status and residual maintenance triggers.
- How the agent did it: Re-read all phase artifacts and workflow governance files, patched only documentation/logging surfaces, and ran final diagnostics plus changed-file scope checks.
- Files edited:
	- docs/agent_plans/v1_skills_steps6-11_phase4.md
	- docs/agent_plans/v1_skills_steps6-11_phase5.md
	- logging/progress_log.md
- Verification:
	- Confirmed Phase 5 artifact exists and references all prior phase artifacts.
	- Confirmed duplicate Phase 4 block was removed and the document now has one canonical copy.
	- Confirmed Phase 4 now links to the Phase 5 closeout artifact.
	- Confirmed no backend/extension runtime implementation files were edited in this pass.
	- Confirmed no diagnostics were reported for edited files.
- Task alignment:
	- Fulfillment: Completes the requested Phase 5 and wraps up the Step 6-11 cycle with explicit closure documentation.
	- Deviation: None.

## Entry 029 - 2026-05-07 - Synced Overlay Typography and Geometry Guidance

- Task: Fix mirror overlay geometry/font drift in the content script and update frontend skill guidance.
- What the agent did: Forced overlay sizing to `border-box`, added explicit word-spacing sync, and updated underline-preview skill guidance plus the skill map wording to capture typography/box-model requirements.
- How the agent did it: Audited the overlay style-copy path against the required CSS properties and geometry rules, then tightened the related skill instructions and registry language.
- Files edited:
	- extension/src/content/index.ts
	- .github/skills/underline-preview-rendering/SKILL.md
	- .github/skills/SKILL_MAP.md
	- logging/progress_log.md
- Verification:
	- `cd extension && npm run typecheck`
- Task alignment:
	- Fulfillment: Implements the requested overlay sync fixes and updates skill guidance.
	- Deviation: None.

## Entry 030 - 2026-05-24 - Added Beast Mode Agent Definitions

- Task: Add the Beast Mode 3.1 custom agent to the repo-backed agent config surfaces and explain how to invoke it in Copilot CLI, Claude Code, and Gemini CLI.
- What the agent did: Added matching Beast Mode 3.1 agent files for GitHub Copilot, Claude Code, and Gemini CLI, using each tool's native agent directory and markdown frontmatter format.
- How the agent did it: Read the official CLI docs for custom agents, created the agent files with a shared prompt body, and verified the file contents and documented selection commands.
- Files edited:
	- .github/agents/beast-mode-3-1.agent.md
	- .claude/agents/beast-mode-3-1.md
	- .gemini/agents/beast-mode-3-1.md
	- logging/progress_log.md
- Verification:
	- Confirmed each agent file exists at the documented path.
	- Confirmed each file has valid YAML frontmatter with `name` and `description`.
	- Confirmed the Copilot CLI agent can be selected with `/agent` or `copilot --agent beast-mode-3-1 --prompt "..."`
	- Confirmed Claude Code agent files live under `.claude/agents/` and are selected with `/agents` or `claude --agents`.
	- Confirmed Gemini CLI custom subagents live under `.gemini/agents/` and are invoked with `@beast-mode-3-1` or viewed with `/agents`.
- Task alignment:
	- Fulfillment: The requested agent was saved in the repo configuration surfaces and the selection commands were documented for all three CLIs.
	- Deviation: None.

## Entry 031 - 2026-06-15 - V2 Track A3: Centralized per-element cleanup registry (AUD-10 / G-3)

- Task: Implement Track A3 of the V2 mega-plan — centralized teardown for per-element listeners/observers so no DOM state outlives a removed input or an invalidated content script.
- Context / resume note: Re-derived current step per plan §7A.6 against live code (not the stale handoff.md). Verified Track A1 (WeakSet idempotency, BUG-REACT) and A2 (clip-rect geometry, BUG-GEOM) were ALREADY implemented at HEAD (commit b6a6be0) and correct — marked complete, no re-edit. handoff.md predates those fixes and is stale.
- What the agent did:
	- Added `_instrumentCleanups: Map<Element, Array<() => void>>` registry alongside the existing `_instrumentedElements` WeakSet.
	- Rewrote `markInstrumented` so every `addEventListener` (input/search/mousemove/mouseleave/blur/keydown) and the contenteditable `clearObserver` MutationObserver registers a paired disposer. The clear-observer was previously orphaned (never disconnected) — the core AUD-10 leak that pinned detached inputs in memory.
	- Added `teardownInstrument(element)`: best-effort runs all disposers, deletes both registry entries (Rule 3/7).
	- Added an `isConnected` sweep at the end of the input-discovery MutationObserver callback (Rule 6): instrumented inputs that left the DOM are torn down; checked post-batch so a React detach→reattach move is not falsely torn down.
	- Wired `main(ctx)` + `ctx.onInvalidated()` (Rule 8): on content-script invalidation, disconnect the discovery + modal observers and tear down every instrumented input.
- Files edited:
	- extension/src/content/index.ts
	- logging/progress_log.md
- Verification:
	- `cd extension && npx tsc --noEmit --skipLibCheck` → exit 0.
	- `cd backend && npx tsc --noEmit --skipLibCheck` → exit 0 (unchanged).
	- Extension `vitest run`: 13 failed / 4 passed BOTH before and after the change (stashed-baseline compared) → zero regression. The 13 failures are pre-existing stale tests (assert the removed confidence concept and the old attribute-marker model); they belong to Track C3 (real extension test harness), not A3.
	- Backend `bun test`: 76 pass / 3 fail (the known external Supabase email-rate-limit integration tests, per plan §7A.2) — unchanged.
- Task alignment:
	- Fulfillment: Centralized teardown registry implemented; clear-observer + modal-observer + discovery-observer now have deterministic teardown on removal and invalidation.
	- Deviation: A1/A2 found already-done; no re-implementation. Full heap-snapshot G-3 verification requires a live browser (escalated to Track A5 manual guide).
	- Residual: Stale extension test suite (13 failures) deferred to C3. Window scroll/resize singleton listeners and focusin/storage listeners are page-lifetime and left in place (GC'd with the script context); not part of the AUD-10 named surface.

## Entry 032 - 2026-06-15 - V2 Track A4: Confidence doc/skill drift purge (AUD-8)

- Task: Remove stale confidence-based-underline guidance left over after DECISION-1 (confidence removed from LLM/schemas/UI), across skills and source-of-truth docs.
- Method note: A subagent ("Fix doc/skill drift") did the read/analysis but its Edit tool was denied in-sandbox, so it returned exact edit specs and the Lead applied them. Verified confidence is fully absent from real code (`shared/`, `backend/src`, `extension/src`) before rewriting contract docs to match reality.
- What the agent did (all edits by the Lead):
	- `.github/skills/ui-design-system/SKILL.md`: replaced the "Confidence → Underline style" table with a "Visual states → Underline style" table (ready/focused/accepted/stale/accepted-stale/streaming/error); fixed two descriptive lines.
	- `.github/skills/content-script-instrumentation/SKILL.md`: added Core Invariant #8 (WeakSet/WeakMap idempotency in SPA hosts, root cause of BUG-REACT) and tightened procedure step 2.
	- `.github/skills/underline-preview-rendering/SKILL.md`: rewrote all 8 confidence references to the section-state model.
	- `.github/skills/typescript-safety/SKILL.md`: dropped the removed `confidence` field from the example `Section` type.
	- `.github/skills/SKILL_MAP.md`: registry "Load When" wording confidence-styling → section-state styling.
	- `docs/UX_FLOW.md`: removed confidence-weight line from the flow; replaced "Underline Confidence" with "Underline States".
	- `docs/BACKEND_API.md` + `docs/CLAUSE_PIPELINE.md`: removed the `confidence` field from `/segment` response examples and the encoding text to match the real schema (id/text/goal_type/canonical_order/depends_on).
	- `extension/src/content/index.ts`: fixed one misleading comment ("degraded confidence indicators" → "degraded (stale) visual state"); comment-only, zero behavior change.
- Files edited: 5 skills + SKILL_MAP + 3 docs + 1 code comment + this log.
- Verification:
	- `grep -ri confidence` over source-of-truth docs → only intentional "removed (DECISION-1)" notes remain. `testing-notes/*` left intact (historical record; round2 is the doc that recommended the removal).
	- extension tsc → exit 0.
- Task alignment:
	- Fulfillment: AUD-8 confidence drift eliminated across skills + contract docs; the WeakSet/SPA lesson from BUG-REACT codified into the instrumentation skill.
	- Deviation: Scope widened from the plan's named files (ui-design-system + EXTENSION/ARCHITECTURE) to also include underline-preview-rendering, typescript-safety, SKILL_MAP, UX_FLOW, BACKEND_API, CLAUSE_PIPELINE — because they carried the same DECISION-1 drift and the ui-design-system skill points at UX_FLOW's table. EXTENSION.md/ARCHITECTURE.md confirmed already clean (no edit).
	- Residual: None for confidence drift.

## Entry 033 - 2026-06-15 - V2 Track A5: Manual verification guide + escalations (A1/A3)

- Task: Per the run decision "document & escalate, don't fake," produce a runnable manual verification guide for the Track A runtime gates that need a live browser, and escalate the items requiring accounts/decisions.
- What the agent did: Authored `docs/testing-notes/v2-track-a-manual-verification.md` following the manual-testing-guides skill shape (scope → setup → preflight → build/load → invariants → matrix → E2E → rainy/escalations → notes). Covers A1 (no false toast / no duplicate listeners on React churn), A2 (G-2 ±1px parity + no container bleed), A3 (G-3 zero-retention via DevTools heap snapshot). Documents the known stale-vitest baseline (13f/4p) so a tester can distinguish it from a regression. Escalates: A3 Sentry/observability needs a DSN (account decision); full G-2 pixel matrix needs the Track D2 CSS Custom Highlights rewrite.
- Files edited: docs/testing-notes/v2-track-a-manual-verification.md, logging/progress_log.md.
- Verification: Doc-only; commands in the guide are the repo's real ones (npx tsc, npx vitest run, npm run dev, chrome://extensions load-unpacked). No code/tsc impact.
- Task alignment:
	- Fulfillment: Live-browser gates (G-2/G-3) and the Sentry decision are now explicit, reproducible, and escalated rather than silently skipped or faked.
	- Deviation: None.
	- Residual: A human must execute the guide on the target-site matrix and provision (or decline) Sentry. Track A code is complete; A1/A2 were already in HEAD, A3 implemented this run.

## Entry 034 - 2026-06-15 - V2 Track B1+B2: Design tokens + motion system as portable core data (AUD-2)

- Task: Author the canonical design-token layer and named motion system (the artifact every later track/surface consumes) as pure, portable TS — no DOM imports — so it moves cleanly into packages/core in Track C (R-ARCH-1).
- Branch: v2/track-b-tokens (stacked on v2/track-a-stabilize; A+B = milestone M1).
- What the agent did:
	- `shared/design/tokens.ts`: 6 LOCKED clause accents (canonical ui-design-system hexes), 12-step neutral ramps (light+dark), single brand accent, semantic/surface/overlay/scrim per theme, typography scale (px only, no rem), 4px space grid, radius/elevation/border, the 2147483647 z-index ceiling, section-state opacities/color-roles (replaces removed confidence styling), per-clause non-color encoding (glyph + underline texture/thickness for S-VIS-3), and `tokensToCssVars(theme)` runtime emitting a `--pc-*` block.
	- `shared/design/motion.ts`: ≤5 named easings (snap/float/pulse/silk), duration tokens, `prefersReducedMotion()` (portable, guards missing matchMedia), `motionDurationMs()`, and `transition()` that degrades to opacity-only/instant under reduced-motion (S-MOT-2).
	- `shared/design/index.ts` barrel.
	- `extension/src/content/__tests__/design-tokens.test.ts`: 9 tests locking the palette, non-color encoding distinctness, CSS-var emission for both themes, 12-step ramps, z-index ceiling + ordered state opacities, and the reduced-motion collapse behavior.
- Files edited: shared/design/{tokens,motion,index}.ts, extension/src/content/__tests__/design-tokens.test.ts, logging/progress_log.md.
- Verification: extension tsc exit 0; `vitest run design-tokens.test.ts` → 9/9 pass.
- Task alignment:
	- Fulfillment: B1 (tokens + runtime) and B2 (motion + reduced-motion) delivered as one cohesive, tested, portable module.
	- Deviation: Authored under `shared/design/` (existing cross-cutting pure-TS home, sibling to shared/contracts) rather than a not-yet-existing packages/core; it relocates into core during Track C. Noted that 3 clause hexes in the live GOAL_TYPE_PALETTE drifted from this locked set — reconciled in B3, not here.
	- Residual: None; consumed by B3/B4 next.

## Entry 035 - 2026-06-15 - V2 Track B3: Tokenize content-script render constants (AUD-2)

- Task: Replace inline visual magic values in the draft-render path of content/index.ts with references to the portable design tokens.
- What the agent did:
	- Imported `{ brand, clauseAccent, rgba, sectionState, zIndex }` from `shared/design`.
	- Top-level constants now derive from tokens (value-identical, behavior-preserving): DRAFT_OVERLAY_Z_INDEX ← zIndex.overlayCeiling; DRAFT_STALE/ACCEPTED/ACCEPTED_STALE_OPACITY ← sectionState.*.opacity; DRAFT_UNDERLINE_COLOR ← rgba(brand.accent, 0.95) = "rgb(37 99 235 / 0.95)".
	- GOAL_TYPE_PALETTE colors now come from `clauseAccent` (the locked palette). This reconciles three clause colors that had drifted (tech_stack #0f766e→#0d9488, constraint #f43f5e→#e11d48, output_format #1d4ed8→#2563eb) to their canonical documented values — intentional design alignment. action/context/edge_case were already canonical.
	- Stale-accepted decoration literal `rgb(217 119 6)` → `rgba(clauseAccent.context)` (exact same value; amber === clauseAccent.context). Annotated to revisit as a true stale state in B4/Track D.
	- Added `rgba(hex, alpha)` to the token runtime (+3 test assertions proving value-identity with the old literals).
- Files edited: extension/src/content/index.ts, shared/design/tokens.ts, extension/src/content/__tests__/design-tokens.test.ts, logging/progress_log.md.
- Verification: extension tsc exit 0; full vitest 13 failed / 14 passed — fail count identical to the known-13 stale baseline (zero new regressions; the +10 passing are the token tests). The shared/design import resolves at both tsc and vite/vitest bundler level (the test imports the same path and runs).
- Task alignment:
	- Fulfillment: Draft-render-path constants (z-index, state opacities, underline + clause colors) are now token-sourced; "zero hardcoded visual constants" met for the underline/overlay render path.
	- Deviation: The popover/ghost-panel/toast CSS template-literal chrome (surface/border/shadow colors around lines 460-547, 1644+, 1760+) is intentionally DEFERRED to Track D1, which rewrites those blocks into a single shadow root — tokenizing them now would be discarded work. 3 clause colors intentionally aligned to canon (documented).
	- Residual: CSS-chrome tokenization folded into Track D1.

## Entry 036 - 2026-06-15 - V2 Track B4: Redundant non-color clause encoding (S-VIS-3)

- Task: Make each clause type legible WITHOUT color (color-blind redundancy), per S-VIS-3, replacing the signal lost when confidence dashing was removed.
- What the agent did (all in content/index.ts using the `clauseEncoding` tokens from B1):
	- Popover header: the type label now leads with the clause glyph (e.g. "▶ Action", "⬡ Tech stack"), so the type reads in grayscale.
	- Underlines: each clause type renders a distinct texture + weight — context solid-2px, tech_stack double, constraint wavy, action solid-3px, output_format dotted, edge_case dashed — applied at both the base render and applyAcceptanceVisualsToSpan. The stale-accepted STATE keeps its dashed signal (distinguished from edge_case by gray color + 0.3 opacity).
- Files edited: extension/src/content/index.ts, logging/progress_log.md.
- Verification: extension tsc exit 0; full vitest 13 failed / 14 passed — fail count identical to the known-13 baseline (zero new regressions).
- Task alignment:
	- Fulfillment: Clause type is now carried by glyph (header) + underline texture/weight (overlay) in addition to color — the S-VIS-3 redundancy.
	- Deviation: None. Live visual confirmation of the textures rendering correctly on host sites is part of the Track A5 manual guide (needs a browser).
	- Residual: None for B4. Track B (design-system-as-code, milestone M1 with Track A) complete.

## Entry 037 - 2026-06-15 - V2 Track C: Core extraction boundary spike + first proven slice (DEC-2, STOP FOR REVIEW)

- Task: "Attempt C" per the run decision — build the highest-risk core extraction on its own branch and STOP for human review rather than merge (plan §7A.5, DEC-2). Deliver the C1 boundary spike + a proven low-risk slice + the C2 contracts, NOT the full state-machine extraction.
- Branch: v2/track-c-core (stacked on v2/track-b-tokens).
- What the agent did:
	- `docs/agent_plans/v2/c1_core_boundary_spike.md`: the C1 design note (plan §9 action #4) — classifies every monolith unit as portable/DOM-bound/mixed, defines the extraction sequence, documents the C2 contracts, and lists open decisions for the reviewer.
	- Established `packages/core/` (pure TS, zero DOM/Node/chrome — R-ARCH-1), consumed via relative import like `shared/` (root `index.ts` barrel re-exporting `src/`).
	- `packages/core/src/clause-order.ts`: extracted CANONICAL_ORDER_BY_GOAL_TYPE + GOAL_TYPES_IN_CANONICAL_ORDER + canonicalSlotForGoalType + a stable `sortByCanonicalOrder`. The extension now imports these from core and its local duplicates are removed (fixes the canonical-clause-ordering "same slot-definition source" invariation — the map was duplicated in extension + backend).
	- `packages/core/src/adapter.ts`: `InputSource` / `RenderTarget` contracts (C2, pure types).
	- `packages/core/src/transport.ts`: `TransportClient` contract (proxy-only, R-PLAT-1).
	- `packages/core/README.md` + barrels.
	- `extension/src/content/__tests__/clause-order.core.test.ts`: 4 tests (slot map, canonical order, out-of-order sort, slot-stable sort) — all pass.
- Files edited: packages/core/{index.ts,README.md,src/{clause-order,adapter,transport,index}.ts}, extension/src/content/index.ts, extension/src/content/__tests__/clause-order.core.test.ts, docs/agent_plans/v2/c1_core_boundary_spike.md, logging/progress_log.md.
- Verification: extension tsc 0; backend tsc 0; extension vitest 13 failed / 18 passed (fail count = known-13 baseline → zero new regressions; +4 core tests pass); backend bun test 76/3 (known external, unchanged). Canonical-order extraction is behavior-preserving (value-identical).
- Task alignment:
	- Fulfillment: C1 boundary spike + proven extraction slice + C2 contracts delivered on an isolated branch.
	- Deviation (intentional, per decision): The high-blast-radius steps — section state-machine extraction, settings, orchestration, adapter-dom (C2 impl), and the C3 test harness — were NOT attempted. Plan DEC-2 mandates they land behind the C3 harness with a human-reviewed PR; the stale extension suite makes the harness a prerequisite, and there is no live browser to verify behavior here.
	- Residual / STOP: Awaiting human review of the spike + this branch. Open decisions enumerated in §6 of the spike note (blast-radius sign-off, shared/ vs packages/core absorption, backend canonical-order unification, monorepo tooling). Nothing pushed; branches are local (push/PR is an outward action requiring explicit go-ahead).

## Entry 038 - 2026-06-15 - V2 Track D (partial): Design system + motion APPLIED to shadow surfaces (AUD-1/2/3)

- Task: Scope expansion authorized by the user ("make everything professional grade; standards were too low"). Apply the design tokens + named motion + reduced-motion to the live UI surfaces — the visible polish that B1-B4 only authored as data.
- Branch: v2/track-d-polish (stacked on v2/track-c-core).
- Correction to prior audit: the hover popover, ghost panel, and toast ALREADY use Shadow DOM (attachShadow). AUD-1 overstated the isolation gap. The real gap was token/motion APPLICATION, not isolation.
- What the agent did:
	- `shared/design/css.ts`: `shadowBaseCss(theme)` emits the `--pc-*` token vars (CSS `all: initial` does NOT reset custom properties, so this is safe alongside each surface's :host reset) + `pc-float-in`/`pc-pulse` keyframes + a global `prefers-reduced-motion` guard. `motionPreset` shorthands keyed to motion tokens.
	- Applied to popover, ghost panel, and toast: prepended shadowBaseCss; swapped exact-match literals (surface-border, text-primary/secondary, neutral-8, shadow-panel/popover, radius-lg, font-family) for `var(--pc-*)` (zero visual change); added the float-in entrance animation.
	- Toast fade transition routed through `motionTransition("opacity","slow")` (host is light-DOM, so the shadow reduced-motion guard can't reach it; the helper collapses to 0ms under reduced-motion).
	- +2 tests asserting var emission, keyframes, reduced-motion guard, and motionPreset timings.
- Files edited: shared/design/{css.ts,index.ts}, extension/src/content/index.ts, extension/src/content/__tests__/design-tokens.test.ts, logging/progress_log.md.
- Verification: extension tsc 0; vitest 13 failed / 20 passed (fail count = known-13 baseline → zero new regressions).
- Task alignment:
	- Fulfillment: the three chrome surfaces are now token-consistent, motion-correct, and reduced-motion-aware — verifiable here.
	- Deviation / honest limit: PIXEL parity (G-2 ±1px) and a11y (G-1 axe) certification, the underline-overlay shadow isolation, onboarding (D3), and bundling Inter Variable as a web-accessible @font-face are either browser-gated (need rendering to verify) or larger follow-ups. Font currently falls back to system-ui (professional-acceptable). These are NOT claimed done.
	- Residual: Visual sign-off requires running the dev build; offered to iterate with screenshots. Track D2/D3 + font bundling sequenced for a browser-in-the-loop pass.

## Entry 039 - 2026-07-06/07 - Fable pass: Track D finish + real test harness + Option E + prompt history + BE-QUAL-1 (retroactive backfill)

- **Note**: this entry was not logged at the time it happened — backfilled 2026-08-02
  during a repo-wide documentation audit, after discovering this work already existed on
  `origin/main` with no trace in this log. Summarized from commit messages and
  `human/06_FABLE_PASS_REPORT.md`; treat as lower-fidelity than a live-written entry.
- Task: continue Track D to completion and close the C3 test-harness gap; ship the
  non-destructive bind design (Option E); ship prompt history; fix backend output quality.
- What happened (12 commits, `900dcb3`..`bba8869`):
	- **D1+C3**: overlay mirror shadow-wrapped; Inter Variable bundled; root-caused the
	  "13 known stale test failures" to a missing `chrome.storage` mock (12 of 13) plus one
	  inverted assertion — not a deeper suite problem. New `extension/src/test/chrome-mock.ts`.
	  Vitest went from 20/33 to 33/33, later 47/47.
	- **D2**: CSS Custom Highlights (`::highlight()`) hybrid renderer — paints unaccepted-clause
	  underlines on real text nodes where supported; shadow-wrapped overlay retained as
	  fallback and still owns accepted/stale/focus visuals + hover hit-testing (resolves OD-7).
	- **D3**: persistent keymap HUD + one-time coach mark (`promptcompiler.onboarding.seen`).
	- **e2e/ package**: new self-contained Playwright suite, hermetic mock backend
	  (`e2e/mock-backend.mjs`), 8 site fixtures, covering A1/A2/A3 + G-1/G-2/G-3/G-4/G-5.
	  19/19 green.
	- **BIND-UX-2**: Backspace/Delete un-accepts a focused accepted clause.
	- **BIND-DESIGN-1 Option E** (resolves OD-9): `accepted?: boolean` additive field on
	  `/bind` sections; unaccepted clauses now ride the bind payload near-verbatim instead
	  of being dropped on commit.
	- **OD-11 slice**: client-side error capture (window error/unhandledrejection listeners,
	  extension-attributable filtering) — `deliverErrorReport` is a stub seam only, no
	  Sentry DSN/transport wired.
	- **Prompt history + template library**: new popup surface
	  (`extension/src/popup/components/HistoryPanel.tsx`, `usePromptHistory.ts`), backed by
	  `chrome.storage.local` (`promptcompiler.history`), search/copy/delete/pin.
	- **BE-QUAL-1**: classifier disambiguation, enhance sharpens instead of padding, bind
	  compiles instead of concatenating (`backend/src/services/prompts/{base,bind,mode,
	  tech_stack}.ts`, `backend/src/services/segment.ts`).
- Flagged as NOT done at the time (see Entry 040/041 for what happened to these since):
  Supabase project dead (NXDOMAIN), Fly.dev never redeployed with this pass's code.
- Task alignment: fulfillment — Track D fully closed, C3 unblocked, Option E + prompt
  history shipped as scoped. Residual at the time: production blockers (Supabase, Fly)
  and the `@live` e2e tier deliberately left unwritten.

## Entry 040 - 2026-08-01 - Phase 0: git consolidation + Fly.io redeploy

- Task: discovered `origin/main` already had Entry 039's work (this session's branches
  never fetched it) — Tracks A-D were redundant with two in-flight PR branches. Consolidate
  onto `main`, then get the fable-pass backend actually live (Supabase was NXDOMAIN, Fly
  was stale).
- What happened:
	- Deleted `pr/v2-track-ab-stabilize-design` and `pr/v2-track-c-core-extraction`
	  (confirmed byte-identical redundant with `main`).
	- Rebased the remaining `pr/v2-tooling-infra` branch (skill migration
	  `.github/skills/` → `.claude/skills/`, Fly.io scale-to-zero `fly.toml`, a new
	  Playwright e2e harness at `extension/tests/e2e/` driving the real live backend with a
	  real Supabase session minted via the admin API) onto current `main`; fixed 2 tests
	  broken by the D2 CSS Custom Highlights rewrite (scoped down to what `e2e/`'s hermetic
	  suite can't cover); merged as PR #3.
	- Deleted the now-fully-redundant `v2/track-a-stabilize`, `-b-tokens`, `-c-core`,
	  `-d-polish` branches (local + remote).
	- User re-provisioned the Supabase project (same URL, `yrilkwidkpqjzpsbldcr.supabase.co`)
	  independently; confirmed live via real integration-test traffic this session.
	- `fly deploy` — both machines updated to the fable-pass backend code (version 27);
	  confirmed `fly.toml` at 256mb/1 shared CPU/scale-to-zero for near-zero idle cost;
	  `fly secrets set` from current `backend/.env`.
	- Logged OD-13 (secret-rotation reminder — `backend/.env` was transferred over Gmail).
- Files edited: `.gitignore`, `extension/package.json`, `extension/tests/e2e/*` (new),
  `human/02_OPEN_DECISIONS.md`, `docs/agent_plans/v3/v3_multi_surface_plan.md` (new),
  `fly.toml` (via merge), `logging/commit_log.md`.
- Verification: extension tsc 0; backend tsc 0; backend bun test 79/3 (documented external
  Supabase rate-limit baseline); extension playwright 6/6 (including a real `/segment` call
  against the freshly-deployed live backend, confirming the deploy actually works
  end-to-end, not just that the process boots).
- Task alignment: fulfillment — branches consolidated, backend genuinely live. Residual:
  ANTHROPIC_API_KEY still a placeholder; secret rotation (OD-13) not yet done, only
  confirmed current.

## Entry 041 - 2026-08-02 - v3 plan: multi-surface + write-mode style-control architecture (planning only, no code)

- Task: decide v1 direction. User's daily coding tools (Termius, Claude Desktop/mobile,
  terminal, VS Code) are unreachable by a Chrome content script; separately, wants a
  Grammarly-style day-to-day writing mode alongside the existing coding pipeline.
- Decisions made (all user calls, not assumed):
	- VS Code extension explicitly rejected (high cost, narrow win).
	- v1 surfaces: existing browser extension + new CLI + new Claude Code skill + new MCP
	  server, all as thin clients on the existing proxy-only backend.
	- Write mode redesigned from a first draft ("parallel goal-type taxonomy, classify then
	  accept/reject like code-mode") into a two-layer model after competitive research
	  (Grammarly/Wordtune 2026 feature sets): auto-applied correctness fixes (grammar/
	  clarity/conciseness) + a user-controlled `StyleProfile` (6 dials: formality, warmth,
	  assertiveness, figurativeLanguage, humor, conciseness) — the differentiation bet is
	  treating mood/figurative-language/voice as a *generative* control, which no
	  competitor currently does.
	- Auth for non-browser surfaces: a long-lived Personal Access Token (`gh`/`vercel`/
	  `stripe`-CLI pattern), not reused Supabase login or device-code OAuth.
	- Style input: freeform natural-language instruction (parsed server-side into dial
	  values) as the universal mechanism across all 4 surfaces; explicit sliders as an
	  extension-only precision layer on the same underlying object.
	- Correctness layer ships single-pass/auto-applied in v1 (no per-span review UI);
	  revisit once the style layer is proven. No named-author/persona voice presets
	  (abstract dimensions only).
- Full plan: `docs/agent_plans/v3/v3_multi_surface_plan.md`. Nothing in this entry has
  been implemented — Phase 1 (PAT auth + the 3 new `/write/*` routes + `StyleProfile`
  contracts + backend prompt factories) is next.
- Task alignment: fulfillment — architecture decided with the user, documented. Deviation:
  none from what was asked (explicitly a planning-only session). Residual: the directive-
  compiler (`styleProfileToDirectives`) wording needs real iteration against actual
  Slack/email drafts before Phase 1 can be considered done — flagged in the plan as a
  prompt-quality problem, not something finish-able by writing code in the abstract.
