# PromptCompiler e2e (fixture tier)

Playwright suite that automates the browser-gated checks from
`docs/testing-notes/v2-track-a-manual-verification.md` against **local fixture
pages** replicating each target site's editor DOM (ChatGPT, Claude, Notion,
Linear, GitHub, Gmail, Slack, plain textarea).

## Run

```bash
cd e2e
npm install          # once
npm test             # builds the extension against the mock backend, runs under xvfb
```

## Architecture

- `fixtures/extension.ts` — persistent-context Chromium with the unpacked
  extension (`extension/.output/chrome-mv3`), auth seeded via the service
  worker (no JWT → no rendering, by design).
- `mock-backend.mjs` — hermetic stand-in for the backend (port 4174). The
  pretest build bakes `VITE_API_BASE_URL=http://127.0.0.1:4174` in; the live
  deployment is never in the loop (it made the suite flaky and would burn
  real quota).
- `server.mjs` — static fixture server (port 4173).
- Specs map to the manual guide's gates:
  - `regression.spec.ts` — A1 idempotency + SPA churn, 8-site matrix
  - `parity.spec.ts` — A2/G-2 rect-diff parity (±1px) + BUG-GEOM clipping +
    D2 highlight registration
  - `retention.spec.ts` — A3/G-3 DOM-count proxy
  - `coldstart.spec.ts` — G-4 steady-state latency @4x CPU throttle
  - `keyboard.spec.ts` — G-5 keyboard-only full flow
  - `a11y.spec.ts` — G-1 axe gate (critical/serious = 0)

## Live tier (not CI)

Authenticated real-site smoke tests belong in `tests-live/` (tag `@live`),
run manually with a captured `storageState`. Deliberately not written yet:
they need a human login session and must never gate merges.
