# Instrumentation Flow and Guards

This reference captures the intended Step 8 instrumentation behavior.

## Attach Flow

1. Discover eligible input nodes.
2. Filter already-attached nodes by marker.
3. Attach listeners for input, keydown, focus, and blur as needed.
4. Record marker and minimal metadata.

## Re-Attach Flow

1. Observe DOM changes with `MutationObserver`.
2. Batch mutation handling to avoid repeated full scans.
3. Re-run discovery only when relevant nodes are added/removed.
4. Disconnect observer during teardown.

## Debounce and Abort Rules

1. New keystroke resets debounce timer.
2. New scheduled request aborts previous in-flight request.
3. Aborted responses must be ignored if they arrive late.
4. Request IDs are compared before applying downstream state changes.
