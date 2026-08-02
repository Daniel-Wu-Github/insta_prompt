# V3 Plan: Multi-Surface + Write Mode

## Context

Decided 2026-08-01, after discovering `origin/main` already had a full "fable pass" ahead
of what any local branch knew about (Track D polish, non-destructive bind, prompt history,
a real e2e suite — see `human/06_FABLE_PASS_REPORT.md`). Separately, the user re-examined
the product's actual distribution problem: their daily coding tools are Termius (SSH),
Claude Desktop/mobile, terminal, and VS Code — **none reachable by a Chrome content
script**. A VS Code extension was explicitly rejected (high cost, narrow win — previously
scoped in `docs/agent_plans/v2/v2_uiux_megaplan.md` Track G2, never built).

The direction instead: treat the backend (`/segment`, `/enhance`, `/bind` — already
proxy-only, client-agnostic per `docs/ARCHITECTURE.md`) as the reusable asset, and build
several thin clients on top of it — the existing browser extension, a CLI, a Claude Code
skill, and an MCP server. All four surfaces support two workflows: **code mode** (existing
taxonomy/pipeline, unchanged) and **write mode** (new — day-to-day writing/email/message
enhancement, differentiated against Grammarly/Wordtune, not a clone — see Phase 1).

Reasoning worth preserving: even a perfect VS Code extension only wins back one surface,
and coding-mode's core value prop (structuring a prompt before sending it to a "dumb"
one-shot chat interface) is significantly weaker against agentic CLI tools like Claude
Code that already do clarification/planning with real repo context. The fix isn't a
heavier client for coding — it's cheap multi-surface reach plus a genuinely differentiated
write-mode, where the browser-extension form factor is actually the right tool (Gmail/
Slack/Notion have no agentic assistant already doing this job inline, unlike an IDE).

**Status (2026-08-02): Phase 0 executed and merged (PR #3, see `logging/commit_log.md` for
specifics). Phase 1 has been re-planned in depth (see below, supersedes the original
"write-mode taxonomy" draft) — still not started/implemented. Phases 2-5 not started.**

## Phase 1 — Shared infra: PAT auth + write-mode style-control architecture

Everything in Phases 2-4 depends on this landing first.

### Why write-mode is not a parallel goal-type taxonomy

The user explicitly rejected a simplified "classify into categories, accept/reject like
code-mode's clauses" design — north star is a product genuinely better than Grammarly/
Wordtune, not a clone. Competitive research (2026): Grammarly's tone-rewrite/formality/
audience "Tone Map" and Wordtune's per-sentence tone/shorten/expand + "Spices" both treat
correctness (grammar/spelling) as objective auto-fixes and tone/style as a **separate,
user-controlled axis** — never a third "classify then accept/reject" taxonomy. Nothing in
the competitive set treats **mood, figurative-language density, or voice as a generative
dial** — those exist only as passive diagnostic scores or standalone novelty tools
(metaphor generators). That gap is the differentiation target.

This replaces the original "parallel `GOAL_TYPE_VALUES`-style enum with per-category
prompt factories" idea entirely with a **two-layer model**:
- **Correctness layer** (grammar, clarity, conciseness) — objective, auto-applied in the
  same rewrite call, no per-span review UI in v1 (explicit user decision: ship this simply
  first, revisit once the style layer is proven).
- **Style layer** — a `StyleProfile` the user actively *sets* (dials and/or freeform
  instruction), not something the AI unilaterally suggests. This is the real product bet.

### Auth

Add a long-lived Personal Access Token path alongside (not replacing) Supabase JWT auth —
standard pattern (`gh`/`vercel`/`stripe` CLIs). Decided over reusing Supabase email/password
login in the CLI or a device-code OAuth flow, specifically to avoid duplicating Supabase's
refresh-token dance across three new non-browser clients.
- New table (Supabase Postgres) storing a hashed PAT + `userId` + tier reference.
- `backend/src/services/supabase.ts`: new `mintPersonalAccessToken(userId)` /
  `verifyPersonalAccessToken(token)`; `verifyBearerToken` tries a PAT-prefix check (e.g.
  `pc_` prefix) before falling back to Supabase JWT verification, so
  `backend/src/middleware/auth.ts` needs no shape change.
- Minting path: a new authenticated route (or a button in the existing extension popup's
  account section) — since the user already has a working browser session, the popup is
  the simplest place to generate one and display it once.

### `StyleProfile` data model

New file `shared/contracts/write.ts`, zod-validated per this repo's `typescript-safety`
skill conventions (no `any`, schemas at every boundary):
- Six scalar dials, each `0-100`: `formality`, `warmth`, `assertiveness`,
  `figurativeLanguage`, `humor`, `conciseness`. (Vocabulary sophistication deliberately
  folded into `formality` rather than a 7th dial — highly correlated, a 7th slider adds
  confusion without much added control.)
- Named presets as static `StyleProfile` objects: Professional Email, Warm Personal Note,
  Punchy/Marketing, Casual Chat, Academic, Balanced/Default. Extension surfaces these as
  one-click buttons; CLI as `--preset <name>`.
- No `voice`/named-author field — abstract dimensions only (explicit user decision, avoids
  the style-mimicry gray area; also more useful day-to-day — nobody wants a Slack message
  to "sound like Hemingway").

### Three new backend routes

One call each, composable identically across all 4 surfaces — this is what makes the
"freeform NL primary, dials as extension-only precision layer" decision work, since every
surface hits the same endpoints:

1. `POST /write/analyze` — `{ text }` → `{ detectedProfile: StyleProfile }`. Reads the
   *current* style of input text (à la Grammarly's Tone Map) so the extension can
   initialize sliders to reality instead of a generic default. No rewrite. Routes like
   `segment` (fast/cheap classifier tier, free-tier safe).
2. `POST /write/profile/parse` — `{ instruction: string, baseProfile?: StyleProfile }` →
   `{ profile: StyleProfile }`. Parses a freeform instruction ("make this warmer and
   punchier, add a metaphor") into concrete dial values/deltas. **The one mechanism every
   surface shares** — CLI, MCP, Claude Code skill, and the extension's freeform box all
   call this; explicit sliders in the extension just set the same `StyleProfile` object
   directly, skipping this call. Routes like `segment` too.
3. `POST /write/rewrite` — `{ text, profile: StyleProfile }` → `{ rewritten: string }`.
   **One LLM call** that both auto-fixes correctness issues (grammar/clarity/conciseness —
   no separate detection pass, no per-span suggestions in v1) and applies the style
   profile. Routes like `enhance`/`bind` (mode+tier sensitive generation path).

### Backend prompt architecture

New directory `backend/src/services/write/`, mirrors the existing `services/prompts/`
factory-pattern conventions (`system-prompt-assembly` skill — deterministic pure functions,
explicit role/task/constraints/output-shape hierarchy):
- `directives.ts` — `styleProfileToDirectives(profile): string` — the real
  prompt-engineering core: translates each dial value into natural-language style
  instructions (e.g. `figurativeLanguage: 70` → "incorporate vivid metaphors, similes, and
  sensory imagery where it reads naturally, without forcing it into every sentence").
  Deterministic and independently testable (golden-output snapshot tests).
- `analyze.ts` — prompt factory + response parser for the style-detection call.
- `profileParser.ts` — prompt factory + response parser for NL-instruction-to-profile.
- `rewrite.ts` — assembles `directives.ts` output + a fixed correctness-fix instruction
  block + the original text into the final rewrite prompt.

### Router

`backend/src/services/llm.ts` (`llm-router-and-model-selection` skill conventions): add
`write_analyze`, `write_profile_parse` (→ fast-classifier route key, same tier rules as
`segment`), and `write_rewrite` (→ mode+tier-sensitive route key, same rules as
`enhance`/`bind`). Update `docs/LLM_ROUTING.md`'s matrix to match.

### Non-destructive principle carried over

This project's core invariant (`docs/UX_FLOW.md` / Option E precedent): `/write/rewrite`
never auto-applies anywhere. Extension shows a before/after diff with an explicit "Apply"
action; CLI/MCP/skill just return the rewritten text for the caller to use — no surface
silently overwrites source text.

### Explicitly deferred, flagged as real follow-on work, not blocking

- The exact directive-compiler wording per dial (and dial *combinations* — e.g. high
  figurative-language + high formality can read as purple prose if not balanced) needs real
  iteration against a small golden set of actual Slack/email drafts before it's "done" —
  a prompt-quality problem, not fully solvable by writing code in the abstract. Recommend a
  short validation pass (5-10 real messages × 3-4 preset profiles, read the output, iterate
  `directives.ts`) before considering Phase 1 complete.
- Correctness-layer interactive review (per-span accept/reject) is intentionally out of v1
  scope per user decision — revisit once the style layer is proven.

## Phase 2 — CLI (foundational; other new surfaces build on this)

New `cli/` package (reuses `shared/contracts` types directly).
- `pc auth <token>`: stores the PAT from Phase 1 in `~/.config/promptcompiler/config.json`.
- `pc code`: reads stdin or `--text`, calls `/segment` then auto-runs `/enhance` on every
  resulting clause (skip the interactive Tab-to-accept review loop — a terminal isn't well
  suited to that UX; deliberate v1 scope-down, not full parity with the extension), prints
  the compiled/paraphrased result.
- `pc write`: reads stdin or `--text`; `--preset <name>` or `--style "<freeform
  instruction>"` (calls `/write/profile/parse` if freeform, else uses the named preset
  directly) then `/write/rewrite`; prints the rewritten text. `--analyze` alone prints the
  detected `StyleProfile` without rewriting, for iterative refinement.
- This is the piece that makes "helps my workflow immediately" literally true — usable
  from Termius, plain terminal, or VS Code's integrated terminal the moment it exists.

## Phase 3 — Claude Code skill (thin wrapper over the CLI)

`.claude/skills/promptcompiler-write/SKILL.md` (+ `-code` variant) that shells out to the
Phase 2 CLI binary. Near-zero marginal work once the CLI exists; this is likely the
surface actually used daily, since Claude Code is probably already the tool running in
Termius/terminal/VS Code.

## Phase 4 — MCP server

New `mcp-server/` package exposing `compile_code_prompt` (existing pipeline) and
`rewrite_text` (write mode: `text`, optional `style` freeform string or `preset` name)
tools. Extract the CLI's HTTP-calling/auth logic into a small shared `client/` module so
CLI and MCP server don't duplicate it. Registers with Claude Desktop's MCP config; mobile
app MCP support is unconfirmed — verify rather than assume before promising that surface.

## Phase 5 — Browser extension write mode

New surface, not just a toggle, given the depth decided in Phase 1: a style panel (preset
buttons + the 6 dials, initialized from `/write/analyze`'s detected profile, plus a
freeform instruction box that calls `/write/profile/parse` and updates the same sliders)
and a "Rewrite" action showing a before/after diff with an explicit Apply step
(non-destructive, per Phase 1). New `workflow` field in `useSettings.ts` to switch the
popup between code-mode (`ModeToggle.tsx`) and write-mode views; threaded through
background/content script for routing. No new DOM instrumentation needed for the
write-mode target text itself — content script already runs on `<all_urls>` generically;
the style panel is new popup/in-page UI, not a new instrumentation surface.

## Verification (per phase, for whoever picks this up)

- **Phase 1**: `styleProfileToDirectives` unit/snapshot tests across representative dial
  combinations; router matrix tests covering the 3 new `callType`s including free-tier
  safety for `write_analyze`/`write_profile_parse`; zod round-trip tests for `StyleProfile`
  and all 3 new request/response shapes. **The real bar**: run 5-10 actual Slack/email
  drafts through `/write/rewrite` at each preset and a few custom dial combinations;
  confirm output distinctly and correctly shifts along the intended dimensions (a
  product-quality check, not a pass/fail unit test — budget real iteration time on
  `directives.ts` here before calling Phase 1 done).
- **Phase 2**: pipe a real Slack/email draft through `pc write` from an actual Termius SSH
  session and from a local terminal; confirm real enhanced output both times.
- **Phase 3**: invoke the skill in a live Claude Code session, confirm correct CLI shell-out.
- **Phase 4**: connect to Claude Desktop, call the tool from a real conversation.
- **Phase 5**: load unpacked extension, toggle write mode, test in Gmail compose.
