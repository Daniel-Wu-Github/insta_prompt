---
name: tdd-testing-structure
description: "Use when scaffolding a project, adding a feature, or planning work that needs test coverage — enforces the /tests/{unit,integration,performance} layout and writing tests before implementation."
---

# TDD + Tests Folder Structure

## When to Use

Use this skill for:

- setting up a new project or noticing `/tests` is missing at repo root
- implementing any feature, fix, or milestone that changes behavior
- writing or updating a plan/milestone doc that should specify test coverage

## When Not to Use

Do not use this skill for pure exploration, research, or planning discussions
that produce no code and no test-bearing milestone doc.

## Files and Surfaces

- `/tests/unit/` — one component in isolation
- `/tests/integration/` — two or more components wired together, or a real
  end-to-end slice
- `/tests/performance/` — latency/throughput checks
- any milestone/plan doc (`plan.md` or equivalent) describing upcoming work

## Operating Rules

- Every project has `/tests/unit`, `/tests/integration`, `/tests/performance`
  at repo root. If a project is missing this layout, create it before or
  alongside the first feature work in that session — don't wait to be asked.
- Practice TDD: write the test(s) for a unit of work before writing the
  implementation. A milestone is not done until its tests exist and pass.
- Any plan/milestone doc must specify, per milestone, which of the three test
  categories verify it — not just "tests added," name what kind and why.
  `/tests/integration` entries specifically should verify that a milestone's
  output actually wires into what came before it, not just that the new
  component works alone.
- `/tests/performance` is for the case where a milestone technically works
  but is too slow to demo or use — don't skip it just because unit/
  integration pass.
- This applies immediately, in every project — it is not staged behind a
  pilot period the way some other workflow docs are.

## Fresh-Agent-Per-Stage (bias isolation for real-stakes bugs)

For a bug found via review/audit where a wrong test or a rubber-stamped fix
would actually cost something (subtle correctness bugs, anything touching
money/auth/data integrity/security) — not as a default for routine or
trivial fixes — isolate red/fix into separate agent sessions with no shared
context, so the fix can't be graded by the same reasoning (or bias) that
produced it:

1. **Red, fresh agent, spec only.** Give it the desired behavior in plain
   language — not the buggy code's line numbers, not the audit's suggested
   fix. It writes the failing test(s) from the spec alone and confirms red
   against the current, unmodified implementation.
2. **Fix, separate fresh agent, given only the failing tests.** It should
   not see the first agent's reasoning or the originating review/audit —
   only "these tests fail, make them pass" plus enough repo context to do it
   properly (not a hack that special-cases the test's exact fixture).
3. **Independent verification, by you or the orchestrating session** — read
   the actual diff, don't just trust the fix agent's self-report, then run
   the full suite yourself.

**Why:** an agent that wrote the fix (or saw a suggested fix) grading its
own test tends to write a test that matches its own mental model of the fix,
not the actual required behavior — the same rubber-stamping risk a second
human reviewer exists to catch. Splitting the roles across agents with no
shared context forces the test to encode the spec, not the implementation.

**Cost tradeoff:** this is 2-3x the tokens/round-trips of just fixing it
directly. Don't reach for it reflexively — that turns into exactly the kind
of blanket-rule token waste this workflow has already had to rip out
elsewhere (see `ai-workflow/CLAUDE.md`'s Known Issues). Use judgment: is
this fix one where getting the test's spec wrong would actually hurt?

## Verification Checklist

- `/tests/{unit,integration,performance}` exist at repo root.
- The most recent milestone/feature has tests in the categories its own plan
  doc says it needs.
- No implementation was merged whose test was written after the fact for a
  unit of work substantial enough to warrant TDD (trivial one-liners aside).
- If a CI workflow exists, it actually runs `/tests` and blocks on failure —
  a passing local run alone isn't the gate.
