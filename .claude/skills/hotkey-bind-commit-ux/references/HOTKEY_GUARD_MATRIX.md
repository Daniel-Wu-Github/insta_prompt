# Hotkey Guard Matrix

This reference describes expected key behavior for Step 11.

## Keys and Intended Actions

1. `Tab`
- Accept current or oldest unaccepted section.
- Move focus to next candidate section.

2. `Shift+Tab`
- Skip or deselect current section without destructive mutation.

3. `Cmd+Enter`
- Trigger bind only if guard checks pass.
- Guard checks include stale accepted sections and minimum acceptance requirements.

4. `Enter`
- Commit final bound prompt only in `BINDING_COMPLETE` state.
- Reset workflow state after successful commit.

5. `Esc`
- Cancel pending preview/stream state.
- Clear transient overlays and reset non-committed artifacts.

## Guard Priorities

1. Never commit during `BINDING`.
2. Never bind while accepted sections are stale.
3. Never replace source text before explicit commit action.
