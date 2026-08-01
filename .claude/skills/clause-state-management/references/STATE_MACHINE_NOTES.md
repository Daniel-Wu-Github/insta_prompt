# State Machine Notes

## Recommended Status Flow

`idle -> streaming -> ready -> accepted`

Dirty-state edits can introduce:

`accepted -> stale`
`ready -> stale`

Recovery path:

`stale -> streaming -> ready -> accepted`

## Dirty-State Propagation

On upstream edit:

1. identify changed section IDs
2. walk dependency links via `depends_on`
3. mark dependent sections `stale`
4. clear stale section expansions
5. block bind until stale accepted sections are recovered

## Acceptance Rule

Acceptance is visual-only until final commit. Do not replace input text at accept time.

## Test Focus

- stale propagation across direct and transitive dependencies
- acceptance then upstream edit behavior
- bind disabled while accepted stale sections exist
- re-expansion path restores bind eligibility
