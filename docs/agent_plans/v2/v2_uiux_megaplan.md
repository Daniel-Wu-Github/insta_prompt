# PromptCompiler V2 — UI/UX Correction & Multi-Platform Mega-Plan

**Status:** Planning (no implementation authorized by this doc)
**Author:** Claude Opus 4.8
**Date:** 2026-06-14
**Supersedes scope of:** `docs/agent_plans/v2/v2_suggestions.md` (billing/devops/observability remain valid and are folded in as Track F)

---

## 0. How to Read This Document

This is the "one mega prompt → plan" artifact requested: it (1) restates and **sharpens the product vision into testable requirements**, (2) sets a **state-of-the-art UI/UX quality bar** with concrete, measurable standards, (3) gives an **honest audit** of where the current code falls short of that bar, (4) defines the **design system, interaction model, and two product modes** (Code + Prose), (5) lays out a **portable multi-platform architecture**, and (6) sequences all of it into **phased tracks with milestones and exit criteria**.

Nothing here is implemented yet. Each phase must still pass through the repo's skill gates (`scope-creep-guard`, `verification-gate`, etc.) at execution time. Where this plan contradicts a source-of-truth doc, the contradiction is called out explicitly and must be reconciled before that phase starts.

---

## 1. Vision — Restated and Expanded

### 1.1 The one-line vision (user's words, tightened)

> PromptCompiler is a **universal, non-destructive prompt/writing compiler** that lives wherever text is entered — browsers, IDEs, code editors, terminals, and mobile — and applies **state-of-the-art UI/UX** to turn rough input into precise, well-structured output. It serves **two audiences**: people writing prompts/code instructions, and people writing prose/essays.

### 1.2 What "the app is accessible anywhere text can be entered" actually requires

The vision implies a **portable core with thin platform adapters**. That is the single most important architectural decision in V2. Concretely, the product must run in:

| Surface | Host examples | Input primitive | Render primitive |
|---|---|---|---|
| Browser extension (have) | ChatGPT, Claude.ai, Notion, Linear, GitHub, Gmail, Slack | `textarea`, `contenteditable`, ProseMirror/Lexical | DOM overlay / CSS Custom Highlights |
| Web app (shell exists) | promptcompiler.app standalone editor | own editor (CodeMirror/ProseMirror) | native editor decorations |
| IDE / code editor | VS Code, JetBrains, Cursor, Zed | editor document model | editor decoration API (ranges) |
| Terminal (stretch) | shells, TUI prompt boxes | line buffer / readline | ANSI styling + TUI overlay |
| Mobile (stretch) | iOS/Android keyboard or share-sheet | system text field | native overlay / custom keyboard |

**Requirement R-PLAT-1:** No platform may call third-party LLM providers directly — the proxy-only invariant from `CLAUDE.md` holds on every surface. All surfaces talk to the same backend contracts (`/segment`, `/enhance`, `/bind`).

**Requirement R-PLAT-2:** The segment → classify → expand → bind → commit state machine, the clause taxonomy, the canonical ordering, the design tokens, and the dirty-state graph must live in a **platform-agnostic core package** consumed identically by every adapter. Today this logic is fused into `extension/src/content/index.ts` (~3,100 lines). De-fusing it is Phase 2.

### 1.3 Two product modes

**Requirement R-MODE-1:** A first-class **Mode dimension** orthogonal to the existing efficiency/balanced/detailed *length* modes:

- **Code mode (have):** taxonomy = `context · tech_stack · constraint · action · output_format · edge_case`. Canonical order as in `CLAUSE_PIPELINE.md`.
- **Prose / Writing mode (new):** taxonomy = `thesis · evidence · argument · audience · tone · structure · transition` (working set — to be finalized in Phase 4 with examples and a calibration corpus). Bind assembly produces flowing prose, not a structured prompt block. Output format differs: code mode emits a labeled prompt; prose mode emits clean paragraphs.

**Requirement R-MODE-2:** Mode is persisted per user (`chrome.storage.sync` today; portable settings store in the core later) and is selectable per-surface. Code mode and prose mode must never silently mix taxonomies in one bind.

### 1.4 Non-negotiables carried from V1

All Architecture Guardrails in `CLAUDE.md` remain in force: proxy-only LLM, MV3 process boundaries, no inline DOM replacement before commit, dirty-state propagation, debounce/abort, canonical binding order, tier routing invariants, auth/rate-limit/tier enforcement. **V2 raises the UX bar without weakening any of these.**

---

## 2. The State-of-the-Art Quality Bar

This section defines "professional + state of the art" as **measurable standards**, not adjectives. Research anchors: the Linear/Raycast/Vercel craft aesthetic (high-contrast monochrome canvases, Inter-variable typography, a single confident accent, restrained named-motion systems) and the inline-AI-assist interaction lineage (Grammarly-style subtle ghost suggestions that respect flow and never block). See Sources at the end.

### 2.1 Visual standard

- **S-VIS-1 Typography:** one variable typeface (Inter Variable or system-ui fallback), a fixed type scale (12/13/14/16/20/24 px), tight tracking on headings, 1.5 line-height on body. No `rem` inside any injected/shadow surface (host `<html>` font-size varies per site).
- **S-VIS-2 Color:** monochrome neutral foundation + the six locked clause-type accents (already tokenized in `ui-design-system`). Exactly one brand accent for primary actions. Full light + dark theme parity; auto-detect host theme where possible.
- **S-VIS-3 Contrast & a11y:** every text/background pair ≥ WCAG AA (4.5:1 body, 3:1 large). Underlines and focus states must not rely on color alone (shape/weight/iconography carry redundant signal — this also fixes the colorblind gap left by removing confidence dashes).
- **S-VIS-4 Spacing & geometry:** 4px spacing grid; consistent radii tokens; one elevation/shadow scale for popovers and panels.

### 2.2 Motion standard

- **S-MOT-1:** a small named motion system (≤5 curves, e.g. *snap* 120ms ease-out for state flips, *float* spring for popovers, *pulse* for streaming). Every state transition (segment appears, accept, stale, bind streaming, commit) has a defined motion token. No ad-hoc durations.
- **S-MOT-2:** respect `prefers-reduced-motion` everywhere — degrade to opacity-only or instant.
- **S-MOT-3 Performance budget:** overlay re-layout on scroll/resize/type stays ≤ 1 frame (16ms); never block input. Coalesce geometry updates with `requestAnimationFrame`.

### 2.3 Interaction standard

- **S-INT-1 Non-destructive always:** the V1 invariant is also a UX standard — the user's text is never mutated before an explicit commit, on any platform.
- **S-INT-2 Discoverability:** every gesture is teachable in-context. No hidden keybindings (the BIND-UX-1 class of bug). A persistent, unobtrusive keymap hint and a first-run coach mark.
- **S-INT-3 Keymap parity:** one canonical keymap documented once and implemented identically across platforms, with platform-correct modifiers (⌘ vs Ctrl). See §5.
- **S-INT-4 Latency feel:** instant local syntactic draft underlines (<16ms) before any network; skeleton/streaming states for all async; never a dead frame with no feedback.
- **S-INT-5 Forgiveness:** every accept is reversible (un-accept), every bind is cancelable (Esc), every commit is undoable (host undo stack or our own).

### 2.4 Quality gates (definition of "done" for the UX pass)

- **G-1** Lighthouse/axe accessibility ≥ 95 on the popup and web app; zero critical axe violations on injected overlays.
- **G-2** Pixel-parity: overlay underlines align with host text within ±1px on the target-site matrix (this is the proper home for the BUG-ALIGN deep fix).
- **G-3** Zero retained `data-insta-*` nodes/listeners after a full accept→bind→commit→reset cycle (heap-snapshot verified per `dom-memory-management`).
- **G-4** Cold-start to first underline < 200ms on a 4-CPU-throttled profile.
- **G-5** Every interactive element reachable and operable by keyboard alone, with visible focus.

---

## 3. Honest Audit — Current State vs the Bar

Grounded in this session's reading of the code and docs. "Gap" = distance to the §2 bar.

### 3.1 Strengths (keep)
- Backend pipeline (Steps 0–6) is deterministic, schema-validated, and tested. SSE contract solid.
- MV3 boundaries and the background port bridge are real and centralized.
- The clause state machine, dirty-state, acceptance queue, and canonical ordering exist and are coherent.
- A tokenized clause-color palette already exists in the `ui-design-system` skill.

### 3.2 Gaps (fix in V2)

| ID | Gap | Evidence | Bar it misses |
|---|---|---|---|
| AUD-1 | Overlay rendering is **not** Shadow-DOM isolated — styles are copied onto plain `<div>`s and can be perturbed by host CSS; the design-system skill *prescribes* shadow DOM but the code doesn't use it. | `createDraftOverlayShell` builds bare divs; `copyDraftOverlayStyles` | S-VIS-2, G-2 |
| AUD-2 | **No design-token layer in code** — colors/spacing/motion are inline magic values scattered through `index.ts`. | `DRAFT_UNDERLINE_COLOR`, opacities as string consts | S-VIS-1/2/4, S-MOT-1 |
| AUD-3 | **No motion system** — state changes are instant/abrupt; no `prefers-reduced-motion`. | no transition tokens anywhere | S-MOT-1/2 |
| AUD-4 | **Pixel-parity is approximate** — BUG-ALIGN partially mitigated this session (tab-size/text-rendering/optical-sizing copied) but true parity needs live measurement and likely a CSS Custom Highlights rewrite. | this session's BUG-ALIGN note | G-2 |
| AUD-5 | **Core logic is fused to the browser** — segment/state/bind/render all live in one content-script file; nothing is reusable by an IDE/web/terminal adapter. | `extension/src/content/index.ts` monolith | R-PLAT-2 |
| AUD-6 | **Single mode only** — no prose/writing taxonomy; classifier and bind are code-centric. | `GOAL_TYPE_VALUES`, segment prompt | R-MODE-1 |
| AUD-7 | **Discoverability weak** — keymap was hidden (BIND-UX-1); no coach marks, no onboarding. | round2 notes BIND-UX-1/2/3 | S-INT-2 |
| AUD-8 | **Stale skill/doc drift** — `ui-design-system` still documents confidence-based dashed underlines that DECISION-1 removed; manifest/docs lag actual Step-7+ status. | skill §"Confidence → Underline"; steps0-7 audit | documentation-cohesion |
| AUD-9 | **Bind is destructive by design** (BIND-DESIGN-1) — committing replaces the whole input; Option E (pass-through unaccepted) never built. | round2 BIND-DESIGN-1 | S-INT-1/5 |
| AUD-10 | **No memory-cleanup registry** — per-element listeners/observers (incl. the new clear MutationObserver and modal observer) lack centralized teardown; ghost-node risk on SPA churn. | `markInstrumented`, dom-memory-management Rule 3/6 | G-3 |
| AUD-11 | **Web app is a shell** — not the standalone editor the vision needs as the canonical "reference implementation" surface. | `web/` shell | R-PLAT-1 |
| AUD-12 | **No client observability** — silent breakage when host sites change DOM. | v2_suggestions §3 | reliability |

---

## 4. Target Design System (the artifact every surface consumes)

Deliverable of Phase 1. Lives in the portable core as data + a small CSS/JS token runtime, not as scattered constants.

### 4.1 Token categories
- **Color:** neutrals (12-step), brand accent, 6 clause accents (locked), semantic (success/warn/error/info), surface/overlay/scrim. Light + dark sets.
- **Typography:** family, scale, weight, tracking, line-height.
- **Space:** 4px grid (0–64), inset/stack/inline aliases.
- **Radius / Elevation / Border.**
- **Motion:** named curves + durations (snap/float/pulse/silk), plus reduced-motion fallbacks.
- **Z-index:** the single `2147483647` overlay ceiling + the modal-suppression rule (already added this session for BUG-ZINDEX) formalized as a token + behavior.

### 4.2 Clause taxonomy → visual mapping
- Color per type (locked). **Redundant non-color encoding** added (S-VIS-3): a leading type glyph in the popover header and an underline *texture/weight* per type so the system is legible without color.
- States: `ready · focused(review) · accepted · stale · accepted-stale · streaming · error` each get an explicit visual + motion token. (Replaces the now-removed confidence styling — update AUD-8.)

### 4.3 Surface inventory (one spec, many renderers)
Underline/highlight · hover preview popover · ghost-text bind preview · keymap hint HUD · clause legend · toast · popup/panel · onboarding coach marks · settings. Each gets a platform-agnostic spec; adapters render with native primitives.

---

## 5. Canonical Interaction Model (one keymap, all platforms)

Formalizes and extends the BIND-UX-1 fix shipped this session. Documented once; adapters map modifiers per OS.

| Intent | Browser/Web | IDE | Terminal | Notes |
|---|---|---|---|---|
| Enter review mode / cycle clause | `Tab` / `Shift+Tab` | `Tab`/`Shift+Tab` or palette | arrow/`Tab` | review ≠ accept (shipped) |
| Accept focused clause | `Enter` (review only) | `Enter`/command | `Enter` | passes through when not in review |
| Un-accept focused clause | `Shift+Enter` *(BIND-UX-2, not built)* | command | — | S-INT-5 |
| Bind | `⌘/Ctrl+Enter` | `⌘/Ctrl+Enter` | `Ctrl+B` | gated on accepted & not-stale |
| Commit bound output | `Enter` (when ready) | `Enter`/apply | `Enter` | host-aware commit |
| Cancel / exit review | `Esc` | `Esc` | `Esc` | shipped: Esc exits review |
| Toggle Code/Prose mode | popup / `⌘/Ctrl+.` | status bar | flag | R-MODE-2 |

**Requirement R-INT-1:** ship Option E non-destructive bind (AUD-9) and un-accept (BIND-UX-2) so the model is fully forgiving (S-INT-5).

---

## 6. Multi-Platform Architecture

### 6.1 Package shape (monorepo)
```
packages/
  core/            ← NEW. platform-agnostic: state machine, taxonomy, canonical
                     ordering, dirty-state graph, design tokens, surface specs,
                     transport client (talks to /segment /enhance /bind), settings.
  adapter-dom/     ← NEW. browser+web shared: overlay/highlight, popover, ghost text,
                     contenteditable/textarea/ProseMirror commit strategies.
  adapter-vscode/  ← NEW (Phase 6). decoration ranges + webview panels.
  adapter-terminal/← NEW (Phase 7, stretch).
apps/
  extension/       ← thin: instrumentation + adapter-dom + core.
  web/             ← standalone editor: own CodeMirror/ProseMirror + adapter-dom + core.
  mobile/          ← (Phase 7, stretch).
backend/           ← unchanged contracts; add prose-mode routing + Option E bind.
```

**Requirement R-ARCH-1:** `core` has zero DOM/Node/browser imports. Pure TS + the transport interface. This is what makes the vision portable; it is the gating refactor (Phase 2).

**Requirement R-ARCH-2:** Each adapter implements a `RenderTarget` interface (draw underline ranges, show popover at anchor, stream ghost text, commit text) and an `InputSource` interface (text, selection, change events, geometry). Core never knows which platform it's on.

### 6.2 Why extract before expanding
Building VS Code/terminal/mobile *before* extracting core would triple the monolith. Phase 2 (extraction) pays for every later platform. Until core exists, "multi-platform" is aspirational.

---

## 7. Phased Execution Plan

Each phase is independently shippable, gated, and reversible. Order minimizes rework. Effort is rough (engineering-days for one focused dev).

### Track A — Stabilize & verify the surface we have (foundation)
- **A1.** Live-verify this session's P0/P1 fixes on the target-site matrix (ChatGPT, Claude.ai, Notion, Linear, GitHub, Gmail, Slack). Close BUG-ALIGN to G-2 with live measurement. *(2–3d)*
- **A2.** Centralized per-element cleanup registry + teardown (AUD-10, G-3); fold in the clear-observer and modal-observer added this session. *(2d)*
- **A3.** Client observability (Sentry in content + background) so host-DOM breakage is detected, not reported (AUD-12, v2_suggestions §3). *(1–2d)*
- **A4.** Doc/skill drift fix: update `ui-design-system` (remove confidence underlines), reconcile EXTENSION/ARCHITECTURE status (AUD-8). *(0.5d)*
- **Exit:** P0/P1 verified on all target sites; no retained nodes after cycle; errors visible in dashboard.

### Track B — Design system as code (the artifact)
- **B1.** Author the token set (§4.1) as core data + a token runtime. *(2d)*
- **B2.** Motion system + `prefers-reduced-motion` (§2.2). *(1–2d)*
- **B3.** Replace inline magic values in `index.ts` with tokens (AUD-2). *(2d)*
- **B4.** Redundant non-color clause encoding (S-VIS-3). *(1d)*
- **Exit:** zero hardcoded visual constants in render paths; light/dark parity; reduced-motion honored.

### Track C — Core extraction (the gating refactor)
- **C1.** Define `core` package: state machine, taxonomy, canonical ordering, dirty-state, settings, transport client (move logic out of `index.ts`, behavior-preserving). *(4–6d)*
- **C2.** Define `RenderTarget` / `InputSource` interfaces; refactor `extension` to consume them via `adapter-dom`. *(4–5d)*
- **C3.** Add a real extension test harness (port bridge, cancel, recovery, hotkeys) — currently absent. *(3d)*
- **Exit:** extension behaves identically but `core` has zero DOM imports and is unit-tested in isolation.

### Track D — Shadow-DOM render rewrite + pixel parity
- **D1.** Move overlay/popover/ghost/HUD into a single shadow root per surface with `all:initial` reset (AUD-1, design-system skill §1–2). *(3–4d)*
- **D2.** Evaluate CSS Custom Highlights API for underlines (no span/node mutation, better parity) vs current overlay; pick and implement (AUD-4, G-2). *(3–5d)*
- **D3.** Onboarding: first-run coach marks + persistent keymap HUD (AUD-7, S-INT-2). *(2–3d)*
- **Exit:** G-2 pixel parity met; host CSS cannot perturb our UI; new users learn the keymap unprompted.

### Track E — Prose/Writing mode (second audience)
- **E1.** Finalize prose taxonomy + calibration corpus + classifier prompt (mirror SEG-1 method: definitions + examples + temp 0). *(2–3d)*
- **E2.** Prose bind assembly (flowing paragraphs, tone/audience aware) — new system-prompt factory + routing branch. *(3d)*
- **E3.** Mode toggle across popup/web/core; ensure no taxonomy mixing (R-MODE-2). *(2d)*
- **E4.** Option E non-destructive bind + un-accept (R-INT-1, AUD-9, BIND-UX-2) — backend `accepted:boolean` pass-through contract. *(3–4d)*
- **Exit:** an essay drafted in prose mode binds to clean, improved prose; selective accept never loses unaccepted text.

### Track F — Productization (from v2_suggestions, still required)
- **F1.** Billing (Stripe Checkout + webhooks + tier sync). *(3–4d)*
- **F2.** CI/CD (test+deploy backend on merge; build CWS zip; run E2E on PR). *(2–3d)*
- **F3.** Product analytics (PostHog/Mixpanel: bind completion funnel, mode mix, hover-vs-accept). *(1–2d)*
- **Exit:** users can pay; releases are automated and gated; funnel is measured.

### Track G — New platforms (the vision's reach) — sequence after C
- **G1.** Standalone web editor (CodeMirror/ProseMirror + adapter-dom + core) as the canonical reference surface (AUD-11). *(5d)*
- **G2.** VS Code extension (`adapter-vscode`, decoration ranges, webview popover). *(6–8d)*
- **G3.** *(Stretch)* Terminal adapter (TUI overlay) and mobile (share-sheet / custom keyboard), scoped after G1/G2 prove the core. *(research-first)*
- **Exit:** the same compile flow runs in ≥3 surfaces from one core.

### Suggested ordering
**A → B → C → D → E → (F in parallel from A onward) → G.**
A and B are low-risk and immediately raise quality. C is the leverage point; D and E and G all depend on it. F is independent and can run alongside.

### Milestones
- **M1 (end A+B):** the existing extension looks and feels professional; stable; observable.
- **M2 (end C):** portable core exists and is tested; extension rides on it.
- **M3 (end D):** pixel-perfect, shadow-isolated, onboarded UX on browser.
- **M4 (end E):** two audiences served (code + prose), bind is non-destructive.
- **M5 (end G1/G2):** genuinely multi-platform from one core. Vision substantially realized.

---

## 7A. Autonomous Execution Protocol

This section makes the plan executable by an autonomous agent across a long, possibly context-summarized session. Follow it literally. It defines the work loop, per-step happy/unhappy checkpoints, quality gates, commit cadence, resume behavior, and hard stop conditions.

### 7A.1 Execution model (the work loop)

Work **one step at a time**, in the Track order of §7 (A→B→C→D→E→G, F in parallel). For every step `X.n`:

1. **Load gates.** Read `.claude/skills/SKILL_MAP.md`, then invoke `Skill(scope-creep-guard)` (mandatory) + the task-domain skills for that step (see `CLAUDE.md` task→skill table).
2. **Declare scope.** Write the step's allow-list (files you may touch) and deny-list (nearby out-of-scope behavior) into the task tracker before editing.
3. **Implement** the minimum complete behavior for that step only.
4. **Run the QC gate** (§7A.3). 
5. **Checkpoint** (§7A.2): on happy path, commit; on unhappy path, recover or escalate.
6. **Log** progress to `logging/progress_log.md` and advance the task tracker.
7. Repeat. Never start `X.n+1` while `X.n`'s gate is red.

Use the task tools (TaskCreate/TaskUpdate) to mirror §7 as a live checklist — one task per step, `in_progress` while working, `completed` only after a green checkpoint.

### 7A.2 Per-step checkpoints (happy & unhappy)

Every step defines both paths explicitly. Generic template (each track step in §7 inherits this; track-specific "Exit:" lines are the happy criteria):

**HAPPY checkpoint — all true → commit and continue:**
- Step's stated Exit criteria met.
- QC gate (§7A.3) fully green.
- Changed-file audit: every changed file is in the step's allow-list (scope-creep-guard).
- No new `any`, no new Zod-`.strict()` wire desync, no new uncleaned listener/observer (dom-memory-management).
- Behavior of adjacent steps unchanged (no regression in existing tests).

**UNHAPPY checkpoint — any failure → do NOT commit; branch by failure class:**
- **Compile/test red:** fix forward up to **2 attempts**. If still red, `git restore` the step's files to the last green commit, write a Debug Entry in `.claude/debugging_log.md`, and either retry with a corrected approach or escalate (§7A.5).
- **Scope creep detected:** quarantine the out-of-scope change (revert just those hunks), keep the in-scope work, re-run the gate.
- **Ambiguity / decision needed (DEC-* in §8):** STOP and escalate — do not guess on taxonomy, contract shape, or destructive behavior.
- **External flakiness (Supabase rate limit, network):** mark the affected integration test as a known-external skip for the run, note it in the progress log, and continue; never let an external-service failure block an unrelated step. (The 3 Supabase email-rate-limit failures are pre-existing and external — do not chase them.)
- **Repeated failure (same step fails 3×):** hard stop, escalate with the full failure trace.

### 7A.3 Quality-control gate (run every step before checkpoint)

Ordered, fail-fast:
1. `cd extension && npx tsc --noEmit --skipLibCheck` → must exit 0. (Also auto-run by the PostToolUse hook on `.ts` edits.)
2. `cd backend && npx tsc --noEmit --skipLibCheck` → must exit 0.
3. Backend tests (`npm test`/`bun test`) → all pass **except** the known external Supabase integration failures (auth/ratelimit "email rate limit exceeded"). Count must not regress beyond those.
4. For any step that adds an extension behavior: once the Track C test harness exists, run it; until then, follow the manual-testing-guide for that step on the target-site matrix and record the result.
5. Track-D+ visual steps additionally check the relevant §2.4 quality gate (G-1 axe, G-2 ±1px parity, G-3 zero retained nodes, G-4 cold-start, G-5 keyboard-only).
6. `verification-gate` skill checklist: changed files mapped to objective, docs/contracts consistent, residual risk noted.

A step is **green** only when every applicable gate above passes.

### 7A.4 Commit & branch cadence

- **One commit per green step.** Message: `track <X.n>: <what> (<plan ref>)`. Body lists the Exit criteria met. End with the repo's required `Co-Authored-By` trailer.
- The `.githooks/pre-push` hook auto-appends to `logging/commit_log.md` per branch — ensure `git config core.hooksPath .githooks` is set in the clone before the first push, or logging silently no-ops.
- **Branch strategy for autonomous runs:** create one branch per Track (`v2/track-a-stabilize`, `v2/track-b-tokens`, …). Open a PR per track at its M-milestone. Do **not** force-push. The high-risk Track C (core extraction, DEC-2) must land behind its test harness (C3) and its own PR with a human review request.
- Never commit secrets; never commit `.env`. The `.claude/*.tmp` and notification logs are transient hook state — leave them out of feature commits.

### 7A.5 Escalation / hard-stop conditions (ask the human)

Halt the autonomous loop and surface a concise decision request when:
1. Any **DEC-*** in §8 must be resolved to proceed (highlight tech, core blast radius, prose taxonomy, mobile model, bind contract version).
2. A change would alter a **public contract** (`/segment` `/enhance` `/bind` payloads — esp. Option E in E4) or a **CLAUDE.md guardrail**.
3. A step requires a **destructive or irreversible** action (data migration, deleting tracked files, history rewrite, Chrome Web Store submission, production deploy).
4. The same step **fails 3×**, or a refactor's blast radius exceeds its declared allow-list and can't be contained.
5. **Spend/scope ceiling** for the run is reached (set by the human at launch, e.g. "stop after Track A+B").

### 7A.6 Resume-after-summarization behavior

Context may be summarized mid-run. To resume deterministically, treat these as the source of truth (in order): (1) the **task tracker** state, (2) `logging/progress_log.md` last entry, (3) `git log` since the run started, (4) this plan's §7 Exit criteria. Re-derive "current step = first §7 step whose Exit criteria are not yet met and whose predecessors are green." Never restart a step already marked green in git/log.

### 7A.7 Reference repos to vendor at execution time (not now)

Clone only when the consuming track starts, pinned to a commit, vendored read-only (do not add as runtime deps):
- **Track B/D — design system:** `github.com/bitjaru/styleseed` (MIT; motion seeds + brand-skin tokens as a *reference* for §4, not a dependency); shadcn/ui components (copy-in pattern per `ui-design-system`, not an npm install).
- **Track G2 — VS Code:** `github.com/microsoft/vscode-extension-samples` (decoration API reference).
- No repos are required for Tracks A, C, E, F. None are needed for *planning*; do not pre-clone.

---

## 8. Risks & Open Decisions

- **DEC-1 Highlight tech:** CSS Custom Highlights (cleanest, best parity, newer API) vs overlay mirror (current, universal). Decide in D2; affects parity ceiling.
- **DEC-2 Core extraction blast radius:** `index.ts` is ~3,100 lines and fused. Extraction (C) is the highest-risk refactor — must be behavior-preserving with the test harness (C3) landing *first or alongside*.
- **DEC-3 Prose taxonomy:** the 7-type working set needs validation against a real essay corpus; wrong taxonomy = poor classification. Treat E1 as a research spike before committing.
- **DEC-4 Mobile reality:** OS keyboards heavily constrain overlays; mobile may become a share-sheet "compile this text" flow rather than inline. Scope honestly in G3.
- **DEC-5 Bind contract change (Option E):** alters the `/bind` payload shape — coordinate backend + every adapter; version the contract.
- **DEC-6 Resourcing:** Tracks total well beyond a single sprint. This is a roadmap, not a sprint plan; pick the cut line (recommended: A+B+C+F1/F2 as the next milestone).

---

## 9. Immediate Next Actions (if approved)

1. **A1** live-verification of this session's six fixes on the target-site matrix (turns the partial BUG-ALIGN into a measured G-2 result).
2. **A4 + AUD-8** doc/skill drift cleanup (cheap, removes contradictions before they propagate into the design system).
3. **B1** token set authored — the first concrete piece every later track consumes.
4. Spike **C1** boundaries (what exactly moves into `core`) as a design note before touching code.

---

## Sources (research anchors for the §2 bar)
- [Linear design trend — LogRocket](https://blog.logrocket.com/ux-design/linear-design/)
- [Four design principles behind Stripe, Linear, Vercel — Pixeldarts](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel)
- [StyleSeed — named motion system & brand skins (Linear/Raycast/Vercel/Notion)](https://github.com/bitjaru/styleseed)
- [The UX hack that helps AI capture user intent — Raw.Studio](https://raw.studio/blog/the-ux-hack-that-helps-ai-capture-user-intent/)
- [Grammarly generative AI writing surface](https://www.grammarly.com/ai/generative-ai)
</content>
</invoke>
