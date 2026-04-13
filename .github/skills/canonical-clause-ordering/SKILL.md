---
name: canonical-clause-ordering
description: "Use when implementing Step 4-5 clause ordering logic across segment output, bind assembly, and UI clause presentation."
user-invocable: false
---

# Canonical Clause Ordering

## When to Use

Use this skill when implementing or modifying ordering behavior for clauses and sections, including:

- `goal_type -> canonical_order` mapping in `/segment`
- server-side section ordering before `/bind`
- UI ordering of classified sections for preview and acceptance
- contract or schema validation that depends on canonical slots

## When Not to Use

Do not use this skill for:

- section lifecycle status transitions (`ready`, `accepted`, `stale`)
- rate-limiting and tier enforcement
- prompt text factory implementation details

## Files and Surfaces

Primary files:

- `backend/src/routes/segment.ts`
- `backend/src/routes/bind.ts`
- `backend/src/lib/schemas.ts`
- `shared/contracts/domain.ts`
- `extension/src/content/`

Primary docs:

- `docs/CLAUSE_PIPELINE.md`
- `docs/UX_FLOW.md`
- `docs/BACKEND_API.md`

## Deliverables

- immutable canonical slot map for all supported `goal_type` values
- deterministic server-side ordering in bind path
- deterministic UI presentation order independent of raw typing order
- validation checks that reject impossible ordering values

## Core Invariants

1. Canonical slot order is fixed and global.
2. Slot assignment is derived from `goal_type`, not user input order.
3. Bind pass must sort by canonical order server-side.
4. Client order must never be trusted for final assembly.
5. Schema layer enforces slot range boundaries.

## Implementation Procedure

1. Centralize canonical map constants in shared domain surface.
2. Ensure `/segment` emits `canonical_order` from that constant map.
3. Ensure `/bind` always sorts sections by canonical order before assembly.
4. Ensure UI rendering logic can inspect in user order but presents accepted view in canonical order.
5. Add tests for out-of-order inputs producing ordered bind behavior.
6. Add tests for invalid slot values being rejected by schemas.

## Canonical Policy

Use this strict sequence:

1. context
2. tech_stack
3. constraint
4. action
5. output_format
6. edge_case

## Verification Checklist

- all `goal_type` values map to one canonical slot
- bind route sorts server-side regardless of request order
- invalid canonical values are schema-rejected
- UI and backend references use same slot definition source
- no hidden alternate ordering map exists in route-local logic

## References

- [Canonical order map](references/CANONICAL_ORDER_MAP.md)
- `docs/CLAUSE_PIPELINE.md`
- `docs/BACKEND_API.md`
