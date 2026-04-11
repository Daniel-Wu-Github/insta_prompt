# PromptCompiler Workspace Instructions

These instructions are always-on for work in this repository.

## Core Mission

- Preserve PromptCompiler's non-destructive prompt-compilation UX while implementing or changing any subsystem.
- Prefer correctness of state transitions and data flow over cosmetic or convenience shortcuts.

## Project Philosophies

- PromptCompiler is a compiler-like workflow: segment, classify, expand, bind, then commit.
- The user stays in control at each stage; no hidden destructive mutation of input text before explicit commit.
- Fast local feedback first, network/LLM work second.
- Cross-layer consistency is required: UX flow, clause pipeline, extension process model, API contracts, and routing rules must align.

## Architecture Guardrails (Must Not Be Violated)

- Proxy-only LLM architecture: extension clients never call third-party LLM providers directly.
- MV3 process boundaries: content script and background service worker are isolated and communicate via runtime messaging/storage only.
- Content scripts do DOM interaction and UX; background service worker does network/API requests.
- Keepalive assumptions for MV3 service worker lifecycle must be preserved.
- No inline DOM replacement until final commit step; accepted sections are visual state only until commit.
- Respect dirty-state propagation: upstream edits invalidate dependent downstream sections.
- Preserve debounce/abort behavior for segmentation and enhancement calls.
- Preserve canonical binding order:
  - context -> tech_stack -> constraints -> action -> output_format -> edge_cases
- Maintain tier routing invariants:
  - free tier routes to Groq path
  - pro tier can route to pro models
- Do not bypass auth, rate limits, or tier enforcement middleware when touching API paths.
- Keep v2-ready schema intent intact (project/context/pgvector-related structure).

## Sources of Truth

- docs/ARCHITECTURE.md
- docs/UX_FLOW.md
- docs/CLAUSE_PIPELINE.md
- docs/EXTENSION.md
- docs/BACKEND_API.md
- docs/LLM_ROUTING.md
- docs/DATA_MODELS.md

When unsure, align changes to these docs or explicitly call out the mismatch.

## Agent Operating Requirements (Non-Project-Specific)

- Research and plan before implementation.
- Load `.github/skills/scope-creep-guard/SKILL.md` for every task before planning or edits and enforce its boundary checks.
- Execute in small verifiable steps and iterate until the task is fully complete.
- Use additional sessions when necessary; do not stop at partial completion.
- Compact conversation context whenever context usage exceeds about 65 percent during long-running iteration.
- At completion, summarize across all sessions involved in the task, not only the latest session.
- If the agent deviated from plan, used ambiguous assumptions, or encountered uncertainty, report it explicitly in the final output.

## Delivery and Reporting Contract

- Final response order:
  - outcome
  - changes made
  - verification performed
  - deviations/ambiguities
  - residual risks and next steps
- Be explicit about what was not validated and why.
- Prefer concise, factual progress updates while working.

## Customization Hygiene

- If changing any skill files, update `.github/skills/SKILL_MAP.md` in the same change.
- Keep skill/instruction guidance narrow and avoid duplicating the same rule in multiple places without reason.
- If these instructions become stale after architecture changes, update this file first, then dependent skills/prompts.
