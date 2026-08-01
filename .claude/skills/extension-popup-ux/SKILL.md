---
name: extension-popup-ux
description: "Use when building or modifying the WXT popup entrypoint — mode toggle, account tier display, usage indicator, upgrade CTA, or any chrome.storage.sync read/write pattern — to enforce storage-first state, loading guards, correct mode forwarding, and popup lifecycle constraints."
user-invocable: false
---

# Extension Popup UX

## When to Use

Use this skill when implementing or modifying:

- the WXT popup entrypoint (`extension/src/popup/`)
- mode toggle (efficiency / balanced / detailed) and its persistence in `chrome.storage.sync`
- account tier label, daily usage counter, and upgrade CTA
- any code that reads or writes `chrome.storage.sync` from the popup
- the popup's interaction with active-tab content script state

## When Not to Use

Do not use this skill for:

- content script overlay, underline, or popover rendering
- backend route or SSE transport implementation
- mode consumption in outbound requests (that is the responsibility of the route builder)

## Files and Surfaces

Primary files:

- `extension/src/popup/` — all popup components and entrypoint
- `extension/src/background/index.ts` — storage sync forwarding to outbound requests

Primary docs:

- `docs/EXTENSION.md` — popup process boundary and storage ownership
- `docs/ARCHITECTURE.md` — three-process isolation (content / SW / popup)

---

## Core Rules

### Rule 1: Popup Is Stateless Between Opens

The popup process is created fresh every time the user clicks the extension icon and destroyed when they close it. All persistent state must live in `chrome.storage.sync` or be fetched from the backend on mount. Never rely on in-memory module-level variables in popup components.

### Rule 2: Always Show a Loading Guard Before Rendering Storage-Backed State

Storage reads are asynchronous. Render a loading state until the read resolves — never render a stale default as if it were live.

```typescript
const [mode, setMode] = useState<Mode | null>(null); // null = still loading

useEffect(() => {
  chrome.storage.sync.get('mode', ({ mode }) => {
    setMode((mode as Mode) ?? 'balanced');
  });
}, []);

if (mode === null) return <LoadingSpinner />;
```

### Rule 3: Write Mode to Storage Before Updating Local State

Optimistic local-state updates can diverge from storage if the write fails. Write first; update local state in the write callback.

```typescript
function handleModeChange(newMode: Mode) {
  chrome.storage.sync.set({ mode: newMode }, () => {
    setMode(newMode);
  });
}
```

### Rule 4: Mode Must Be Read Fresh at Request-Build Time

The background SW must read the current mode from `chrome.storage.sync` when building each outbound SEGMENT/ENHANCE/BIND payload — not cache the mode value at extension load time.

```typescript
// In background/index.ts — CORRECT
async function buildBindPayload(sections: Section[]) {
  const { mode } = await chrome.storage.sync.get('mode');
  return { sections, mode: mode ?? 'balanced' };
}
```

### Rule 5: Popup Dimensions

Target layout: 360px wide × 480px tall (single-column, no scrolling). Hard cap: 800×600px per Chrome's popup constraint. Set explicit dimensions in the popup CSS — do not rely on auto-sizing.

### Rule 6: Tier Display and Usage Counter

Fetch tier and usage data from the backend on mount using the cached auth token. If the fetch fails, show a graceful fallback (e.g., "--" for usage count) — never throw or leave the UI in a broken state.

```typescript
useEffect(() => {
  getStoredToken().then(token => {
    if (!token) { setTier('free'); setUsage(null); return; }
    fetchUsage(token)
      .then(({ tier, enhanceCount, dailyLimit }) => {
        setTier(tier);
        setUsage({ count: enhanceCount, limit: dailyLimit });
      })
      .catch(() => { setTier('free'); setUsage(null); });
  });
}, []);
```

### Rule 7: Upgrade CTA Gating

Show the upgrade CTA only when `tier === 'free' && usage.count >= usage.limit`. Never show it for pro users, and never show it while usage data is still loading.

```typescript
const showUpgradeCTA = tier === 'free' && usage !== null && usage.count >= usage.limit;
```

### Rule 8: Popup Must Not Interfere With Active Tab State

Opening or interacting with the popup must not affect in-progress content script operations (streaming bind, accepted section state). The popup's storage reads are reads only — they must not trigger SW tab state changes.

### Rule 9: Component Architecture (shadcn Pattern)

Use Radix UI primitives styled with Tailwind CSS. Copy individual components from shadcn/ui rather than installing the full library. Keep the popup bundle lean — it loads on every icon click.

Recommended component stack:

- Toggle group for mode selection (Radix `ToggleGroup`)
- Badge for tier label
- Progress bar for usage indicator
- Button for upgrade CTA

---

## Deliverables

- Popup renders a loading guard before storage data resolves
- Mode selection writes to `chrome.storage.sync` before updating local state
- Tier and usage data fetched from backend on mount with graceful fallback
- Upgrade CTA gated on `tier === 'free' && usage >= limit`
- Popup dimensions within the 800×600 hard cap
- Mode read fresh from storage at request-build time in the background SW
- Popup interactions do not affect active tab bind or stream state
