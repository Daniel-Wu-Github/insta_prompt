# PromptCompiler — Claude Code Instructions

## Core Mission

- Preserve PromptCompiler's non-destructive prompt-compilation UX while implementing or changing any subsystem.
- Prefer correctness of state transitions and data flow over cosmetic or convenience shortcuts.
- Fast local feedback first, network/LLM work second.

## Project Philosophy

PromptCompiler is a compiler-like workflow: segment → classify → expand → bind → commit. The user stays in control at each stage; no hidden destructive mutation of input text before explicit commit. Cross-layer consistency is required: UX flow, clause pipeline, extension process model, API contracts, and routing rules must align.

## Architecture Guardrails (Must Not Be Violated)

- Proxy-only LLM architecture: extension clients never call third-party LLM providers directly.
- MV3 process boundaries: content script and background service worker are isolated; communicate via runtime messaging/storage only.
- Content scripts do DOM interaction and UX; background service worker does network/API requests.
- No inline DOM replacement until final commit step; accepted sections are visual state only until commit.
- Respect dirty-state propagation: upstream edits invalidate dependent downstream sections.
- Preserve debounce/abort behavior for segmentation and enhancement calls.
- Preserve canonical binding order: context → tech_stack → constraints → action → output_format → edge_cases
- Maintain tier routing invariants: free tier → Groq path; pro tier → pro models.
- Do not bypass auth, rate limits, or tier enforcement middleware when touching API paths.

## Sources of Truth

- `docs/ARCHITECTURE.md`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/EXTENSION.md`
- `docs/BACKEND_API.md`
- `docs/LLM_ROUTING.md`
- `docs/DATA_MODELS.md`

When unsure, align changes to these docs or explicitly call out the mismatch.

---

## Skill System

This project has a skill library at `.github/skills/`. Skills are focused guidance files that enforce architecture, safety, and quality rules for specific task domains.

**Before starting any task:**
1. Read `.github/skills/SKILL_MAP.md` — it is the central source of truth.
2. Determine the task domain (see table below).
3. Read each applicable skill file before planning or editing anything.

### Mandatory Skills (load for every task)

| Skill | Path |
|---|---|
| scope-creep-guard | `.github/skills/scope-creep-guard/SKILL.md` |

### Task-Triggered Skills (load when the task matches)

| Task Domain | Skills to Load |
|---|---|
| Any content script, overlay, mirror, scroll, underline, or preview rendering work | `underline-preview-rendering/SKILL.md`, `content-script-instrumentation/SKILL.md`, `mv3-extension-boundaries/SKILL.md` |
| Background service worker, port messaging, session recovery, or keepalive work | `background-port-state-recovery/SKILL.md`, `mv3-extension-boundaries/SKILL.md` |
| SSE streaming, backend relay, or abort-safe stream bridge work | `sse-streaming-bridge/SKILL.md` |
| Hotkey, keybinding, accept/bind/commit UX flow work | `hotkey-bind-commit-ux/SKILL.md` |
| LLM routing, model selection, or tier-based dispatch work | `llm-router-and-model-selection/SKILL.md` |
| Prompt assembly, system prompt factories, or clause templates | `system-prompt-assembly/SKILL.md` |
| Rate limiting, tier enforcement, or quota middleware (Step 2) | `rate-limiting-tier-enforcement/SKILL.md` |
| Clause ordering, bind sorting, or section contract alignment (Step 4-5) | `canonical-clause-ordering/SKILL.md`, `clause-state-management/SKILL.md` |
| Documentation authoring or planning doc updates | `documentation-cohesion/SKILL.md` |
| Manual testing guides, runbooks, or validation checklists | `manual-testing-guides/SKILL.md` |
| Workflow/instruction file changes, skill creation, or skill map updates | `repo-workflow/SKILL.md`, `skill-map-governance/SKILL.md` |
| Any task that edits files, config, or process docs | `verification-gate/SKILL.md` |
| Progress log, commit log, or logging surface updates | `workflow-logging/SKILL.md` |
| Commits being pushed to remote | `remote-commit-logging/SKILL.md` |
| Repeated errors, stale docs, or avoidable rework patterns | `self-improvement-loop/SKILL.md`, `skill-improvement-loop/SKILL.md` |
| Multi-step or high-risk tasks that need clear traceability | `detailed-chat-output/SKILL.md` |

### How to Apply Skills

Reading a skill is not enough — enforce its rules. If a skill defines a procedure, follow it step by step. If a skill defines an allow-list and deny-list, check your planned edits against both before touching any file.

---

## Self-Improvement System

### Session Start — Check First
**Before doing anything else**, read `.claude/pending-improvements.md`. If it has unresolved entries:
1. Address each item (run `skill-improvement-loop`, update skills, re-run smoke test)
2. Delete the resolved section from the file
3. Then proceed with the user's task

### Push Notifications to Your Phone
All three hooks send push notifications to `ntfy.sh/claude-termius-daniel`:
- **PostToolUse** (after `.ts` edits): "TypeScript: N error(s) after editing..."
- **Stop** (session end): "Done — N error(s)" or "Done — no errors"
- **Notification** (approval needed): "Claude Code is waiting for your approval or input"

If notifications don't arrive: check `.claude/notification_log.txt` for what Claude Code sent. The log is created only when Notification events fire.

### Automatic Verification (PostToolUse Hook)
`scripts/post-edit-check.sh` runs after every Edit/Write to a `.ts` file. It:
- Runs `tsc --noEmit --skipLibCheck` on the affected package (rate-limited to once per 30s per package)
- Writes errors to `.claude/session_errors.tmp`
- Sends an ntfy push notification if errors are found

### Automatic Verification (Stop Hook)
`scripts/session-end.sh` runs at the end of every session. It:
- Checks TypeScript errors in any modified package (`extension/`, `backend/`)
- Appends a structured entry to `.claude/debugging_log.md`
- Calls `scripts/analyze-patterns.sh` to scan for recurring error patterns and skill gaps
- **Auto-flags `skill-improvement-loop`** if 2+ TypeScript errors were introduced in the session

### Debugging Log
`.claude/debugging_log.md` is the persistent record of implementation errors and skill gaps.
When you make a mistake (wrong logic, missed edge case, TypeScript error), append an entry using the template in that file. Include which skill was active and whether it should have prevented the error.

### Pattern Threshold — When to Trigger Skill Improvement
Run `skill-improvement-loop` when **any** of these conditions are true:
- The Stop hook auto-flags it (2+ errors in a session)
- The same bug type appears in `.claude/debugging_log.md` 2 or more times
- A skill failed to auto-load for a task it clearly covers

### Running the Smoke Test
After any skill is created, renamed, or reworded, run:
```
bash scripts/implicit-skill-smoke-test.sh
```
A failing test = a skill has a trigger gap. Fix the description or "When to Use" wording, then re-run until all tests pass.

### Pattern Analysis + Memory Update (session end pipeline)
Three scripts run in sequence at every session end:

1. `scripts/update-skill-memory.sh` — parses structured **Debug Entry** blocks from `debugging_log.md`. Extracts `**Skill gap:**` and `**Root cause:**` fields. Auto-updates `memory/skill_effectiveness.md` (miss counts) and `memory/debugging_patterns.md` (new/updated patterns). Sends urgent ntfy notification if a skill gap hits the escalation threshold.

2. `scripts/analyze-patterns.sh` — counts recurring TS error codes, hot files, skill gap mentions, and smoke test failures. Writes all findings to `pending-improvements.md`.

3. Both scripts read `.claude/config` for thresholds — tune that file, not the scripts.

### Tunable Thresholds (`.claude/config`)
- `TS_ERROR_THRESHOLD` — session errors before skill-improvement flag (default: 2)
- `POST_EDIT_RATE_LIMIT_SECS` — seconds between post-edit tsc runs (default: 30)
- `PATTERN_TS_ERROR_MIN` — same error code N+ times to flag (default: 2)
- `PATTERN_FILE_ERROR_MIN` — same file N+ error mentions to flag (default: 3)
- `SKILL_GAP_ESCALATE_MIN` — same skill in gap entries N+ times for urgent escalation (default: 2)

### Memory System
- `.claude/pending-improvements.md` — action queue, **checked at every session start**
- `memory/skill_effectiveness.md` — per-skill miss counts and scores; auto-updated by `update-skill-memory.sh`
- `memory/debugging_patterns.md` — recurring root causes; auto-populated from debug entries

---

## Operating Requirements

- Research and plan before implementation. Read the relevant source-of-truth docs and skill files first.
- Execute in small verifiable steps. After each burst of edits, check against the declared scope.
- Summarize across all work done, not only the latest change. Call out deviations, ambiguous assumptions, and residual risks explicitly.

## Delivery Contract

Final response order:
1. Outcome
2. Changes made
3. Verification performed
4. Deviations or ambiguities
5. Residual risks and next steps

Be explicit about what was not validated and why.
