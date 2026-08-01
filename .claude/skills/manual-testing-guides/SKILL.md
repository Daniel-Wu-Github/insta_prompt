---
name: manual-testing-guides
description: "Use when writing or revising step-by-step manual testing guides with sunny/rainy paths, recovery drills, and reproducible command output."
user-invocable: false
---

# Manual Testing Guides

## When to Use

Use this skill when you need to write or revise a manual testing guide that a human can execute end to end, especially when the guide combines:

- local service setup
- environment-variable export
- validation of runtime invariants
- direct API, UI, or CLI checks
- failure or recovery drills
- a short log of run outcomes

## When Not to Use

Do not use this skill for:

- unit tests, integration tests, or automation code
- feature implementation
- generic documentation that does not explain how to validate runtime behavior
- one-line run commands that do not need a structured guide

## Required Guide Shape

A strong manual testing guide should usually follow this order:

1. What This Covers
2. Terminal Setup
3. Preflight
4. Start and Reset Local Services
5. Export Local Env Vars
6. Verify Invariants Manually
7. Run the Test Matrix
8. Manual End-to-End Check
9. Optional Rainy Day Drill
10. Personal Notes

If a section is not relevant, explicitly say why it is omitted rather than inventing a filler section.

## Writing Rules

- Use the target repository's actual commands, paths, endpoints, and outputs.
- Keep the guide copy-pasteable.
- Put commands in fenced code blocks.
- Pair every procedure with clear sunny-day and rainy-day expectations.
- Include exact status codes, headers, response fields, or printed output when the behavior matters.
- If multiple terminals are needed, name them consistently and explain their roles.
- If env vars are required, show how to export them and note that the export block must be rerun in new shells.
- If a service must be restarted or reset, include the recovery sequence in the same guide.
- If a manual check depends on a known invariant, call that invariant out explicitly before the check.
- Keep examples realistic but sourced from the repository or verified runtime, not invented from assumption.
- Prefer short, directive prose over explanatory essays.

## Validation Rules

Before considering a guide complete, verify that it includes:

- a clear scope statement
- terminal/setup instructions when needed
- preflight checks for dependencies and tooling
- local service start or reset steps when relevant
- env export steps for every shell session that needs them
- at least one manual verification of a runtime invariant
- at least one direct end-to-end check such as cURL, UI, or CLI interaction when applicable
- an automated test matrix when the repo already has tests for the behavior
- a rainy-day path or recovery drill for realistic failure modes
- a final personal-notes block for date, sunny result, rainy result, and bugs found

## Common Anti-Patterns

1. Bolting the guide onto the end of a doc without matching the existing step flow.
2. Listing commands without expected outcomes.
3. Omitting recovery steps for service failures.
4. Describing behavior without naming the invariant being checked.
5. Requiring manual steps but skipping the automated test matrix that proves the same behavior.
6. Using vague language like "check it works" instead of specific expected status codes, headers, outputs, or row counts.
7. Inventing commands or outputs that are not supported by the current repo.

## Operating Rules

- Load [documentation-cohesion](../documentation-cohesion/SKILL.md) when the task is to draft or refine a guide in a repository doc.
- Load [verification-gate](../verification-gate/SKILL.md) before completion to confirm the guide covers the requested behavior.
- Load [scope-creep-guard](../scope-creep-guard/SKILL.md) before planning or edits.
- Keep the skill non-project-specific; use it to author the guide structure, not to prescribe feature behavior.
- Reference the repository's source-of-truth docs and tests when filling in concrete values.
- Do not add speculative steps that are not supported by the current codebase.