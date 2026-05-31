# PromptCompiler — Claude Code Instructions

## Core Mission

- Preserve PromptCompiler's non-destructive prompt-compilation UX while implementing or changing any subsystem.
- Prefer correctness of state transitions and data flow over cosmetic or convenience shortcuts.
- Fast local feedback first, network/LLM work second.

## Project Philosophy

PromptCompiler is a compiler-like workflow: segment → classify → expand → bind → commit. The user stays in control at each stage; no hidden destructive mutation of input text before explicit commit. Cross-layer consistency is required: UX flow, clause pipeline, extension process model, API contracts, and routing rules must align.

## Architecture Guardrails (Must Not Be Violated)

- Proxy-only LLM architecture: extension clients never call third-party LLM providers directly.
- MV3 process boundaries: content script and background service worker are isolated; communicate via runtime messaging/storage only.
- Content scripts do DOM interaction and UX; background service worker does network/API requests.
- No inline DOM replacement until final commit step; accepted sections are visual state only until commit.
- Respect dirty-state propagation: upstream edits invalidate dependent downstream sections.
- Preserve debounce/abort behavior for segmentation and enhancement calls.
- Preserve canonical binding order: context → tech_stack → constraints → action → output_format → edge_cases
- Maintain tier routing invariants: free tier → Groq path; pro tier → pro models.
- Do not bypass auth, rate limits, or tier enforcement middleware when touching API paths.

## Sources of Truth

- `docs/ARCHITECTURE.md`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/EXTENSION.md`
- `docs/BACKEND_API.md`
- `docs/LLM_ROUTING.md`
- `docs/DATA_MODELS.md`

When unsure, align changes to these docs or explicitly call out the mismatch.

---

## Skill System

This project has a skill library at `.github/skills/`. Skills are focused guidance files that enforce architecture, safety, and quality rules for specific task domains.

**Before starting any task:**
1. Read `.github/skills/SKILL_MAP.md` — it is the central source of truth.
2. Determine the task domain (see table below).
3. Read each applicable skill file before planning or editing anything.

### Mandatory Skills (load for every task)

| Skill | Path |
|---|---|
| scope-creep-guard | `.github/skills/scope-creep-guard/SKILL.md` |

### Task-Triggered Skills (load when the task matches)

| Task Domain | Skills to Load |
|---|---|
| Any content script, overlay, mirror, scroll, underline, preview rendering, shadow DOM, or popover work | `underline-preview-rendering/SKILL.md`, `content-script-instrumentation/SKILL.md`, `mv3-extension-boundaries/SKILL.md`, `ui-design-system/SKILL.md`, `dom-memory-management/SKILL.md` |
| Background service worker, port messaging, session recovery, or keepalive work | `background-port-state-recovery/SKILL.md`, `mv3-extension-boundaries/SKILL.md` |
| SSE streaming, backend relay, or abort-safe stream bridge work | `sse-streaming-bridge/SKILL.md` |
| Tab/Shift+Tab acceptance keybinding, dirty-state acceptance queue, or section focus work | `hotkey-bind-commit-ux/SKILL.md`, `clause-state-management/SKILL.md` |
| Cmd+Enter bind trigger, ghost text streaming, Enter commit, or Esc cancel/reset work | `hotkey-bind-commit-ux/SKILL.md`, `clause-state-management/SKILL.md`, `target-site-compat/SKILL.md` |
| LLM routing, model selection, or tier-based dispatch work | `llm-router-and-model-selection/SKILL.md` |
| Prompt assembly, system prompt factories, or clause templates | `system-prompt-assembly/SKILL.md` |
| Rate limiting, tier enforcement, or quota middleware | `rate-limiting-tier-enforcement/SKILL.md` |
| Clause ordering, bind payload sorting, or section contract alignment | `canonical-clause-ordering/SKILL.md`, `clause-state-management/SKILL.md` |
| Section acceptance, stale propagation, dirty-state graph, or bind gating | `clause-state-management/SKILL.md`, `hotkey-bind-commit-ux/SKILL.md` |
| Popup mode toggle, account tier display, usage indicator, upgrade CTA, or chrome.storage.sync patterns | `extension-popup-ux/SKILL.md`, `mv3-extension-boundaries/SKILL.md` |
| Shadow DOM CSS isolation, design tokens, color palette, underline styling, or textContent-only rendering | `ui-design-system/SKILL.md` |
| EventListener cleanup, MutationObserver teardown, ResizeObserver disconnect, overlay node removal, or memory leak | `dom-memory-management/SKILL.md` |
| TypeScript errors, Zod validation, message shape validation, no-any rules, or runtime type safety | `typescript-safety/SKILL.md` |
| Commit behavior on ChatGPT, Claude.ai, Linear, Notion, or GitHub; SPA reattach; native value setter; ProseMirror | `target-site-compat/SKILL.md` |
| Documentation authoring or planning doc updates | `documentation-cohesion/SKILL.md` |
| Manual testing guides, runbooks, or validation checklists | `manual-testing-guides/SKILL.md` |
| Workflow/instruction file changes, skill creation, or skill map updates | `repo-workflow/SKILL.md`, `skill-map-governance/SKILL.md` |
| Any task that edits files, config, or process docs | `verification-gate/SKILL.md` |
| Progress log, commit log, or logging surface updates | `workflow-logging/SKILL.md` |
| Commits being pushed to remote | `remote-commit-logging/SKILL.md` |
| Multi-step or high-risk tasks that need clear traceability | `detailed-chat-output/SKILL.md` |

### How to Apply Skills

Reading a skill is not enough — enforce its rules. If a skill defines a procedure, follow it step by step. If a skill defines an allow-list and deny-list, check your planned edits against both before touching any file.

---

## Mistake Log

When you make a real mistake (wrong logic, missed edge case, silent data loss, TypeScript error introduced by a change), write a **Debug Entry** in `.claude/debugging_log.md` using the template already in that file. This is the entire self-improvement loop. The Stop hook (`scripts/session-end.sh`) processes new entries at session end, updates `memory/skill_effectiveness.md` and `memory/debugging_patterns.md`, and sends a push notification if a skill gap escalates.

### Hooks
- **PostToolUse** (after `.ts` edits): `scripts/post-edit-check.sh` runs `tsc --noEmit --skipLibCheck`, sends ntfy push if errors found
- **Stop** (session end): `scripts/session-end.sh` checks tsc on modified packages, appends session boundary to `debugging_log.md`, runs `update-skill-memory.sh`
- **Notification** (approval needed): ntfy push to `ntfy.sh/claude-termius-daniel`

---

## Operating Requirements

- Research and plan before implementation. Read the relevant source-of-truth docs and skill files first.
- Execute in small verifiable steps. After each burst of edits, check against the declared scope.
- Summarize across all work done, not only the latest change. Call out deviations, ambiguous assumptions, and residual risks explicitly.

## Delivery Contract

Final response order:
1. Outcome
2. Changes made
3. Verification performed
4. Deviations or ambiguities
5. Residual risks and next steps

Be explicit about what was not validated and why.
