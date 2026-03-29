---
name: remote-commit-logging
description: "Use when setting up or maintaining automatic logging of pushed commits by branch with commit-level file change details."
---

# Remote Commit Logging

## When to Use

Use this skill when implementing or maintaining automatic commit logging tied to remote pushes.

## When Not to Use

Do not use this skill for ordinary change summaries that do not require push-triggered automation.

## Files and Surfaces

- .githooks/pre-push
- logging/commit_log.md
- .github/skills/SKILL_MAP.md
- .github/skills/workflow-logging/SKILL.md

## Deliverables

- a push-triggered logging mechanism that runs automatically
- branch-sectioned commit log entries
- commit-level file change detail that extends commit message context
- a quick per-commit purpose line that extends the commit message
- setup notes that keep the automation reliable in local clones

## Implementation Rules

- Use Git hook semantics that trigger before push (`pre-push` stage).
- Keep logs append-only and grouped under `## Branch: <name>` sections.
- Include remote name/ref, commit range, commit subject, author/date, purpose, and changed files.
- Keep failures non-destructive: logging issues should not block push completion.
- Preserve hook executable mode when committing (for example: `git add --chmod=+x .githooks/pre-push`).
- Because this runs before push, log entries represent push-attempt intent; they are strongly correlated with successful pushes but cannot prove remote acceptance by themselves.

## Verification Checklist

- Hook file exists at `.githooks/pre-push` and is executable in the local repo.
- `core.hooksPath` points to `.githooks` for this repository.
- `logging/commit_log.md` exists and uses branch sections.
- Each commit entry includes a `Purpose` line.
- At least one simulated or real push input produces the expected structured log output.
