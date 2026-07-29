---
name: ui-design-system
description: "Use when building any extension UI surface — Shadow DOM overlays, underline spans, hover popovers, ghost text, or the WXT popup — to enforce CSS isolation, design tokens, safe DOM construction, and a coherent visual language across surfaces."
user-invocable: false
---

# UI Design System

## When to Use

Use this skill when creating or modifying any visual UI surface in the extension, including:

- Shadow DOM overlay containers for underlines, popovers, or ghost text in content scripts
- CSS token definitions and visual palette for clause-type colors and visual states
- WXT popup component structure, layout, and theming
- Any code path that renders user-facing text or HTML from LLM output or user input
- Popover positioning, z-index, and viewport-edge detection

## When Not to Use

Do not use this skill for:

- backend route or SSE transport implementation
- section state machine transitions or acceptance queue logic
- hotkey event wiring or bind trigger guards
- input discovery and MutationObserver attachment

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts` — overlay and popover rendering
- `extension/src/popup/` — popup component tree
- Any injected `<style>` block or shadow root stylesheet

Primary docs:

- `docs/UX_FLOW.md` — clause colors and underline visual-state table
- `docs/EXTENSION.md` — MV3 process and UI surface ownership

---

## Content Script UI Rules (Shadow DOM)

### 1. Always Mount to `document.body` via a Single Shadow Root

Attach one shadow host per instrumented input. Mount it to `document.body`, never inside the host input's DOM tree.

```typescript
const shadowHost = document.createElement('div');
shadowHost.setAttribute('data-insta-shadow-host', '');
const shadow = shadowHost.attachShadow({ mode: 'open' });
document.body.appendChild(shadowHost);
```

### 2. CSS Reset Inside Every Shadow Root

Apply `all: initial; box-sizing: border-box` to the shadow root container before any other styles. This prevents host-page style inheritance.

```css
:host {
  all: initial;
  box-sizing: border-box;
  font-family: system-ui, sans-serif;
}
```

### 3. Never Use `rem` Units Inside Shadow DOM

The shadow root inherits the host page's `<html>` font-size, which varies per site. Use `px` for all measurements, or define CSS custom properties in `px`.

### 4. Design Tokens as CSS Custom Properties

Define the palette inside the shadow root stylesheet. Do not hardcode hex values in JavaScript.

```css
:host {
  --pc-color-action: #7c3aed;
  --pc-color-tech-stack: #0d9488;
  --pc-color-constraint: #e11d48;
  --pc-color-output-format: #2563eb;
  --pc-color-context: #d97706;
  --pc-color-edge-case: #6b7280;
  --pc-color-stale: #9ca3af;
  --pc-radius-sm: 4px;
  --pc-shadow-popover: 0 4px 12px rgba(0,0,0,0.15);
}
```

### 5. Position Overlays with `position: fixed` + `getBoundingClientRect()`

Never use `position: absolute` relative to the host page's stacking context. Use `fixed` positioning and compute coordinates from `getBoundingClientRect()` at render time.

```typescript
const rect = targetSpan.getBoundingClientRect();
popover.style.cssText = `
  position: fixed;
  top: ${rect.top - popoverHeight - 8}px;
  left: ${rect.left}px;
  z-index: 2147483647;
`;
```

### 6. Z-Index: Always Use `2147483647`

Use the maximum safe 32-bit integer for all extension UI elements that must appear above page content. Do not use arbitrary large numbers — some pages overflow them.

### 7. Never `innerHTML` — Always `textContent` or Safe DOM Construction

All text from LLM output, user input, or backend responses must be set via `textContent`, never `innerHTML`.

```typescript
// CORRECT
popoverBody.textContent = enhancementPreview;

// WRONG — XSS surface
popoverBody.innerHTML = enhancementPreview;
```

For structured markup inside the shadow DOM (your own UI chrome, not user content), use `createElement` + `appendChild` — never template string injection.

### 8. Viewport Edge Detection for Popovers

Before rendering a popover, check if it would overflow the viewport and flip it.

```typescript
const wouldOverflowBottom = rect.bottom + popoverHeight > window.innerHeight;
const top = wouldOverflowBottom
  ? rect.top - popoverHeight - 8
  : rect.bottom + 8;
```

---

## Popup Rules (WXT + React)

### 1. Component Stack

Popup: WXT entrypoint → React → Tailwind CSS → Radix UI primitives (shadcn pattern).

Copy components from shadcn rather than installing as a library dependency. This keeps bundle size minimal and every component is fully owned.

### 2. Popup Dimensions

Hard limit: 800×600px. Target: 360×480px for a compact, readable single-column layout. Do not rely on popup auto-sizing — set explicit dimensions in the popup CSS.

### 3. Storage Read Timing

Always show a loading guard while `chrome.storage.sync.get` is pending. Never render stale defaults as if they were live values.

```typescript
const [mode, setMode] = useState<Mode | null>(null); // null = loading
useEffect(() => {
  chrome.storage.sync.get('mode', ({ mode }) => setMode(mode ?? 'balanced'));
}, []);
if (mode === null) return <LoadingSpinner />;
```

### 4. Popup CSS Does Not Bleed Into Content Script

The popup bundle and the content script bundle are separate WXT entrypoints. Tailwind classes in the popup have no effect on the content script overlay — they are isolated by the build system. Do not attempt to share Tailwind utilities between these two surfaces.

---

## Goal Type → Color Mapping

Always use these tokens — do not invent new color names.

| Goal Type | CSS Token | Hex |
|---|---|---|
| `action` | `--pc-color-action` | `#7c3aed` (purple) |
| `tech_stack` | `--pc-color-tech-stack` | `#0d9488` (teal) |
| `constraint` | `--pc-color-constraint` | `#e11d48` (coral/red) |
| `output_format` | `--pc-color-output-format` | `#2563eb` (blue) |
| `context` | `--pc-color-context` | `#d97706` (amber) |
| `edge_case` | `--pc-color-edge-case` | `#6b7280` (gray) |

Visual states → Underline style:

The clause-type color is constant per section (the table above). Confidence was
removed (DECISION-1) — there is no confidence-based dashing. What varies is the
section STATE. Reuse the existing tokens; do not invent new ones.

| State | Style |
|---|---|
| ready | `border-bottom: 2px solid var(--pc-color-*)` |
| focused / review | `border-bottom: 2px solid var(--pc-color-*)` + subtle emphasis (background tint or weight bump) |
| accepted | `border-bottom: 2px solid var(--pc-color-*)`; section greyed pending commit |
| stale | `border-bottom: 2px solid var(--pc-color-stale); opacity: 0.5` |
| accepted-stale | `border-bottom: 2px solid var(--pc-color-stale); opacity: 0.5`; greyed, re-expansion required |
| streaming | clause-type color with an animated in-progress affordance during ghost-text stream |
| error | error affordance on the clause-type underline (never confidence dashing) |

---

## Deliverables

- Shadow DOM mounted correctly to `document.body` with `all: initial` CSS reset
- Design tokens defined as CSS custom properties inside shadow root
- No `rem` units in shadow DOM stylesheets
- All user/LLM content rendered via `textContent` only
- Popovers positioned with `position: fixed` + `getBoundingClientRect()` + edge detection
- Popup uses loading guard before rendering storage-backed state
