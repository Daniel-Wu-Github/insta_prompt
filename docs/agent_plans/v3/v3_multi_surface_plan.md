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
enhancement, Grammarly-style; staged before a later essay/academic taxonomy, the old
DEC-3 draft in `docs/agent_plans/v2/v2_uiux_megaplan.md`).

Reasoning worth preserving: even a perfect VS Code extension only wins back one surface,
and coding-mode's core value prop (structuring a prompt before sending it to a "dumb"
one-shot chat interface) is significantly weaker against agentic CLI tools like Claude
Code that already do clarification/planning with real repo context. The fix isn't a
heavier client for coding — it's cheap multi-surface reach plus a genuinely differentiated
write-mode, where the browser-extension form factor is actually the right tool (Gmail/
Slack/Notion have no agentic assistant already doing this job inline, unlike an IDE).

**Status: Phase 0 executed 2026-08-01 (see `logging/commit_log.md` / PR history for
specifics). Phases 1-5 below are not started.**

## Phase 1 — Shared infra: PAT auth + write-mode taxonomy v0

Everything in Phases 2-4 depends on this landing first.

**Auth**: add a long-lived Personal Access Token path alongside (not replacing) Supabase
JWT auth — standard pattern (`gh`/`vercel`/`stripe` CLIs). Decided over reusing Supabase
email/password login in the CLI or a device-code OAuth flow, specifically to avoid
duplicating Supabase's refresh-token dance across three new non-browser clients.
- New table (Supabase Postgres) storing a hashed PAT + `userId` + tier reference.
- `backend/src/services/supabase.ts`: new `mintPersonalAccessToken(userId)` /
  `verifyPersonalAccessToken(token)`; `verifyBearerToken` tries a PAT-prefix check (e.g.
  `pc_` prefix) before falling back to Supabase JWT verification, so
  `backend/src/middleware/auth.ts` needs no shape change.
- Minting path: a new authenticated route (or a button in the existing extension popup's
  account section) — since the user already has a working browser session, the popup is
  the simplest place to generate one and display it once.

**Write-mode taxonomy**: ship the simple day-to-day set first (e.g. `clarity`, `tone`,
`grammar`, `conciseness` — exact naming TBD at implementation), kept as a **separate enum
from `GOAL_TYPE_VALUES`**, not overloaded onto it. `GOAL_TYPE_VALUES` is deeply hardcoded
into canonical ordering (`extension/src/content/index.ts` `CANONICAL_ORDER_BY_GOAL_TYPE`),
the color palette (`GOAL_TYPE_PALETTE`), and 6 backend prompt-factory files
(`backend/src/services/prompts/{action,constraint,context,edge_case,output_format,
tech_stack}.ts`) — a parallel taxonomy + parallel prompt factory set (same
`buildGoalPrompt`-style factory pattern from `backend/src/services/prompts/base.ts`) is
cleaner than trying to make one enum serve both.
- `shared/contracts/domain.ts`: add `Workflow = "code" | "write"` and the new write-mode
  goal-type enum.
- `backend/src/services/segment.ts`: a write-mode classification prompt variant, selected
  by `workflow`.
- `backend/src/services/prompts/`: new factory files per write-mode goal type, wired into
  a `workflow`-keyed factory map (mirrors the existing `goalPromptFactories`).
- Recommend piloting on just 1-2 categories (clarity + tone) against real Slack/email
  drafts before building out all four — cheap to validate, expensive to discover the
  taxonomy is wrong after all four are built.

## Phase 2 — CLI (foundational; other new surfaces build on this)

New `cli/` package (reuses `shared/contracts` types directly).
- `pc auth <token>`: stores the PAT from Phase 1 in `~/.config/promptcompiler/config.json`.
- `pc write` / `pc code`: reads stdin or `--text`, calls `/segment` then auto-runs
  `/enhance` on every resulting clause (skip the interactive Tab-to-accept review loop —
  a terminal isn't well suited to that UX; this is a deliberate v1 scope-down, not full
  parity with the extension), prints the compiled/paraphrased result.
- This is the piece that makes "helps my workflow immediately" literally true — usable
  from Termius, plain terminal, or VS Code's integrated terminal the moment it exists.

## Phase 3 — Claude Code skill (thin wrapper over the CLI)

`.claude/skills/promptcompiler-write/SKILL.md` (+ `-code` variant) that shells out to the
Phase 2 CLI binary. Near-zero marginal work once the CLI exists; this is likely the
surface actually used daily, since Claude Code is probably already the tool running in
Termius/terminal/VS Code.

## Phase 4 — MCP server

New `mcp-server/` package exposing `segment_and_enhance_write` / `segment_and_enhance_code`
tools. Extract the CLI's HTTP-calling/auth logic into a small shared `client/` module so
CLI and MCP server don't duplicate it. Registers with Claude Desktop's MCP config; mobile
app MCP support is unconfirmed — verify rather than assume before promising that surface.

## Phase 5 — Browser extension write-mode toggle

Additive: new `workflow` field in `useSettings.ts`, a `WorkflowToggle.tsx` next to the
existing `ModeToggle.tsx` in the popup (`extension/src/popup/App.tsx`), threaded through
background/content script to select which goal-type palette/legend/backend routing is
active. No new DOM instrumentation needed — content script already runs on `<all_urls>`
generically.

## Verification (per phase, for whoever picks this up)

- **Phase 1**: backend test for PAT verification; manual `curl` against `/segment` with a
  minted PAT and `workflow=write`.
- **Phase 2**: pipe a real Slack/email draft through `pc write` from an actual Termius SSH
  session and from a local terminal; confirm real enhanced output both times.
- **Phase 3**: invoke the skill in a live Claude Code session, confirm correct CLI shell-out.
- **Phase 4**: connect to Claude Desktop, call the tool from a real conversation.
- **Phase 5**: load unpacked extension, toggle write mode, test in Gmail compose.
