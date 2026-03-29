---
name: repo-workflow
description: "Use when planning, selecting, or maintaining repository instruction files, prompts, skills, and workflow docs."
---

# Repository Workflow

## When to Use

Use this skill for work that affects the repository’s agent workflow surface:

- discovering existing instruction files, prompts, agents, or skills
- selecting the smallest sufficient set of repo-specific skills
- creating or updating customization files
- validating that workflow docs are current and non-conflicting
- logging material workflow changes when the repo already has a progress or changelog file

## When Not to Use

Do not use this skill for feature implementation, runtime debugging, or product design work unless the task specifically includes workflow or instruction maintenance.

## Files and Surfaces

This skill influences:

- `.github/skills/SKILL_MAP.md`
- `.github/prompts/`
- `.github/skills/`
- `.github/instructions/`
- `copilot-instructions.md`
- `AGENTS.md`
- any repo progress or changelog file used to track workflow changes

## Deliverables

When this skill is used, produce the smallest workable set of outputs:

- a clear task classification
- a short plan with ordered steps
- the relevant customization files or edits
- a verification pass against the actual repository state
- a brief note on residual risk or follow-up work

## Operating Rules

- Read `.github/skills/SKILL_MAP.md` first for skill selection and ordering.
- Load `.github/skills/skill-map-governance/SKILL.md` whenever any skill file is added, removed, renamed, or scope-changed.
- Load `.github/skills/skill-improvement-loop/SKILL.md` when effectiveness or auto-loading behavior is in question.
- Inspect the repo’s current instruction surface before making changes.
- Prefer existing workflow docs over inventing new conventions.
- Keep new skill files narrow and specific.
- Avoid feature assumptions that are not supported by the current repository.
- Update stale workflow files before depending on them again.
- Update `.github/skills/SKILL_MAP.md` in the same change when any skill is added, removed, renamed, or scope-changed.
- Use markdown links for file references.
- Keep progress updates short, factual, and action-oriented.

## Verification Checklist

- The target files exist at the intended paths.
- Frontmatter parses cleanly and the `description` is meaningful.
- The file scope matches the task and does not pull in unrelated behavior.
- `.github/skills/SKILL_MAP.md` is current if skills were modified.
- If skill behavior was tuned, effectiveness notes exist and changes are traceable.
- No duplicate or conflicting instruction surfaces were introduced.
- Any repo-specific workflow reference still points to the current canonical docs.

## Maintenance Notes

- If the repository gains implementation code, reassess whether feature-specific skills are needed.
- If the workflow changes, update the portable prompt first, then this skill.
