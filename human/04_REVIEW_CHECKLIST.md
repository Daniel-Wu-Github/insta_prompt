# Review Checklist — Your To-Do, In Priority Order

> **⚠️ SUPERSEDED (2026-08-02).** Written against the 2026-06-15 pass (branches
> `v2/track-*`, expecting 13 fail/18 pass). Those branches are deleted — everything they
> contained is merged to `main`, and the suite is now 47/47. Kept as-written for
> historical record; see `human/06_FABLE_PASS_REPORT.md` for current status.

## 1. Sanity-check the work (15 min)
- [ ] `git log --oneline main..v2/track-c-core` — the 7 commits read cleanly
- [ ] Skim `logging/progress_log.md` Entries 031–037 (per-step verification records)
- [ ] `cd extension && npx tsc --noEmit --skipLibCheck` → 0
- [ ] `cd backend && npx tsc --noEmit --skipLibCheck` → 0
- [ ] `cd extension && npx vitest run` → expect **13 failed / 18 passed** (the 13 are the
      known stale suite; the 18 are this pass's new + prior passing tests)
- [ ] `cd backend && bun test` → expect **76 / 3** (the 3 = known external Supabase)

## 2. Decide the immediate calls (see 02_OPEN_DECISIONS.md)
- [ ] **OD-1** push branches & PR strategy
- [ ] **OD-3 / OD-4** approve core-extraction sequence + `shared` vs `packages/core`

## 3. Live verification (needs a browser — see 03_MANUAL_TESTING_GUIDE.md)
- [ ] Load `extension/.output/chrome-mv3` unpacked; run the A1/A2/A3 invariant checks
- [ ] G-3 heap-snapshot drill: zero retained `data-insta-*` after a full cycle
- [ ] G-2 pixel parity spot-check on ChatGPT + Claude.ai
- [ ] File anything broken under `.claude/debugging_log.md`

## 4. Product-direction decisions (when ready — unblock Tracks D/E/G)
- [ ] **OD-7** DEC-1 highlight tech · **OD-8** DEC-3 prose taxonomy · **OD-9** DEC-5 bind contract

## 5. Ops decisions (need accounts/secrets)
- [ ] **OD-11** Sentry DSN? · **OD-12** Stripe + CI/CD timing?

## Known issues you should be aware of (not regressions)
- The extension test suite is **stale** (13 failing) — it asserts the removed `confidence`
  concept and the old attribute-marker model. Building a real harness is **Track C3** and a
  prerequisite for the state-machine extraction. Don't be alarmed by the red.
- The design **tokens and motion exist as data but are not yet fully applied** to every
  surface — the visible polish is Track D. The app is *more correct*, not yet *more beautiful*.
