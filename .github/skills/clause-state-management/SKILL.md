---
name: clause-state-management
description: "Use when implementing Step 4-5 section lifecycle transitions, dirty-state invalidation, acceptance behavior, and stale re-expansion rules."
user-invocable: false
---

# Clause State Management

## When to Use

Use this skill when implementing or debugging section lifecycle behavior, including:

- state transitions from typing to ready/accepted/stale
- dirty-state propagation from upstream edits
- acceptance flow and focus queue behavior
- stale-section re-expansion gating before bind
- merge/filter behavior after segmentation

## When Not to Use

Do not use this skill for:

- canonical slot mapping definitions
- model routing and provider selection
- MV3 process-boundary concerns

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `docs/CLAUSE_PIPELINE.md`
- `docs/UX_FLOW.md`

## Deliverables

- deterministic section lifecycle transitions
- dependency-aware stale invalidation behavior
- non-destructive acceptance implementation
- bind gating when accepted sections become stale

## Core Invariants

1. No DOM replacement occurs before explicit final commit.
2. Accepted is a visual state, not a text mutation state.
3. Upstream edits invalidate dependent downstream accepted sections.
4. Stale accepted sections must be re-expanded before bind.
5. State transitions are deterministic and explicit.

## Lifecycle Contract

Recommended lifecycle states:

- `idle`
- `streaming`
- `ready`
- `accepted`
- `stale`

Transition intent must be explicit in code and tests.

## Implementation Procedure

1. Define section queue and focus model for acceptance flow.
2. Implement acceptance as visual-only mutation (`acceptedIds`, style state), not input-value mutation.
3. Implement dirty-state propagation using `depends_on` graph relationships.
4. Clear expansion payload when transitioning to `stale`.
5. Block bind action while any accepted section is stale.
6. Add transition tests for edit, accept, stale, and re-expand flows.

## Dirty-State Rule

On upstream text edit:

1. detect affected section IDs
2. mark dependents stale
3. clear stale expansions
4. disable bind until stale sections recover

## Verification Checklist

- acceptance does not mutate source DOM text
- stale invalidation propagates through dependencies
- stale accepted sections block bind
- re-expansion restores bind eligibility deterministically
- transition tests cover edit and acceptance edge cases

## References

- [State machine notes](references/STATE_MACHINE_NOTES.md)
- `docs/CLAUSE_PIPELINE.md`
- `docs/UX_FLOW.md`
