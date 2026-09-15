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

- .githooks/post-commit
- .githooks/pre-push
- .githooks/lib/commit-log-lib.sh
- logging/commit_log.md
- .claude/skills/SKILL_MAP.md
- .claude/skills/workflow-logging/SKILL.md

## Deliverables

- a logging mechanism that runs automatically on every commit, not just on push
- branch-sectioned commit log entries
- commit-level file change detail that extends commit message context
- a quick per-commit purpose line that extends the commit message
- setup notes that keep the automation reliable in local clones

## Implementation Rules

- Two hooks share the work, both sourcing `.githooks/lib/commit-log-lib.sh`:
  - `post-commit` is the primary trigger — it logs the commit that was just
    made (full subject/author/date/purpose/files block), whether or not it
    is ever pushed. A `pre-commit` hook cannot do this: the commit object
    and SHA don't exist yet at that stage, so `post-commit` is the correct
    git hook for "log every commit."
  - `pre-push` logs the push event itself (remote name/URL/ref, commit
    range) and, for each commit in range, either references the
    `post-commit` entry already logged or back-fills a full block if one is
    missing (e.g. a commit made before these hooks were installed).
- The purpose line is derived from the commit body's first non-trailer,
  non-empty line (skip lines matching `^[A-Za-z][A-Za-z0-9-]*:\s`, e.g.
  `Co-Authored-By:`, `Claude-Session:`, `Signed-off-by:` — these are
  provenance, not purpose) — falling back to a file-based add/modify/delete
  summary when the body has no non-trailer content.
- Keep logs append-only and grouped under `## Branch: <name>` sections.
- Keep failures non-destructive: logging issues should not block commit or
  push completion (`set -uo pipefail`, not `-e`, in both hooks).
- Handle rewritten-history cases gracefully when remote tip SHAs are not present locally by using a safe fallback range.
- Preserve hook executable mode when committing (for example: `git add --chmod=+x .githooks/post-commit .githooks/pre-push`).
- Both hooks are symlinked per-project by `setup.sh`, but `lib/` is not — each hook resolves its own real (non-symlink) path via `python3 -c "os.path.realpath(...)"` to find `lib/commit-log-lib.sh` correctly regardless of which project it's running from.

## Verification Checklist

- Hook files exist at `.githooks/post-commit` and `.githooks/pre-push`, both executable, both able to locate `.githooks/lib/commit-log-lib.sh`.
- `core.hooksPath` points to `.githooks` for this repository.
- `logging/commit_log.md` exists and uses branch sections.
- Each commit entry includes a `Purpose` line, and that line is never a bare git trailer (e.g. never `Co-Authored-By: ...`).
- A real commit produces a `post-commit`-logged entry without needing a push.
- A real or simulated push produces a push-event entry that references (not duplicates) already-logged commits, and back-fills any that aren't.
