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

This project has a skill library at `.claude/skills/`. Skills are focused guidance files that enforce architecture, safety, and quality rules for specific task domains. The harness `Skill` tool discovers them directly — invoke a skill with `Skill(<name>)` rather than reading its `SKILL.md`. Every skill sits exactly one level deep so all of them are discoverable; never nest a skill inside a subdirectory.

**Before starting any task:**
1. Read `.claude/skills/SKILL_MAP.md` — it is the central source of truth.
2. Determine the task domain (see table below).
3. Invoke each applicable skill before planning or editing anything.

### Mandatory Skills (invoke for every task)

| Skill | Invoke |
|---|---|
| scope-creep-guard | `Skill(scope-creep-guard)` |

### Task-Triggered Skills (invoke when the task matches)

| Task Domain | Skills to Invoke |
|---|---|
| Any content script, overlay, mirror, scroll, underline, preview rendering, shadow DOM, or popover work | `Skill(underline-preview-rendering)`, `Skill(content-script-instrumentation)`, `Skill(mv3-extension-boundaries)`, `Skill(ui-design-system)`, `Skill(dom-memory-management)` |
| Background service worker, port messaging, session recovery, or keepalive work | `Skill(background-port-state-recovery)`, `Skill(mv3-extension-boundaries)` |
| SSE streaming, backend relay, or abort-safe stream bridge work | `Skill(sse-streaming-bridge)` |
| Tab/Shift+Tab acceptance keybinding, dirty-state acceptance queue, or section focus work | `Skill(hotkey-bind-commit-ux)`, `Skill(clause-state-management)` |
| Cmd+Enter bind trigger, ghost text streaming, Enter commit, or Esc cancel/reset work | `Skill(hotkey-bind-commit-ux)`, `Skill(clause-state-management)`, `Skill(target-site-compat)` |
| LLM routing, model selection, or tier-based dispatch work | `Skill(llm-router-and-model-selection)` |
| Prompt assembly, system prompt factories, or clause templates | `Skill(system-prompt-assembly)` |
| Rate limiting, tier enforcement, or quota middleware | `Skill(rate-limiting-tier-enforcement)` |
| Clause ordering, bind payload sorting, or section contract alignment | `Skill(canonical-clause-ordering)`, `Skill(clause-state-management)` |
| Section acceptance, stale propagation, dirty-state graph, or bind gating | `Skill(clause-state-management)`, `Skill(hotkey-bind-commit-ux)` |
| Popup mode toggle, account tier display, usage indicator, upgrade CTA, or chrome.storage.sync patterns | `Skill(extension-popup-ux)`, `Skill(mv3-extension-boundaries)` |
| Shadow DOM CSS isolation, design tokens, color palette, underline styling, or textContent-only rendering | `Skill(ui-design-system)` |
| EventListener cleanup, MutationObserver teardown, ResizeObserver disconnect, overlay node removal, or memory leak | `Skill(dom-memory-management)` |
| TypeScript errors, Zod validation, message shape validation, no-any rules, or runtime type safety | `Skill(typescript-safety)` |
| Commit behavior on ChatGPT, Claude.ai, Linear, Notion, or GitHub; SPA reattach; native value setter; ProseMirror | `Skill(target-site-compat)` |
| Documentation authoring or planning doc updates | `Skill(documentation-cohesion)` |
| Manual testing guides, runbooks, or validation checklists | `Skill(manual-testing-guides)` |
| Workflow/instruction file changes, skill creation, or skill map updates | `Skill(repo-workflow)`, `Skill(skill-map-governance)` |
| Any task that edits files, config, or process docs | `Skill(verification-gate)` |
| Progress log, commit log, or logging surface updates | `Skill(workflow-logging)` |
| Commits being pushed to remote | `Skill(remote-commit-logging)` |
| Multi-step or high-risk tasks that need clear traceability | `Skill(detailed-chat-output)` |

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
