# Skill: handoff-prompt

## When to Use

Load this skill only when the user explicitly asks for a "handoff prompt", "context handoff", "continuation prompt", or equivalent. Do not load for any other task.

## Purpose

Produce a single self-contained handoff prompt written directly in chat — no files, no summaries, no task tracking. The prompt must give a cold-start agent (or a new conversation) full context to continue exactly where this session left off, with no gaps or invented details.

## Rules

1. **Only include what was actually discussed in this conversation.** Do not infer, extrapolate, or add detail not present in the chat.
2. **Write the prompt in chat, not to a file.** The user will copy it.
3. **Cover every open item.** Every unresolved bug, pending decision, and known constraint must appear.
4. **State the stack and infra precisely.** Versions, URLs, service names, and config details that were established in this conversation must be included verbatim.
5. **Include files changed this session.** List the files that were modified so the next agent can verify state.
6. **State what was explicitly NOT done.** Things the user asked about but that were deferred or ruled out must be noted.
7. **No speculation.** If something is unknown or ambiguous, say so explicitly.
8. **Format:** Use a structured prompt with clearly labelled sections. The recipient is a technical Claude agent who has never seen this conversation.

## Output Format

Write the handoff prompt between a pair of triple-backtick fences labelled `handoff-prompt`. Use these sections in order:

```
## Project
## Stack & Infra
## What Was Done This Session
## Files Changed This Session
## Open Bugs (do not fix without being asked)
## Pending Decisions / Deferred Items
## What Was Explicitly NOT Done
## How to Continue
```

Each section must be populated. Do not omit sections. Do not pad with filler.
