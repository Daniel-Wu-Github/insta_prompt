# Prompt Assembly Checklist

Use this checklist when implementing or reviewing Step 3 prompt assembly.

## Goal-Type Coverage

- `context`
- `tech_stack`
- `constraint`
- `action`
- `output_format`
- `edge_case`

Each must have a dedicated tested prompt-factory path.

## Mode Coverage

- `efficiency`: concise and tight
- `balanced`: structured and moderate detail
- `detailed`: comprehensive with explicit structure

## Sibling Context Rules

- Include sibling block only when there are siblings.
- Keep sibling formatting deterministic.
- Avoid unbounded context injection.

## Bind Prompt Rules

- Enforce canonical order in the instruction text.
- Request coherence and deduplication.
- Keep output request explicit and singular.

## Test Expectations

- deterministic snapshots for prompt factories
- goal-type and mode matrix coverage
- sibling presence and absence cases
- bind prompt includes ordering directives
