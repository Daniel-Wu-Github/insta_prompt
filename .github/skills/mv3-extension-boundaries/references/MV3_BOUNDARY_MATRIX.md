# MV3 Boundary Matrix

## Responsibility Split

| Context | Owns | Must Not Own |
|---|---|---|
| Content Script | DOM interaction, user hotkeys, local visual state | privileged backend fetch orchestration |
| Background Service Worker | backend network calls, per-tab orchestration, stream relay | direct DOM mutation |
| Popup | settings and account UI | page DOM instrumentation and long-lived orchestration |

## Storage Intent

- use session-scoped storage for tab runtime state where needed
- use sync-scoped storage for user preferences
- avoid implicit cross-context globals

## Messaging Rules

- define explicit verbs and payload shapes
- validate payloads before privileged actions
- include cancel path for in-flight operations

## Lifecycle Checks

- verify SW reconnection path after lifecycle restart
- verify active tab stream can resume or cleanly fail on restart
