# Rendering State Map

This reference maps section state to expected Step 9 visual behavior.

## State-to-Style Mapping

1. `ready`
- solid underline when confidence is high
- dashed underline when confidence is low
- preview card shows latest expansion

2. `accepted`
- reduced-opacity section treatment
- accepted style remains non-destructive (no source-text replacement)

3. `stale`
- dashed warning treatment and stale indicator
- preview content cleared or marked stale until refresh

4. `streaming`
- loading visual in preview card
- incremental preview updates as stream tokens arrive

## Safety Rule

Use text-safe APIs for preview rendering. Do not treat model output as trusted HTML.
