# Handoff — v2/track-d-polish (In Progress)

**Date:** 2026-07-02
**Branch:** `v2/track-d-polish`
**Author:** Claude Sonnet 4.6
**Status:** Tracks A–D partially complete. 10 commits landed since the Phase 1 ChatGPT bug session. Paused for macOS dev environment migration — resume exactly here.

> **Migration note:** Development environment moving from WSL (MSI) to macOS. No code changes. Branch, state, and test baseline below are current.

---

## What Was Done Since Phase 1 (10 commits, Tracks A–D partial)

| Commit | Track | What |
|---|---|---|
| `aa8c30d` | A3 | Centralized per-element cleanup registry — every DOM listener/observer has explicit teardown; fixes ghost-node memory leak (AUD-10) |
| `4ed5e51` | A4 | Purged all stale "confidence underline" references from 5 skills + 3 source-of-truth docs (AUD-8) |
| `1dfa22d` | A5 | Manual verification guide (`human/03_MANUAL_TESTING_GUIDE.md`) |
| `dcab60c` | B1+B2 | Created `shared/design/` — portable design token set (colors, spacing, radii, elevation) + named motion system (snap/float/pulse) with `prefers-reduced-motion` |
| `29a6db6` | B3 | Replaced all hardcoded magic values in `extension/src/content/index.ts` with tokens; reconciled 3 drifted clause accent colors (AUD-2) |
| `5e67d06` | B4 | Redundant non-color clause encoding: leading glyph + underline texture variation per clause type (colorblind a11y, S-VIS-3) |
| `ea3d956` | C1+C2 | Core extraction spike: canonical clause ordering extracted to `packages/core`; `InputSource`/`RenderTarget`/`TransportClient` contracts defined. State machine still in `index.ts` pending C3 test harness |
| `5bb554a` | D partial | Tokens + named motion applied to popover, ghost panel, and toast shadow-DOM surfaces |
| `7b60cb4` | docs | Human review hub updated |
| `80075e0` | docs | Gap analysis updated — separates tsc/test-verified work from browser-gated certification |

**Test baseline at HEAD (DO NOT regress these)**
- `extension vitest`: 13 fail / 20 pass — the 13 are stale confidence-model tests, owned by Track C3, not regressions
- `backend bun test`: 76 pass / 3 fail — the 3 are external Supabase email-rate-limit failures, not ours
- Both `tsc`: 0 errors

---

## What Is NOT Done Yet — Resume Here

### Track D remainder (highest priority)
- Underline-overlay mirror not yet shadow-wrapped (the AUD-1 remainder)
- Inter Variable font not bundled — falls back to system-ui
- Onboarding / first-run coach marks (D3)

### Browser-gated gates (cannot verify headless — do in Chrome)
- G-1 axe accessibility scan
- G-2 ±1px pixel parity check
- G-4 cold-start timing
- G-5 keyboard-only sweep
Full guide: `human/03_MANUAL_TESTING_GUIDE.md`. Return briefing: `human/05_RETURN_BRIEFING.md`.

### Track C3 (after Track D)
- Test harness for core extraction — unlocks fixing the 13 stale vitest failures

### ChatGPT overlay bugs from Phase 1 (deferred until Track D stable)
See below for the full bug list. Fix order: BUG-REACT → BUG-GEOM → BUG-ZINDEX → BUG-ALIGN.

---

## ChatGPT Overlay Failures (Phase 1 — still open)

**Original handoff date:** 2026-06-09

---

## What Phase 1 Actually Fixed (Confirmed)

| Item | Bug | Status |
|---|---|---|
| BIND-BUG-1 | Escape in COMPLETE state | ✅ Working |
| DECISION-1 | Confidence removal from LLM, schemas, UI | ✅ Working |
| CLEAR-BUG-1 (partial) | `"search"` event on `input[type="search"]` | ✅ Correct for native search inputs |
| Item 5 (partial) | `clientWidth`/`clientHeight` vs `rect.width`/`rect.height` | ⚠️ Partial — see BUG-GEOM below |
| CHATGPT-CRIT-1 (attempted) | MutationObserver guard removal | ⚠️ Fix is correct but may be masked — see BUG-REACT |
| Item 6 | Unsupported input toast | ❌ Fires falsely on ChatGPT — see BUG-TOAST |

---

## Unresolved Bugs

### BUG-REACT — React attribute stripping breaks idempotency and causes toast false-positives

**Severity:** Critical (root cause of multiple downstream symptoms)  
**Observed symptoms:**
- `document.querySelector('[data-insta-instrumented]')` returns `null` on the active ChatGPT input even while underlines are visible
- "PromptCompiler doesn't support this input" toast fires on ChatGPT's own main input
- Potential duplicate event listeners accumulating across React re-renders

**Root cause:**  
ChatGPT is a React SPA. React's reconciler strips unknown HTML attributes from DOM elements during reconciliation — this includes `data-insta-instrumented="true"`. Our `markInstrumented` idempotency check is `element.getAttribute(INSTRUMENTED_ATTRIBUTE) === INSTRUMENTED_VALUE`. When React reconciles the input component:

1. Our attribute is removed by React
2. `isInstrumented(element)` returns `false`
3. The `focusin` capture listener fires → `isInstrumented` returns false → shows toast
4. If `markInstrumented` is called again, it adds a **second** set of event listeners (`input`, `mousemove`, `mouseleave`, `blur`, `keydown`, and the clear `MutationObserver`) to the same DOM element

The event listeners from the FIRST instrumentation survive the React re-render (they were added via `addEventListener`, not via HTML attributes), so the overlay continues to work. But the attribute is gone, so all attribute-based checks fail.

**Evidence:**
- Screenshot: underlines ARE visible (event listeners working) but `querySelector('[data-insta-instrumented]')` returns empty
- Toast fires on the main ChatGPT contenteditable
- Both confirm the attribute was stripped mid-session

**Fix required:**  
Replace the attribute-based instrumentation marker with a `WeakSet<Element>` stored in module scope:

```typescript
const _instrumentedElements = new WeakSet<Element>();

const isInstrumented = (element: Element): boolean => {
    return _instrumentedElements.has(element);
};

const markInstrumented = (element: HTMLTextAreaElement | HTMLElement): void => {
    if (_instrumentedElements.has(element)) {
        return;
    }
    _instrumentedElements.add(element);
    element.setAttribute(INSTRUMENTED_ATTRIBUTE, INSTRUMENTED_VALUE); // keep for DevTools visibility
    // ... rest of markInstrumented
};
```

`WeakSet` is not affected by React reconciliation. The attribute write is kept for DevTools discoverability but is no longer the source of truth for idempotency. The `_instrumentedElements` set is not affected by attribute removal.

**Files to change:** `extension/src/content/index.ts` — `isInstrumented` (~line 2769), `markInstrumented` (~line 2773)

**Skill gap:** `content-script-instrumentation` SKILL.md says "Idempotent listener attachment" but does not address SPA frameworks that strip non-framework attributes. Add a rule: "In React/SPA environments, use a WeakSet or WeakMap keyed on the DOM element itself as the idempotency marker, not an attribute. Attributes are only safe for static or non-React DOM."

---

### BUG-GEOM — Overlay extends below the ChatGPT input box

**Severity:** Critical  
**Observed symptom (screenshot 2):** Purple underlines appear two rows below the visible bottom edge of the ChatGPT input box. The text area ends at a visible border, but the overlay continues below it with two extra underline-height rows.

**Root cause:**  
The ChatGPT input uses a two-layer structure:
```
<div class="container" style="max-height: 200px; overflow-y: auto">
  <div contenteditable="true">   ← the element we instrument
    long text...
  </div>
</div>
```

The contenteditable itself has no `max-height` — it grows as tall as needed. The container provides the clip. Our `updateDraftOverlayGeometry` measures:
- `sourceElement.clientHeight` — the contenteditable's OWN rendered height (e.g., 400px of text)
- This is the FULL scrollable height, not the visible clip height (200px)
- So the host overlay is 400px tall, extending 200px below the visible input

The PREVIOUS fix (`clientWidth`/`clientHeight` instead of `rect.width`/`rect.height`) does not help here. `clientHeight` for the contenteditable is its intrinsic content height, the same problem as `rect.height`. The difference (border size) is irrelevant; the container-clip difference is what matters.

**What `getBoundingClientRect().height` returns for this structure:**  
Contrary to what the handoff spec assumed, `getBoundingClientRect()` does NOT clip to parent overflow. It returns the element's own layout box, which is the FULL 400px, same as `clientHeight`. Neither property gives the visible clip height.

**Fix required:**  
Walk up the ancestor chain from the source element and find the NEAREST clip ancestor (first ancestor with `overflow: hidden`, `overflow-y: hidden`, `overflow: scroll`, or `overflow-y: auto` that is also SMALLER than the source element). Intersect the source element's rect with that ancestor's rect to compute the true visible geometry.

```typescript
function getClippedVisibleRect(element: HTMLElement): DOMRect {
    const rect = element.getBoundingClientRect();
    let clipped = { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
    
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
        const style = window.getComputedStyle(ancestor);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const isClipY = overflowY === 'hidden' || overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'clip';
        const isClipX = overflowX === 'hidden' || overflowX === 'scroll' || overflowX === 'auto' || overflowX === 'clip';
        
        if (isClipY || isClipX) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (isClipY) {
                clipped.top = Math.max(clipped.top, ancestorRect.top);
                clipped.bottom = Math.min(clipped.bottom, ancestorRect.bottom);
            }
            if (isClipX) {
                clipped.left = Math.max(clipped.left, ancestorRect.left);
                clipped.right = Math.min(clipped.right, ancestorRect.right);
            }
        }
        ancestor = ancestor.parentElement;
    }
    
    return new DOMRect(
        clipped.left,
        clipped.top,
        Math.max(0, clipped.right - clipped.left),
        Math.max(0, clipped.bottom - clipped.top)
    );
}
```

Then in `updateDraftOverlayGeometry`:
```typescript
const visibleRect = getClippedVisibleRect(sourceElement);
hostElement.style.left = `${visibleRect.left}px`;
hostElement.style.top = `${visibleRect.top}px`;
hostElement.style.width = `${visibleRect.width}px`;
hostElement.style.height = `${visibleRect.height}px`;
```

The scroll-sync transform (`translate(-scrollLeft, -scrollTop)`) then clips correctly within the host's `overflow: hidden` boundary.

**Files to change:** `extension/src/content/index.ts` — `updateDraftOverlayGeometry` (~line 1160), add `getClippedVisibleRect` helper

**Skill gap:** `underline-preview-rendering` SKILL.md says "set overlay `width`/`height` from `getBoundingClientRect()`" without noting that this only works for self-clipping elements. Add: "For contenteditables that grow without CSS max-height, getBoundingClientRect and clientHeight both return the intrinsic (unclipped) size. Walk ancestors to find the clip boundary."

---

### BUG-ZINDEX — Overlay renders above ChatGPT's own modals

**Severity:** High  
**Observed symptom (screenshot 1):** When the ChatGPT Settings dialog is open, orange underlines from our overlay are visible THROUGH the modal panel. The underlines render above the modal because our overlay z-index = `2147483647` (INT32_MAX).

**Root cause:**  
`DRAFT_OVERLAY_Z_INDEX = "2147483647"` is the maximum possible CSS z-index. ChatGPT's own modal dialogs use a lower value, so they render underneath our overlay.

**Why we use max z-index:**  
To ensure underlines appear above the contenteditable's own text and surrounding UI. But this comes at the cost of appearing above everything else on the page.

**This is a fundamental tension** with no perfect solution:
- Too low → underlines hidden by other UI elements
- Too high (current) → underlines bleed above modals, tooltips, date pickers, dropdowns

**Fix approaches:**

**Option A (Quick fix — observer-based hide):** Listen for large z-index elements appearing above the overlay. On `MutationObserver`, if a newly added element has a computed z-index > some threshold (e.g., > 1000) and it overlaps our overlay, temporarily hide the overlay host. Show it again when the element is removed. Risk: flaky heuristic.

**Option B (Dialog/aria detection):** Listen for `[role="dialog"]`, `[role="alertdialog"]`, or `aria-modal="true"` elements being added to the DOM. When one appears, set overlay opacity to 0. When removed, restore. More reliable than z-index heuristic.

```typescript
const dialogObserver = new MutationObserver(() => {
    const hasModal = !!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
    if (renderedDraftOverlayState?.draftOverlayElement) {
        renderedDraftOverlayState.draftOverlayElement.style.visibility = hasModal ? 'hidden' : '';
    }
});
dialogObserver.observe(document.body, { childList: true, subtree: true });
```

**Option C (Lower z-index):** Use a z-index like 2147483000 (still very high, below some modal stacking contexts). Not reliable — ChatGPT or other sites may use arbitrary large values.

**Recommended: Option B.** The aria-modal approach is semantic and won't hide the overlay for minor UI elements (dropdowns, tooltips). Only full modal dialogs should suppress underlines.

**Files to change:** `extension/src/content/index.ts` — add observer near the init block (after `observeForInputDiscovery()`)

---

### BUG-TOAST — Unsupported-input toast fires on ChatGPT's own instrumented input

**Severity:** Medium (UX noise)  
**Observed symptom:** "PromptCompiler doesn't support this input" appears when focusing ChatGPT's main input, which IS supposed to be supported.

**Root cause:** Consequence of BUG-REACT. React strips `data-insta-instrumented`, so `isInstrumented()` returns false. The `focusin` capture listener sees an uninstrumented contenteditable and shows the toast. The `WeakSet` fix in BUG-REACT fixes this automatically — once `isInstrumented` uses the `WeakSet` instead of the attribute, the toast check will correctly identify ChatGPT's input as instrumented.

**No separate fix needed** beyond BUG-REACT.

---

### BUG-CHATGPT-CLEAR — Underlines persist after ChatGPT sends a message

**Severity:** Critical  
**Status:** Two fix attempts were made. Current state is uncertain because BUG-REACT may interfere.

**Attempt 1 (Phase 1):** Added MutationObserver on contenteditable to detect programmatic clears. Guard was `extractInputText(element).length === 0`. Failed because ChatGPT resets to `<p><br></p>` (produces `"\n"`, length 1 not 0).

**Attempt 2 (post-Phase-1 fix):** Removed the guard. MutationObserver now always calls `scheduleDebouncedExtraction` on any mutation.

**Why this still may not work:**  
After ChatGPT submits, React reconciles the input component. This triggers many `childList` and `characterData` mutations — our MutationObserver fires, calls `scheduleDebouncedExtraction`. BUT if React also replaces the entire contenteditable element (common in React SPAs), the OLD element (with our observer attached) is removed and a NEW element is added. Our observer on the old element stops firing. The new element needs to be re-instrumented, but BUG-REACT means the attribute is missing and idempotency is broken.

**The fix is only reliable after BUG-REACT is resolved.** Once `_instrumentedElements` (WeakSet) is the idempotency guard:
1. Element replaced: new element is NOT in WeakSet → re-instrumented correctly
2. Same element cleared: MutationObserver fires (no guard) → `scheduleDebouncedExtraction` → debounce timer → `renderDraftSegments("", [], false)` → `clearDraftRendering`

**Verification steps (after BUG-REACT fix is deployed):**
1. Open DevTools → Network → filter by `segment`
2. Type a prompt in ChatGPT, wait for underlines
3. Check: `$0 = document.querySelector('[contenteditable]'); $0.__instrumentedRef` — won't exist, use `_instrumentedElements.has($0)` if exposed
4. Press Enter to send
5. Within 500ms (debounce + processing), underlines should disappear
6. If not: check console for `[content] skipping SEGMENT dispatch` messages; check if `activeInputState` state reference is stale

---

### BUG-ALIGN — Text alignment / font metric mismatch

**Severity:** Medium (cosmetic)  
**Observed symptom (screenshot 2):** Underlines do not match the exact text wrapping of ChatGPT's editor. Line breaks in the overlay occur at different positions than in the real text.

**Root cause hypothesis:** `copyDraftOverlayStyles` copies computed styles including `font`, `font-family`, `font-size`, `line-height`, etc. But ChatGPT's Lexical editor may apply additional CSS that affects text layout:
- Custom `letter-spacing` or `word-spacing` per paragraph
- CSS custom properties (`var(--...)`) not resolved in `getComputedStyle` strings
- The `font` shorthand in `getComputedStyle` may miss sub-properties like `font-optical-sizing`, `font-variant-*`
- The contenteditable may use `white-space: pre-wrap` or `word-break: break-word` set at a child element level, not the root

**Diagnostic steps:**
1. On ChatGPT with underlines visible, run:
   ```javascript
   const el = document.querySelector('[data-insta-instrumented]');
   const overlay = document.querySelector('[data-insta-draft-overlay]');
   const elStyle = window.getComputedStyle(el);
   const overlayStyle = window.getComputedStyle(overlay);
   ['font', 'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak', 'overflowWrap'].forEach(p => {
       if (elStyle[p] !== overlayStyle[p]) console.log(`MISMATCH ${p}:`, elStyle[p], '≠', overlayStyle[p]);
   });
   ```
2. If mismatches appear, the fix is in `copyDraftOverlayStyles` (~line 941) to explicitly set each mismatched property.

---

## Summary of Failure Modes

| Bug | Root Cause | Blocking Other Bugs | Fix Complexity |
|---|---|---|---|
| BUG-REACT | React reconciler strips HTML attributes | Yes — blocks CHATGPT-CRIT-1, TOAST, GEOM verification | Low (WeakSet swap, 10 lines) |
| BUG-GEOM | `clientHeight` measures intrinsic height, not clip height | No | Medium (ancestor walk function, ~30 lines) |
| BUG-ZINDEX | INT32_MAX z-index renders above all site UI | No | Low-Medium (aria-modal observer, ~20 lines) |
| BUG-TOAST | Consequence of BUG-REACT | No (resolved by BUG-REACT fix) | None extra |
| BUG-CHATGPT-CLEAR | BUG-REACT + element replacement | Unclear until BUG-REACT fixed | None extra (current fix is correct after BUG-REACT) |
| BUG-ALIGN | Font metric copy incomplete | No | Unknown (needs devtools comparison) |

**Fix order:** BUG-REACT first (unblocks verification of everything else), then BUG-GEOM, then BUG-ZINDEX, then BUG-ALIGN.

---

## What Was NOT Attempted (Phase 2 / Phase 3)

These remain fully deferred — do not touch until ChatGPT overlay is stable:

- **BIND-DESIGN-1 Option E** — pass all clauses with `accepted: boolean`, backend pass-through for unaccepted. Requires backend API contract change.
- **BIND-UX-1** — Tab = cycle only, Enter = accept (no code changes yet)
- **BIND-UX-2** — Un-accept path
- **SEG-1** — Classifier temperature=0 and prompt definition improvements
- **BIND-UX-4** — Canonical sort verification at backend

---

## Relevant Code Locations

| Issue | File | Approx Lines |
|---|---|---|
| `isInstrumented` / idempotency | `extension/src/content/index.ts` | 2769–2773 |
| `markInstrumented` | `extension/src/content/index.ts` | 2773–2800 |
| `updateDraftOverlayGeometry` | `extension/src/content/index.ts` | 1160–1175 |
| `copyDraftOverlayStyles` | `extension/src/content/index.ts` | 941–975 |
| `DRAFT_OVERLAY_Z_INDEX` constant | `extension/src/content/index.ts` | 19 |
| `createDraftOverlayShell` (overflow:hidden) | `extension/src/content/index.ts` | 1025–1067 |
| MutationObserver for clear | `extension/src/content/index.ts` | 2785–2793 |
| `focusin` toast listener | `extension/src/content/index.ts` | 3027–3046 |
| `observeForInputDiscovery` | `extension/src/content/index.ts` | 2830–2884 |
| `getOverlayContainer` | `extension/src/content/index.ts` | 930–932 |

---

## Skills to Update After Fixes

- **`content-script-instrumentation`**: Add rule: "In React/SPA environments, use WeakSet/WeakMap keyed on the DOM element itself for idempotency. Attributes are stripped by React reconciliation."
- **`underline-preview-rendering`**: Add rule: "For contenteditables that grow without CSS max-height, getBoundingClientRect and clientHeight both return the intrinsic (unclipped) size. Walk ancestors to find the clip boundary and use the intersected rect."
- **`dom-memory-management`**: Add rule: "MutationObservers observing a node that is explicitly replaced (not mutated) need to be re-established on the new node. Detect element replacement in observeForInputDiscovery and re-instrument."

---

## Debugging Notes

The screenshots show:
1. **Screenshot 1 (orange/amber underlines through modal):** z-index bleed through ChatGPT settings dialog. Underlines are amber (context type) — the `--insta-goal-type-context-color` palette entry `rgb(217 119 6)`.
2. **Screenshot 2 (purple underlines, wrong bounds):** Purple underlines (action type — `rgb(124 58 237)`) covering the full text but extending two rows below the input border. The `+` icon on the left and circular send button confirm this is the ChatGPT main input.

The fact that underlines ARE showing in both screenshots despite `querySelector('[data-insta-instrumented]')` returning null confirms BUG-REACT: event listeners survive React reconciliation but the attribute marker is stripped.
