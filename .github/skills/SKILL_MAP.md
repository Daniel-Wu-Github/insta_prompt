# Skill Map

This file is the central source of truth for repository skills.

All agents must do these steps before using or editing skills:

1. Read this file first.
2. Load only the smallest sufficient skill set for the task.
3. If any skill is added, removed, renamed, or scope-changed, update this file in the same change.

## Selection Order

1. Classify the task (domain, risk, lifecycle stage).
2. Load [repo-workflow](repo-workflow/SKILL.md).
3. Add cross-cutting skills as needed in this order:
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
