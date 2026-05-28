---
name: detailed-chat-output
description: "Use when responses need structured, traceable communication for multi-step tasks and workflow updates."
---

# Detailed Chat Output

## When to Use

Use this skill at when you have made any code edits.

## When Not to Use

Do not use this skill for simple questions, clarifications, or when no code changes were made.

## Files and Surfaces

- .github/skills/
- .github/prompts/
- docs/
- README.md

## Deliverables

- response order: outcome, changes, verification, residual risk or next steps
- direct file references for edited files
- concise but complete rationale for non-obvious decisions
- explicit callout of anything not verified

## Output Rules

- Lead with what was achieved.
- Keep sections short and scannable.
- Avoid filler and duplicate explanations.
- Use consistent wording for verification status.

## Verification Checklist

- The answer includes outcome first.
- Changes are mapped to concrete files.
- Verification status is explicit.
- Any risks or follow-up actions are clear.
