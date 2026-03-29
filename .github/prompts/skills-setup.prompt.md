---
name: skills-setup
description: "Portable workflow prompt for agent skill selection, execution, verification, and maintenance."
---

# Skills Setup

Use this prompt to recreate the skill workflow in any repository.

## Purpose

This file does not define a project-specific skill map. It defines the workflow and standards an agent should use to discover, select, and apply whatever skills the current repository provides.

## Workflow Prompt

When a task arrives, do the following:

1. Classify the task by domain, risk, and lifecycle stage.
2. Inspect the repository for its current skill instructions, agent notes, and workflow files.
3. Select the smallest sufficient set of relevant skills.
4. Prefer workflow, validation, logging, and maintenance skills before narrower feature skills.
5. Execute the task in small, testable steps.
6. Verify the result against the relevant file, test, or runtime behavior.
7. If a skill or instruction file is stale, update it before relying on it again.
8. Log material workflow changes in the project progress file when one exists.

## Operating Norms

- Keep progress updates short, factual, and action-oriented.
- Present the outcome first, then the changes, then verification, then residual risk or next steps.
- Use markdown links for file references.
- Avoid assuming a skill exists; confirm the repository’s actual instruction files first.
- Prefer deterministic workflows over ad hoc judgment when the repo already defines a process.
- If the repository has its own skill catalog, follow it. If it does not, use the workflow categories below.

## Workflow Categories

Use these categories to decide which repository skills or instructions to load.

- Meta workflow: repository state capture, audit, maintenance, changelog/progress logging, and instruction hygiene.
- Runtime/infrastructure: transport, command routing, terminal execution, git operations, workspace observation, and task orchestration.
- UI and presentation: component structure, UI patterns, accessibility, and interface performance.
- Testing and verification: unit tests, integration tests, smoke tests, CI, and post-change validation.
- Security and validation: schema checks, payload limits, authentication or pairing flows, and safe error handling.
- Build and recovery: launch failures, bundler issues, entrypoint mismatches, and environment-specific startup problems.
- Platform-specific tuning: native UI patterns, refactors, and performance audits for the current stack.

## Quality Standard

Any skill or instruction file the agent loads should satisfy these conditions:

- Have a narrow purpose.
- State when to use it and when not to use it.
- Name the files or areas it influences.
- Describe the deliverables the agent should produce.
- Include a verification checklist or acceptance criteria.
- Remain concise enough to load quickly.
- Avoid embedding stale project assumptions.

## Maintenance Loop

If the repository’s workflow changes:

1. Update this prompt first.
2. Update the affected skill or instruction file second.
3. Update the project progress file if the change is material.
4. Keep any compatibility mirrors aligned only if the project still needs them.

## Machine-Readable Prompt Block

```yaml
workflowPrompt:
  version: 1
  role: "portable agent workflow"
  sourceOfTruth: skills_setup.md
  purpose: "recreate the repository's skill workflow in a portable way"
  selectionOrder:
    - classify task
    - inspect repository instructions
    - load smallest sufficient skill set
    - prioritize validation and maintenance skills
    - execute in small steps
    - verify against real files or runtime behavior
    - update stale instructions
    - log material workflow changes
  communicationContract:
    progressUpdates: short
    progressTone: factual
    finalAnswerOrder:
      - outcome
      - changes
      - verification
      - residual risk or next steps
    fileReferences: markdownLinksOnly
  qualityCriteria:
    - narrow purpose
    - clear use and non-use guidance
    - explicit file or surface ownership
    - deliverables stated
    - verification stated
    - concise enough to load quickly
    - no stale project-specific assumptions
  maintenancePolicy:
    updateThisFileFirst: true
    updateAffectedInstructionSecond: true
    logMaterialChanges: true
```

## Notes for Reuse

- Copy this file into a new repository as a template.
- Replace the generic categories with that repository’s actual skill files and instruction paths.
- Keep the workflow the same even when the skill names change.
