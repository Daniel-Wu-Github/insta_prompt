# Skill Map

This file is the central source of truth for repository skills.

All agents must do these steps before using or editing skills:

1. Read this file first.
2. Invoke the smallest sufficient skill set for the task via the `Skill` tool
   (e.g. `Skill(scope-creep-guard)`) — do not substitute `Read`/`cat` on a
   `SKILL.md` file for this; skills live under `.claude/skills/`, which the
   `Skill` tool discovers directly, so invoking it is both correct and
   cheaper than reading the file yourself.
3. If any skill is added, removed, renamed, or scope-changed, update this file in the same change.

## Selection Order

1. Classify the task (domain, risk, lifecycle stage).
2. Invoke `Skill(repo-workflow)`.
3. Invoke `Skill(scope-creep-guard)` for every task before planning or edits.
4. For documentation maintenance, invoke `Skill(documentation-cohesion)`.
5. For manual testing guide authoring, invoke `Skill(manual-testing-guides)`.
6. For Step 2 enforcement work, invoke `Skill(rate-limiting-tier-enforcement)`.
7. For Step 3 routing and prompt orchestration, invoke `Skill(llm-router-and-model-selection)` and `Skill(system-prompt-assembly)`.
8. For clause pipeline and extension workflow work, invoke `Skill(canonical-clause-ordering)`, `Skill(clause-state-management)`, `Skill(mv3-extension-boundaries)`, and `Skill(sse-streaming-bridge)`.
9. For extension runtime workflow work (Steps 6-11), invoke `Skill(background-port-state-recovery)`, `Skill(content-script-instrumentation)`, `Skill(underline-preview-rendering)`, `Skill(hotkey-bind-commit-ux)`, `Skill(dom-memory-management)`, and `Skill(ui-design-system)` alongside boundary/state/stream skills as needed.
10. For popup and account UX work (Step 12), invoke `Skill(extension-popup-ux)` and `Skill(mv3-extension-boundaries)`.
11. For TypeScript errors, message validation, or runtime type safety, invoke `Skill(typescript-safety)`.
12. For commit behavior on specific target sites (ChatGPT, Claude.ai, Linear, Notion, GitHub), invoke `Skill(target-site-compat)`.
13. Add cross-cutting skills as needed in this order:
  1. `Skill(skill-map-governance)`
  2. `Skill(verification-gate)`
  3. `Skill(workflow-logging)`
  4. `Skill(remote-commit-logging)`
  5. `Skill(detailed-chat-output)`
  6. `Skill(self-improvement-loop)`
  7. `Skill(skill-improvement-loop)`

## Skill Registry

| Skill | Path | Purpose | Load When |
|---|---|---|---|
| repo-workflow | [repo-workflow/SKILL.md](repo-workflow/SKILL.md) | Maintain instruction and workflow surfaces | Any customization or workflow maintenance task |
| scope-creep-guard | [scope-creep-guard/SKILL.md](scope-creep-guard/SKILL.md) | Enforce explicit phase boundaries and prevent out-of-scope edits | Every task, before planning or edits |
| documentation-cohesion | [documentation-cohesion/SKILL.md](documentation-cohesion/SKILL.md) | Ensure fixes integrate naturally and remain readable by humans and AI agents | Creating or refining planning docs, taskboards, prompts, or specification documents |
| manual-testing-guides | [manual-testing-guides/SKILL.md](manual-testing-guides/SKILL.md) | Author reproducible manual testing guides with setup, sunny/rainy paths, and recovery steps | Creating or revising manual testing guides, runbooks, or validation checklists |
| rate-limiting-tier-enforcement | [rate-limiting-tier-enforcement/SKILL.md](rate-limiting-tier-enforcement/SKILL.md) | Enforce Step 2 quota and tier gate behavior with deterministic contracts | Step 2 backend middleware and public-endpoint abuse-control work |
| llm-router-and-model-selection | [llm-router-and-model-selection/SKILL.md](llm-router-and-model-selection/SKILL.md) | Build deterministic tier/mode/callType model routing behavior | Step 3 backend model-routing implementation and tests |
| system-prompt-assembly | [system-prompt-assembly/SKILL.md](system-prompt-assembly/SKILL.md) | Build goal-type prompt factories and bind assembly behavior | Step 3 prompt-template and assembly implementation work |
| canonical-clause-ordering | [canonical-clause-ordering/SKILL.md](canonical-clause-ordering/SKILL.md) | Enforce canonical clause slot ordering across API and UI layers | Section ordering, bind payload sorting, and pre-bind canonical sort in content script |
| clause-state-management | [clause-state-management/SKILL.md](clause-state-management/SKILL.md) | Enforce section lifecycle, Tab/Shift+Tab acceptance queue, and dirty-state stale propagation | Section state transitions, acceptance flow, stale invalidation, and bind gating |
| mv3-extension-boundaries | [mv3-extension-boundaries/SKILL.md](mv3-extension-boundaries/SKILL.md) | Preserve MV3 process and storage boundaries | Any extension process-boundary, messaging, or storage scope work |
| sse-streaming-bridge | [sse-streaming-bridge/SKILL.md](sse-streaming-bridge/SKILL.md) | Enforce stream contract and abort-safe relay behavior | SSE streaming bridge implementation across backend and extension |
| background-port-state-recovery | [background-port-state-recovery/SKILL.md](background-port-state-recovery/SKILL.md) | Enforce restart-safe background port orchestration and per-tab session recovery | Background worker verbs, disconnect cleanup, and session-state restoration |
| content-script-instrumentation | [content-script-instrumentation/SKILL.md](content-script-instrumentation/SKILL.md) | Enforce robust input discovery, idempotent attachment, and debounce/abort orchestration | Content script instrumentation across dynamic editors |
| underline-preview-rendering | [underline-preview-rendering/SKILL.md](underline-preview-rendering/SKILL.md) | Enforce deterministic underline/preview rendering with typography and box-model sync | Overlay alignment, section-state styling, and preview lifecycle behavior |
| hotkey-bind-commit-ux | [hotkey-bind-commit-ux/SKILL.md](hotkey-bind-commit-ux/SKILL.md) | Enforce guarded keybinding flow from Tab acceptance through Cmd+Enter bind and Enter commit | Tab/Shift+Tab acceptance keys, bind trigger, ghost text, commit, and reset semantics |
| ui-design-system | [ui-design-system/SKILL.md](ui-design-system/SKILL.md) | Enforce Shadow DOM CSS isolation, design tokens, safe textContent rendering, and popup component patterns | Any overlay, popover, ghost text, underline styling, or popup UI work |
| dom-memory-management | [dom-memory-management/SKILL.md](dom-memory-management/SKILL.md) | Prevent memory leaks, ghost DOM nodes, and dangling listeners via cleanup registries and observer teardown | Any addEventListener, MutationObserver, ResizeObserver, overlay node creation, or cleanup path |
| typescript-safety | [typescript-safety/SKILL.md](typescript-safety/SKILL.md) | Enforce Zod validation at message boundaries, no-any in contracts, and sender verification | TypeScript errors, message handler authoring, shared contract changes, or any runtime I/O parsing |
| extension-popup-ux | [extension-popup-ux/SKILL.md](extension-popup-ux/SKILL.md) | Enforce storage-first popup state, loading guards, mode forwarding, tier display, and upgrade CTA gating | Popup mode toggle, account tier display, usage indicator, upgrade CTA, or chrome.storage.sync patterns |
| target-site-compat | [target-site-compat/SKILL.md](target-site-compat/SKILL.md) | Apply site-specific commit, reattach, and cursor patterns for ProseMirror, React-controlled inputs, SPAs, and virtualized editors | Commit behavior on ChatGPT, Claude.ai, Linear, Notion, or GitHub; SPA navigation reattach; native value setter patterns |
| skill-map-governance | [skill-map-governance/SKILL.md](skill-map-governance/SKILL.md) | Keep the skill map synchronized with the skill catalog | Any skill add/remove/rename/scope change |
| verification-gate | [verification-gate/SKILL.md](verification-gate/SKILL.md) | Enforce verification before completion | Any task that edits files, config, or process docs |
| workflow-logging | [workflow-logging/SKILL.md](workflow-logging/SKILL.md) | Capture decisions, progress, and change records | Material process or instruction updates |
| remote-commit-logging | [remote-commit-logging/SKILL.md](remote-commit-logging/SKILL.md) | Automatically log pushed commits by branch as detailed commit history | Tasks that add or maintain commit history automation |
| detailed-chat-output | [detailed-chat-output/SKILL.md](detailed-chat-output/SKILL.md) | Keep output structure clear and complete | Multi-step or high-risk tasks that need clear traceability |
| self-improvement-loop | [self-improvement-loop/SKILL.md](self-improvement-loop/SKILL.md) | Improve instructions after mistakes or drift | Repeated errors, stale docs, or avoidable rework |
| skill-improvement-loop | [skill-improvement-loop/SKILL.md](skill-improvement-loop/SKILL.md) | Summarize mistakes, evaluate skill effectiveness, and improve skills | Skill quality issues or missed auto-loading behavior |
| handoff-prompt | [handoff-prompt/SKILL.md](handoff-prompt/SKILL.md) | Produce a self-contained handoff prompt in chat to continue the session in a new conversation | Only when the user explicitly requests a handoff prompt |

## Maintenance Rules

- Keep skills non-feature-specific unless implementation code requires otherwise.
- Keep each skill narrow with explicit use and non-use guidance.
- Prefer updating existing skills over creating near-duplicates.
- Keep paths and links in this map valid.
- Shared skills (repo-workflow, scope-creep-guard, documentation-cohesion, manual-testing-guides, skill-map-governance, verification-gate, workflow-logging, remote-commit-logging, detailed-chat-output, self-improvement-loop, skill-improvement-loop) are synced copies from `ai-workflow/skills/<name>` — edit them there, not here, and re-run `bash ../ai-workflow/setup.sh --apply` to pick the change up.

## Change Log Requirement

When this map changes, include a short note in the same PR or commit message that states:

- what changed in the registry
- why the change was needed
- what tasks now invoke the new or revised skill

## Machine-Readable Index

```yaml
skillMap:
  version: 1
  sourceOfTruth: .claude/skills/SKILL_MAP.md
  mandatoryReadFirst: true
  requiredOnChange: true
  selectionOrder:
    - repo-workflow
    - scope-creep-guard
    - documentation-cohesion
    - manual-testing-guides
    - rate-limiting-tier-enforcement
    - llm-router-and-model-selection
    - system-prompt-assembly
    - canonical-clause-ordering
    - clause-state-management
    - mv3-extension-boundaries
    - sse-streaming-bridge
    - background-port-state-recovery
    - content-script-instrumentation
    - underline-preview-rendering
    - hotkey-bind-commit-ux
    - ui-design-system
    - dom-memory-management
    - typescript-safety
    - extension-popup-ux
    - target-site-compat
    - skill-map-governance
    - verification-gate
    - workflow-logging
    - remote-commit-logging
    - detailed-chat-output
    - self-improvement-loop
    - skill-improvement-loop
  registry:
    - name: repo-workflow
      path: .claude/skills/repo-workflow/SKILL.md
      type: meta-workflow
    - name: scope-creep-guard
      path: .claude/skills/scope-creep-guard/SKILL.md
      type: safety-governance
    - name: documentation-cohesion
      path: .claude/skills/documentation-cohesion/SKILL.md
      type: documentation-quality
    - name: manual-testing-guides
      path: .claude/skills/manual-testing-guides/SKILL.md
      type: documentation-quality
    - name: rate-limiting-tier-enforcement
      path: .claude/skills/rate-limiting-tier-enforcement/SKILL.md
      type: enforcement
    - name: llm-router-and-model-selection
      path: .claude/skills/llm-router-and-model-selection/SKILL.md
      type: routing
    - name: system-prompt-assembly
      path: .claude/skills/system-prompt-assembly/SKILL.md
      type: prompt-assembly
    - name: canonical-clause-ordering
      path: .claude/skills/canonical-clause-ordering/SKILL.md
      type: pipeline-ordering
    - name: clause-state-management
      path: .claude/skills/clause-state-management/SKILL.md
      type: pipeline-state
    - name: mv3-extension-boundaries
      path: .claude/skills/mv3-extension-boundaries/SKILL.md
      type: extension-architecture
    - name: sse-streaming-bridge
      path: .claude/skills/sse-streaming-bridge/SKILL.md
      type: streaming
    - name: background-port-state-recovery
      path: .claude/skills/background-port-state-recovery/SKILL.md
      type: extension-runtime
    - name: content-script-instrumentation
      path: .claude/skills/content-script-instrumentation/SKILL.md
      type: extension-instrumentation
    - name: underline-preview-rendering
      path: .claude/skills/underline-preview-rendering/SKILL.md
      type: extension-rendering
    - name: hotkey-bind-commit-ux
      path: .claude/skills/hotkey-bind-commit-ux/SKILL.md
      type: extension-interaction
    - name: ui-design-system
      path: .claude/skills/ui-design-system/SKILL.md
      type: extension-ui
    - name: dom-memory-management
      path: .claude/skills/dom-memory-management/SKILL.md
      type: extension-safety
    - name: typescript-safety
      path: .claude/skills/typescript-safety/SKILL.md
      type: type-safety
    - name: extension-popup-ux
      path: .claude/skills/extension-popup-ux/SKILL.md
      type: extension-popup
    - name: target-site-compat
      path: .claude/skills/target-site-compat/SKILL.md
      type: extension-compat
    - name: skill-map-governance
      path: .claude/skills/skill-map-governance/SKILL.md
      type: governance
    - name: verification-gate
      path: .claude/skills/verification-gate/SKILL.md
      type: validation
    - name: workflow-logging
      path: .claude/skills/workflow-logging/SKILL.md
      type: logging
    - name: remote-commit-logging
      path: .claude/skills/remote-commit-logging/SKILL.md
      type: logging-automation
    - name: detailed-chat-output
      path: .claude/skills/detailed-chat-output/SKILL.md
      type: communication
    - name: self-improvement-loop
      path: .claude/skills/self-improvement-loop/SKILL.md
      type: maintenance
    - name: skill-improvement-loop
      path: .claude/skills/skill-improvement-loop/SKILL.md
      type: evaluation
```
