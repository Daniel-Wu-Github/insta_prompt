# Skill Map

This file is the central source of truth for repository skills.

All agents must do these steps before using or editing skills:

1. Read this file first.
2. Load only the smallest sufficient skill set for the task.
3. If any skill is added, removed, renamed, or scope-changed, update this file in the same change.

## Selection Order

1. Classify the task (domain, risk, lifecycle stage).
2. Load [repo-workflow](repo-workflow/SKILL.md).
3. Load [scope-creep-guard](scope-creep-guard/SKILL.md) for every task before planning or edits.
4. For documentation maintenance, load [documentation-cohesion](documentation-cohesion/SKILL.md).
5. For Step 2 enforcement work, load [rate-limiting-tier-enforcement](rate-limiting-tier-enforcement/SKILL.md).
6. For Step 3 routing and prompt orchestration, load [llm-router-and-model-selection](llm-router-and-model-selection/SKILL.md) and [system-prompt-assembly](system-prompt-assembly/SKILL.md).
7. For Step 4-5 clause and extension workflow work, load [canonical-clause-ordering](canonical-clause-ordering/SKILL.md), [clause-state-management](clause-state-management/SKILL.md), [mv3-extension-boundaries](mv3-extension-boundaries/SKILL.md), and [sse-streaming-bridge](sse-streaming-bridge/SKILL.md).
8. Add cross-cutting skills as needed in this order:
  1. [skill-map-governance](skill-map-governance/SKILL.md)
  2. [verification-gate](verification-gate/SKILL.md)
  3. [workflow-logging](workflow-logging/SKILL.md)
  4. [remote-commit-logging](remote-commit-logging/SKILL.md)
  5. [detailed-chat-output](detailed-chat-output/SKILL.md)
  6. [self-improvement-loop](self-improvement-loop/SKILL.md)
  7. [skill-improvement-loop](skill-improvement-loop/SKILL.md)

## Skill Registry

| Skill | Path | Purpose | Load When |
|---|---|---|---|
| repo-workflow | [repo-workflow/SKILL.md](repo-workflow/SKILL.md) | Maintain instruction and workflow surfaces | Any customization or workflow maintenance task |
| scope-creep-guard | [scope-creep-guard/SKILL.md](scope-creep-guard/SKILL.md) | Enforce explicit phase boundaries and prevent out-of-scope edits | Every task, before planning or edits |
| documentation-cohesion | [documentation-cohesion/SKILL.md](documentation-cohesion/SKILL.md) | Ensure fixes integrate naturally and remain readable by humans and AI agents | Creating or refining planning docs, taskboards, prompts, or specification documents |
| rate-limiting-tier-enforcement | [rate-limiting-tier-enforcement/SKILL.md](rate-limiting-tier-enforcement/SKILL.md) | Enforce Step 2 quota and tier gate behavior with deterministic contracts | Step 2 backend middleware and public-endpoint abuse-control work |
| llm-router-and-model-selection | [llm-router-and-model-selection/SKILL.md](llm-router-and-model-selection/SKILL.md) | Build deterministic tier/mode/callType model routing behavior | Step 3 backend model-routing implementation and tests |
| system-prompt-assembly | [system-prompt-assembly/SKILL.md](system-prompt-assembly/SKILL.md) | Build goal-type prompt factories and bind assembly behavior | Step 3 prompt-template and assembly implementation work |
| canonical-clause-ordering | [canonical-clause-ordering/SKILL.md](canonical-clause-ordering/SKILL.md) | Enforce canonical clause slot ordering across API and UI layers | Step 4-5 section ordering, bind sorting, and contract alignment work |
| clause-state-management | [clause-state-management/SKILL.md](clause-state-management/SKILL.md) | Enforce section lifecycle and stale-propagation correctness | Step 4-5 acceptance flow, stale invalidation, and bind gating work |
| mv3-extension-boundaries | [mv3-extension-boundaries/SKILL.md](mv3-extension-boundaries/SKILL.md) | Preserve MV3 process and storage boundaries | Step 5 extension process-boundary and messaging work |
| sse-streaming-bridge | [sse-streaming-bridge/SKILL.md](sse-streaming-bridge/SKILL.md) | Enforce stream contract and abort-safe relay behavior | Step 5 SSE streaming bridge implementation across backend and extension |
| skill-map-governance | [skill-map-governance/SKILL.md](skill-map-governance/SKILL.md) | Keep the skill map synchronized with the skill catalog | Any skill add/remove/rename/scope change |
| verification-gate | [verification-gate/SKILL.md](verification-gate/SKILL.md) | Enforce verification before completion | Any task that edits files, config, or process docs |
| workflow-logging | [workflow-logging/SKILL.md](workflow-logging/SKILL.md) | Capture decisions, progress, and change records | Material process or instruction updates |
| remote-commit-logging | [remote-commit-logging/SKILL.md](remote-commit-logging/SKILL.md) | Automatically log pushed commits by branch as detailed commit history | Tasks that add or maintain commit history automation |
| detailed-chat-output | [detailed-chat-output/SKILL.md](detailed-chat-output/SKILL.md) | Keep output structure clear and complete | Multi-step or high-risk tasks that need clear traceability |
| self-improvement-loop | [self-improvement-loop/SKILL.md](self-improvement-loop/SKILL.md) | Improve instructions after mistakes or drift | Repeated errors, stale docs, or avoidable rework |
| skill-improvement-loop | [skill-improvement-loop/SKILL.md](skill-improvement-loop/SKILL.md) | Summarize mistakes, evaluate skill effectiveness, and improve skills | Skill quality issues or missed auto-loading behavior |

## Maintenance Rules

- Keep skills non-feature-specific unless implementation code requires otherwise.
- Keep each skill narrow with explicit use and non-use guidance.
- Prefer updating existing skills over creating near-duplicates.
- Keep paths and links in this map valid.

## Change Log Requirement

When this map changes, include a short note in the same PR or commit message that states:

- what changed in the registry
- why the change was needed
- what tasks now load the new or revised skill

## Machine-Readable Index

```yaml
skillMap:
  version: 1
  sourceOfTruth: .github/skills/SKILL_MAP.md
  mandatoryReadFirst: true
  requiredOnChange: true
  selectionOrder:
    - repo-workflow
    - scope-creep-guard
    - documentation-cohesion
    - rate-limiting-tier-enforcement
    - llm-router-and-model-selection
    - system-prompt-assembly
    - canonical-clause-ordering
    - clause-state-management
    - mv3-extension-boundaries
    - sse-streaming-bridge
    - skill-map-governance
    - verification-gate
    - workflow-logging
    - remote-commit-logging
    - detailed-chat-output
    - self-improvement-loop
    - skill-improvement-loop
  registry:
    - name: repo-workflow
      path: .github/skills/repo-workflow/SKILL.md
      type: meta-workflow
    - name: scope-creep-guard
      path: .github/skills/scope-creep-guard/SKILL.md
      type: safety-governance
    - name: documentation-cohesion
      path: .github/skills/documentation-cohesion/SKILL.md
      type: documentation-quality
    - name: rate-limiting-tier-enforcement
      path: .github/skills/rate-limiting-tier-enforcement/SKILL.md
      type: enforcement
    - name: llm-router-and-model-selection
      path: .github/skills/llm-router-and-model-selection/SKILL.md
      type: routing
    - name: system-prompt-assembly
      path: .github/skills/system-prompt-assembly/SKILL.md
      type: prompt-assembly
    - name: canonical-clause-ordering
      path: .github/skills/canonical-clause-ordering/SKILL.md
      type: pipeline-ordering
    - name: clause-state-management
      path: .github/skills/clause-state-management/SKILL.md
      type: pipeline-state
    - name: mv3-extension-boundaries
      path: .github/skills/mv3-extension-boundaries/SKILL.md
      type: extension-architecture
    - name: sse-streaming-bridge
      path: .github/skills/sse-streaming-bridge/SKILL.md
      type: streaming
    - name: skill-map-governance
      path: .github/skills/skill-map-governance/SKILL.md
      type: governance
    - name: verification-gate
      path: .github/skills/verification-gate/SKILL.md
      type: validation
    - name: workflow-logging
      path: .github/skills/workflow-logging/SKILL.md
      type: logging
    - name: remote-commit-logging
      path: .github/skills/remote-commit-logging/SKILL.md
      type: logging-automation
    - name: detailed-chat-output
      path: .github/skills/detailed-chat-output/SKILL.md
      type: communication
    - name: self-improvement-loop
      path: .github/skills/self-improvement-loop/SKILL.md
      type: maintenance
    - name: skill-improvement-loop
      path: .github/skills/skill-improvement-loop/SKILL.md
      type: evaluation
```
