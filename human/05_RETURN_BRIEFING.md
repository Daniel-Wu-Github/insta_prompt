# Return Briefing — 2026-06-29

Orientation guide for anyone returning to the project after a break. Covers
what was done, how to verify it in a real browser, and the critical path to revenue.

---

## 1. What Was Done (10 commits, Tracks A–D partial)

| Commit | Track | What |
|---|---|---|
| `aa8c30d` | A3 | Centralized per-element cleanup registry — every DOM listener/observer has an explicit teardown path; fixes ghost-node memory leak (AUD-10) |
| `4ed5e51` | A4 | Purged all stale "confidence underline" references from 5 skills + 3 source-of-truth docs (AUD-8) |
| `1dfa22d` | A5 | Manual verification guide (`human/03_MANUAL_TESTING_GUIDE.md`) |
| `dcab60c` | B1+B2 | Created `shared/design/` — portable design token set (colors, spacing, radii, elevation) + named motion system (snap/float/pulse) with `prefers-reduced-motion` |
| `29a6db6` | B3 | Replaced all hardcoded magic values in `extension/src/content/index.ts` with tokens; reconciled 3 drifted clause accent colors (AUD-2) |
| `5e67d06` | B4 | Redundant non-color clause encoding: each clause type now has a leading glyph + underline texture variation (colorblind a11y, S-VIS-3) |
| `ea3d956` | C1+C2 | Core extraction spike: canonical clause ordering extracted to `packages/core`; `InputSource` / `RenderTarget` / `TransportClient` contracts defined. State machine still in `index.ts` — the DEC-2 extraction needs the C3 test harness first |
| `5bb554a` | D partial | Token set + named motion APPLIED to the three shadow-DOM surfaces: popover, ghost panel, toast. All get `--pc-*` CSS vars, `float-in` entrance, and the reduced-motion-aware `transition()` helper |
| `7b60cb4` | docs | Human review hub updated to reflect the above |
| `80075e0` | docs | Gap analysis updated to clearly separate "tsc/test-verified" work from "browser-gated certification" |

**Test baseline at HEAD**

- `extension vitest`: 13 fail / 20 pass. The 13 are stale tests asserting the removed confidence model — owned by Track C3, not a regression. Do not proceed if this count rises.
- `backend bun test`: 76 pass / 3 fail. The 3 are external Supabase "email rate limit exceeded" failures — not ours.
- Both `tsc`: 0 errors.

**What is NOT done yet on Track D**

- Underline-overlay mirror is not yet shadow-wrapped (the AUD-1 remainder)
- Inter Variable font not bundled (falls back to system-ui)
- Onboarding / first-run coach marks (D3)
- G-1 (axe), G-2 (±1px pixel parity), G-4 (cold-start timing), G-5 (keyboard-only sweep) — all browser-gated; cannot be verified headless

---

## 2. How to Test in Chrome

Full guide with rainy-day drills is at `human/03_MANUAL_TESTING_GUIDE.md`. Condensed version:

### Preflight
```bash
cd extension
npx tsc --noEmit --skipLibCheck   # must be 0 — stop if not
npx vitest run                    # expect 13 fail / 20 pass — stop if fail count > 13
```

### Build and load
```bash
cd extension
npm run dev    # WXT builds to .output/chrome-mv3 and watches
```
Chrome → `chrome://extensions` → Developer mode ON → **Load unpacked** → `extension/.output/chrome-mv3`. Pin the extension.

### Invariant A1 — No ghost toast after React reconciliation
On `chatgpt.com`, type to get underlines, then trigger React churn (switch models, open/close sidebar).

- **Sunny:** underlines keep tracking text; the "PromptCompiler doesn't support this input" toast does NOT fire on the main composer; no double underline layers
- **Rainy (BUG-REACT):** toast fires on the real composer, or underlines visibly stack

### Invariant A2 — Overlay clips to visible container (G-2)
Still on ChatGPT, paste a long multi-paragraph prompt so the composer scrolls.

- **Sunny:** underlines stay inside the visible composer box; nothing renders below the box border; scrolling keeps underlines aligned within ~±1px
- **Rainy (BUG-GEOM):** underline rows appear below the composer's bottom edge

To formally close G-2: screenshot at 200% zoom, confirm horizontal offset ≤1px on `action`/`tech_stack` clauses. Repeat on `claude.ai` and a plain `<textarea>` site.

### Invariant A3 — Zero retained nodes after a full cycle (G-3)
On ChatGPT: type → `Tab` to accept a clause → `Cmd+Enter` to bind → `Enter` to commit → let it reset.

DevTools → Memory → **Snapshot 1**. Trigger SPA churn (navigate away and back). **Snapshot 2** → filter by `data-insta`.

- **Sunny:** zero `data-insta-*` nodes, zero detached MutationObservers
- **Rainy (AUD-10):** a `clearObserver` / detached contenteditable retained

Reload the extension card (`ctx.onInvalidated` fires); confirm no extension listeners remain on `window` in Elements → Event Listeners.

### Target-site matrix

| Site | A1 no ghost toast | A2 no bleed | A3 clean teardown |
|---|---|---|---|
| chatgpt.com | ☐ | ☐ | ☐ |
| claude.ai | ☐ | ☐ | ☐ |
| Notion | ☐ | ☐ | ☐ |
| Linear | ☐ | ☐ | ☐ |
| GitHub issue/PR box | ☐ | ☐ | ☐ |
| Gmail compose | ☐ | ☐ | ☐ |
| Slack web | ☐ | ☐ | ☐ |

Log failures in `.claude/debugging_log.md`.

---

## 3. Critical Path to Revenue

### Immediate (unblock the current branch)

1. **Run the browser test above.** G-2 and G-3 sign-off are the only things blocking a clean "Track A done" certification.
2. **OD-1** (push strategy): recommended — squash A+B into one M1 PR, keep C as a separate PR for human review.
3. **OD-3 / OD-4** (core extraction sequence + `shared/` vs `packages/core`): needed to continue Track C. See `human/02_OPEN_DECISIONS.md`.

### Near term (in order — each unlocks the next)

**Track C3 — test harness** (biggest single unlocker)
The extension suite is currently 13 stale failures. A real harness covering port bridge, cancel, recovery, and hotkeys is the prerequisite for the state-machine extraction (the rest of Track C) and for Track D2 (CSS Custom Highlights spike). Without it, every extension change is manual-test only.

**Finish Track D** — shadow-wrap the underline overlay mirror (last AUD-1 gap), bundle Inter Variable as a web-accessible font, and build D3 onboarding / first-run coach marks. This is what makes the app *look* professional, not just be correct by construction.

**Track F1+F2 — billing + CI/CD** (the revenue gate)
- Stripe Checkout + webhooks wired to the Supabase `tier` column
- Chrome Web Store submission (the extension is currently unpacked-load only)
- CI that builds and tests on push

These are independent of C/D and can run in parallel. They need accounts and secrets (OD-12 decision). This is the only gate between the current state and the first paying user.

**Track E — prose mode + non-destructive bind**
Adds the second audience (essays/writing) and fixes the most jarring UX limitation: committing currently replaces the whole input. "Option E" non-destructive bind requires a versioned `/bind` contract change (OD-9 decision).

**Track G — standalone web app + VS Code**
Only after core is properly extracted (Track C complete). The web editor becomes the no-extension entry point and a better marketing surface.

### The honest critical path

```
Browser test (close G-2/G-3)
  → Push branches + PRs (OD-1)
  → C3 test harness
  → Stripe billing (F1) + CWS submission   ← first paying users possible here
  → Inter font + D3 onboarding
  → continued growth (E, G)
```

Billing and onboarding are the two things between the current state and revenue. Everything else (C state-machine, E prose, G platforms) is leverage for growth, not a blocker for the first dollar.

---

## 4. Decisions Needed Before Code Continues

All open decisions are in `human/02_OPEN_DECISIONS.md`. The blocking ones:

| ID | Decision | Unblocks |
|---|---|---|
| OD-1 | Push strategy (all 3 branches, or squash A+B?) | pushing anything |
| OD-3 | Approve core-extraction sequence + insist C3 harness lands first? | rest of Track C |
| OD-4 | `shared/` absorbed into `packages/core`, or kept separate? | Track C monorepo shape |
| OD-7 | CSS Custom Highlights vs overlay mirror for underlines (DEC-1)? | Track D2 |
| OD-11 | Provision a Sentry DSN? | client observability (AUD-12) |
| OD-12 | When to wire Stripe + CWS submission? | revenue |
