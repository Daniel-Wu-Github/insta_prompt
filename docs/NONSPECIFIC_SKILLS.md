# Non-Specific Skills Handbook

This document is the portable reference for the repository's non-project-specific skill system. Use it to replicate the same agent workflow in other repositories, including VS Code extension projects.

## 1) What This Covers

This handbook captures:

1. Every current repository skill and its purpose.
2. How skills are selected and composed.
3. A detailed reusable agent prompt to bootstrap correct behavior.
4. A full replication workflow for VS Code customizations.
5. A VS Code extension packaging pattern to contribute skills through `chatSkills`.

## 2) Skill Catalog (All Current Skills)

The following skills are intentionally non-project-specific and transferable.

| Skill | Primary Purpose | Load Trigger | Typical Deliverable |
|---|---|---|---|
| `repo-workflow` | Plan and maintain instruction/skill/prompt surfaces | Any workflow or customization maintenance task | Scoped plan, minimal edits, verification summary |
| `scope-creep-guard` | Enforce explicit boundaries and prevent out-of-scope drift | Every task before planning or edits | Allow-list/deny-list discipline and scope audit |
| `documentation-cohesion` | Keep documentation integrated, hierarchical, and dual-readable (human + agent) | Any semantically meaningful doc/prompt/planning update | Cohesive edits integrated in-place, not bolted on |
| `skill-map-governance` | Keep `SKILL_MAP.md` synchronized with skill catalog changes | Any skill add/remove/rename/scope change | Updated registry, ordering, and machine-readable index |
| `verification-gate` | Validate requirement coverage and instruction consistency before completion | Any file-editing task | Explicit verification report and unresolved gaps list |
| `workflow-logging` | Record material workflow decisions and verification outcomes | Workflow-impacting edits (skills, prompts, instructions, process docs) | Structured progress-log entry with verification |
| `remote-commit-logging` | Maintain automated push-triggered commit logging with file-level details | Tasks that implement/maintain pre-push commit logging automation | Working hook behavior and branch-grouped commit log entries |
| `detailed-chat-output` | Keep complex responses traceable and reviewer-friendly | Multi-step, high-risk, or process-heavy tasks | Outcome-first report with changes, verification, and risk |
| `self-improvement-loop` | Correct recurring process mistakes and stale guidance | Repeated avoidable failures or workflow drift | Root-cause fix to instructions and reusable lesson capture |
| `skill-improvement-loop` | Evaluate skill effectiveness and improve auto-loading quality | Skill misfire, weak trigger wording, noisy overlaps | Scored skill effectiveness and targeted skill refinements |

## 3) Skill Selection and Composition Model

Use this ordering model in any repository that adopts this workflow:

1. Read `SKILL_MAP.md` first.
2. Load `repo-workflow`.
3. Load `scope-creep-guard` (mandatory for every task).
4. If docs are in scope, load `documentation-cohesion`.
5. Add cross-cutting skills as needed:
	 - `skill-map-governance` when skill catalog changes.
	 - `verification-gate` before completion.
	 - `workflow-logging` for material workflow changes.
	 - `remote-commit-logging` for push-log automation work.
	 - `detailed-chat-output` for complex communication.
	 - `self-improvement-loop` for repeated process failures.
	 - `skill-improvement-loop` for skill-quality tuning.

Design goal: load the smallest sufficient skill set, then execute in narrow verifiable increments.

## 4) Detailed Reusable Agent Prompt

Use the following prompt verbatim (or adapt placeholders) when onboarding an AI agent to this workflow:

```markdown
You are operating in a repository that uses a transferable skill-driven workflow.

Your objectives:
1) solve the user's request end-to-end,
2) stay within explicit scope boundaries,
3) produce verifiable, traceable results,
4) avoid hidden process drift.

Mandatory startup behavior:
1. Read `.github/skills/SKILL_MAP.md` first.
2. Load `.github/skills/repo-workflow/SKILL.md`.
3. Load `.github/skills/scope-creep-guard/SKILL.md` before planning or edits.
4. Load additional skills only when their trigger conditions apply.

Execution rules:
1. Classify the task by domain, risk, and lifecycle phase.
2. Declare an explicit allow-list of files and behaviors for this task.
3. Declare a deny-list of nearby but out-of-scope surfaces.
4. Execute in small, testable edits with verification after each logical batch.
5. If editing workflow docs/skills/prompts/instructions, record a progress-log entry.
6. If any skill file changes, update `SKILL_MAP.md` in the same change.
7. Before completion, run a verification gate:
	 - requirement coverage
	 - changed-file consistency
	 - instruction conflict scan
	 - unverified items explicitly listed

Communication contract:
1. Progress updates should be concise and factual.
2. Final response order:
	 - outcome
	 - changes made
	 - verification performed
	 - deviations or ambiguities
	 - residual risks and next steps
3. Prefer explicit claims tied to concrete file changes and checks.

Quality bar for decisions:
1. Prefer narrow, deterministic instruction updates over broad policy additions.
2. Fix root causes, not only symptoms.
3. Preserve existing workflows unless change is explicitly required.
4. If uncertainty exists, choose the smaller safe scope and call out what remains.

When debugging skill quality:
1. Use non-explicit prompt smoke tests.
2. Score skills for trigger quality, scope fit, outcome support, and noise.
3. Improve descriptions first, then body guidance.

Completion rule:
Do not finish until requested outputs exist, verification is explicit, and scope integrity is confirmed.
```

## 5) Full VS Code Workflow Replication

This section replicates the same skill workflow for use in other repositories through VS Code customizations.

### 5.1 Repository Layout (Portable Baseline)

Create this baseline structure in target repositories:

```text
.github/
	copilot-instructions.md
	prompts/
		skills-setup.prompt.md
	skills/
		SKILL_MAP.md
		repo-workflow/SKILL.md
		scope-creep-guard/SKILL.md
		documentation-cohesion/SKILL.md
		skill-map-governance/SKILL.md
		verification-gate/SKILL.md
		workflow-logging/SKILL.md
		remote-commit-logging/SKILL.md
		detailed-chat-output/SKILL.md
		self-improvement-loop/SKILL.md
		skill-improvement-loop/SKILL.md
```

Notes:

1. Keep skill directory names identical to each `name` field in `SKILL.md` frontmatter.
2. Keep `SKILL_MAP.md` as source-of-truth for load order and registry.
3. Keep one always-on `.github/copilot-instructions.md` that enforces mandatory skill loading.

### 5.2 Auto-Use Behavior in VS Code

VS Code automatically discovers these customization surfaces by default:

1. Always-on workspace instructions: `.github/copilot-instructions.md`.
2. Skill directories: `.github/skills/`.
3. Prompt files: `.github/prompts/`.
4. Path-scoped instruction files (optional): `.github/instructions/**/*.instructions.md`.

Recommended settings for reliable discovery and troubleshooting:

```json
{
	"chat.useCustomizationsInParentRepositories": true,
	"chat.useAgentsMdFile": true,
	"chat.includeApplyingInstructions": true,
	"chat.includeReferencedInstructions": true
}
```

Use Chat Diagnostics to confirm loaded instructions, skills, and prompts.

### 5.3 Copilot Instructions Blueprint (Always-On)

Your portable `.github/copilot-instructions.md` should include:

1. A mission statement (workflow quality, verification, and safety).
2. Mandatory rule: load `scope-creep-guard` for every task before planning/edits.
3. Skill loading order reference to `SKILL_MAP.md`.
4. Editing and verification expectations.
5. Final response contract (outcome-first reporting).

Minimum required directives:

1. "Read `SKILL_MAP.md` first."
2. "Use the smallest sufficient skill set."
3. "Run scope checks before edits and file-audit after edits."
4. "Run verification gate before completion."
5. "If skill catalog changes, update `SKILL_MAP.md` in same change."

### 5.4 Skill Map Blueprint

`SKILL_MAP.md` must include:

1. Mandatory read-first statement.
2. Selection order.
3. Registry table (skill, path, purpose, load trigger).
4. Maintenance rules.
5. Machine-readable index (YAML) for programmatic checks.

Map governance rules:

1. Every skill directory must have one registry entry.
2. No registry entry may point to a missing path.
3. Selection order must remain intentional and stable.

### 5.5 Replicating Through a VS Code Extension (Contributed Skills)

If you want to ship skills from a VS Code extension rather than from repository files, use `chatSkills` contribution.

Folder structure in extension source:

```text
my-extension/
	package.json
	skills/
		scope-creep-guard/
			SKILL.md
		verification-gate/
			SKILL.md
		...
```

`package.json` contribution example:

```json
{
	"contributes": {
		"chatSkills": [
			{ "path": "./skills/scope-creep-guard/SKILL.md" },
			{ "path": "./skills/verification-gate/SKILL.md" }
		]
	}
}
```

Critical constraints:

1. Parent directory name must match `name` in `SKILL.md` frontmatter.
2. `SKILL.md` must have valid YAML frontmatter with `name` and `description`.
3. Any supporting files/scripts must be referenced from `SKILL.md` so agents can discover them.

Important distinction:

1. Extension-contributed skills are discoverable as skills.
2. Repository files (`.github/copilot-instructions.md`, `SKILL_MAP.md`) still define your repo governance workflow.
3. For full parity with this workflow, keep both: extension-contributed skills plus repository-level map and instructions.

### 5.6 Rollout Checklist for New Repositories

Use this checklist when integrating the workflow elsewhere:

1. Copy `.github/skills/` and `.github/copilot-instructions.md`.
2. Validate all skill `name` fields match directory names.
3. Confirm `SKILL_MAP.md` registry paths resolve.
4. Open VS Code Chat Diagnostics and verify skills/instructions are detected.
5. Run one planning-only task and confirm `scope-creep-guard` is loaded first.
6. Run one edit task and confirm `verification-gate` behavior before completion.
7. If using workflow logs, confirm your progress-log format is applied.

## 6) Source References for This Handbook

This handbook is aligned with:

1. Repository skill files under `.github/skills/`.
2. `.github/skills/SKILL_MAP.md`.
3. `.github/copilot-instructions.md`.
4. `.github/prompts/skills-setup.prompt.md`.
5. Current VS Code documentation for custom instructions, prompt files, custom agents, and agent skills.
6. Agent Skills open specification (`agentskills.io/specification`).

## 7) What To Export When Sharing This Workflow

At minimum, export:

1. `.github/skills/**`
2. `.github/copilot-instructions.md`
3. `.github/prompts/skills-setup.prompt.md`
4. `docs/NONSPECIFIC_SKILLS.md`

Optional exports:

1. `logging/progress_log.md` (if you want your logging format preserved)
2. `.githooks/pre-push` and `logging/commit_log.md` (if you also want remote commit logging behavior)
