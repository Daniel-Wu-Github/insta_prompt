# Round 2 Testing Notes

**Date:** 2026-05-30
**Stack:**
- Backend: `https://promptcompiler-backend.fly.dev`
- Extension: unpacked from `extension/.output/chrome-mv3/`
- Model: Groq (force-Groq toggle active; no Anthropic key)
- Sites tested: ChatGPT, (Claude.ai TBD)

**Focus:** First end-to-end test of the full compiler flow — segment → enhance → bind → commit.
Bind was not available in Round 1. All four stages need validation this round.

**Known going in:**
- Non-zero confidence confirmed via `fly logs` (two-layer fix: session storage null guard + LLM prompt rule)
- Force-Groq toggle works end-to-end
- BUG-3.2 (adjacent segment underline bleed) fixed before this round

---

## Bugs Found

### SEG-1 — Segmentation is non-deterministic

**Severity:** High
**Site:** All
**Description:** The same prompt produced 4 clauses in a prior session and only 1 clause in this session. The Groq LLM classifier (llama-3.1-8b) is not stable across identical inputs — temperature or prompt ambiguity is causing clause count to vary by run.
**Test prompt used:**
> I'm building a personal finance tracker for a side project. I'm using Python with pandas and sqlite3. The solution needs to run locally without any cloud dependencies and process all transactions in under 5 seconds. Write a function that categorizes monthly expenses by type and calculates spending trends over the last 6 months. Return the results as a markdown table with columns for category, monthly average, trend direction, and percentage change. Handle the case where some months have no transactions for a given category.

**Root cause hypothesis:** Classifier prompt does not define the canonical goal types explicitly with examples. Model guesses from description alone — highly sensitive to phrasing and temperature. See `docs/testing-notes/segment-classification-tuning.md`.
**Fix direction:** Add `temperature: 0` to the Groq segment call to eliminate run-to-run variance. Add explicit goal-type definitions and examples to the classifier system prompt. Track in the classification tuning workstream.

---

### BIND-UX-1 — Tab always accepts; no cycle-only mode; Shift+Tab not discoverable

**Severity:** Medium (UX friction)
**Site:** All
**Description:** Pressing Tab immediately accepts the focused segment and moves focus to the next unaccepted one. There is no way to browse/preview segments without accepting them. The user's expectation is Tab = cycle focus, Enter (or second Tab) = accept.

Shift+Tab does cycle focus without accepting (`skipFocusedSegment`), but this is not communicated anywhere in the UI. Users will not discover it without documentation.

**Code location:** `content/index.ts:2449–2458` (`handleSourceKeyDownEvent`)
**Fix direction:**
- Change Tab to cycle focus only (calling `skipFocusedSegment`-equivalent without accepting)
- Use a dedicated key (Enter, or second Tab on the same segment) to accept the focused segment
- OR: add a visible hint in the ghost panel or overlay: "Tab to cycle · Enter to accept · ⌘+Enter to bind"

---

### BIND-BUG-1 — COMPLETE state has no escape path; switching clause after compilation breaks the UI

**Severity:** High
**Site:** All
**Description:** After Ctrl+Enter compiles a bind (`bindPhase = "COMPLETE"`), if the user tries to switch focus to a different accepted clause before pressing Enter to commit, the UI shows "compilation already in progress" and becomes unresponsive. There is no way to recover without reloading the extension.

**Root cause (from code):**
1. `dispatchBindRequest` gates on `bindPhase !== "IDLE"` — blocks any new bind while in COMPLETE
2. Escape only cancels `activeBindRequestId` (only set during BINDING, not COMPLETE) — so Escape does nothing useful in COMPLETE state
3. No click or keyboard handler resets `bindPhase` to IDLE when the user changes their accepted clause selection
4. No "undo accept" path exists — once accepted, a clause stays accepted until the prompt text changes

**Code location:** `content/index.ts:2102`, `content/index.ts:2432–2443`
**Fix direction:**
- Escape in COMPLETE state should reset `bindPhase = "IDLE"`, clear `pendingGhostText`, and reset the ghost panel status — giving the user a clean retry
- Any click on a different segment while in COMPLETE state should also trigger this reset
- This is the highest priority bind UX fix

---

### BIND-UX-2 — No way to un-accept a segment

**Severity:** Medium
**Site:** All
**Description:** Once a segment is accepted (added to `acceptedSegmentIndices`), there is no keybinding or gesture to remove it from the accepted set. The only way to clear acceptance state is to edit the prompt text, which marks all accepted segments as stale. Accidentally accepting the wrong clause is a dead end.
**Code location:** `content/index.ts:2039–2053` (`acceptNextSegment` — add-only)
**Fix direction:** Shift+Enter (or another key) on a focused accepted segment should remove it from `acceptedSegmentIndices` and `acceptanceOrder`.

---

### BIND-UX-3 — Tab silently no-ops when all clauses are accepted

**Severity:** Low
**Site:** All
**Description:** When all segments are accepted, `acceptNextSegment` returns false (no unaccepted segments). Tab does nothing and gives no feedback. The user doesn't know why Tab stopped working.
**Code location:** `content/index.ts:2044–2047` — `findNextUnacceptedIndex` returns undefined, early return
**Fix direction:** When all segments are accepted, Tab should show a brief ghost panel hint: "All clauses accepted · ⌘+Enter to bind" (or cycle through accepted clauses to let user review).

---

### BIND-UX-4 — Bind order is acceptance-order-dependent, not communicated to user

**Severity:** Low (but important for output quality)
**Site:** All
**Description:** The bind request sends clauses in acceptance order (`state.acceptanceOrder`), not canonical clause order. If the user accepts clause 3 before clause 1, the bind output may be out of canonical sequence. This is invisible to the user.
**Code location:** `content/index.ts:2142` — `for (const index of state.acceptedSegmentIndices)`
**Note:** Double-check whether the backend re-sorts into canonical order before binding. If it does, this is a non-issue. If not, acceptance order determines output order.

---

### CHATGPT-CRIT-1 — Underlines persist after pressing Enter to send a message

**Severity:** Critical
**Site:** ChatGPT only
**Description:** After the user presses Enter to send their message, ChatGPT clears the contenteditable input programmatically via JavaScript (not via a user `input` event). The extension listens only for `input` events (`element.addEventListener("input", handleInputEvent)`). Because no `input` event fires on programmatic clear, `scheduleDebouncedExtraction` is never called, `extractInputText` never returns an empty string, and `clearDraftRendering` is never triggered. The underlines remain on screen over the now-empty input indefinitely.

**Root cause:** Programmatic DOM clear bypasses the `input` event listener — the extension's text-changed detection is event-based, not mutation-based.
**Code location:** `content/index.ts:2696–2702` (`handleInputEvent`), `content/index.ts:1430` (the empty-text guard that never fires)
**Fix direction:** Install a `MutationObserver` on the contenteditable's content children. When the observable content is removed (childList mutation with no remaining text content), call `scheduleDebouncedExtraction` to trigger the empty-text guard and clear the overlay. Alternatively, listen for the `keydown` Enter event on the element and schedule a short deferred re-extract (e.g. `setTimeout(reextract, 100)`) to catch post-submit clears.

---

### CHATGPT-CRIT-2 — Underlines bleed above and below the ChatGPT input box

**Severity:** Critical
**Site:** ChatGPT only
**Description:** The overlay host element is positioned over the input and sized to the input's full geometry. However, when text scrolls out of the visible region of the ChatGPT input box (which clips its content via `overflow: hidden`), the overlay's host element is not subject to that clip — it extends beyond the input's visible client rect. Underlines that belong to text above or below the visible scroll window render over adjacent page elements.

This is distinct from the step-9 scroll sync bug (the underlines ARE scrolling at the correct rate and are positioned correctly relative to the text). The issue is that the host element is not clipped to the input's visible viewport.

**Root cause:** The host element uses `overflow: hidden` internally (`content/index.ts:1054`), but it is sized to match the input's full geometry and is inserted into the document at the body level, outside the input's parent clip container. The parent's `overflow: hidden` clip does not apply to an element that is not a descendant of that parent.
**Code location:** `content/index.ts:1054`, geometry update logic
**Fix direction:** Set the host element's `width` and `height` to the input's `clientWidth` × `clientHeight` (visible rect, not scroll rect). Clip with `overflow: hidden` to that size. The transform-based scroll sync already positions content correctly inside — matching the host to the visible rect means content outside the visible area is clipped by the host's own overflow boundary.

---

### CLEAR-BUG-1 — "X" clear button on search inputs leaves underlines behind

**Severity:** High
**Site:** Any site with a search input that has a native or custom clear button
**Description:** Clicking the X/clear button on a search input clears the value programmatically without dispatching an `input` event on the element. Same root cause as CHATGPT-CRIT-1 — the extension never detects the text change and the overlay persists indefinitely.
**Fix direction:** Same fix as CHATGPT-CRIT-1: detect programmatic clears via MutationObserver (contenteditable) or by listening for the `search` event (which browsers fire on `<input type="search">` when the X is clicked). For `type="search"` elements specifically, adding an `"search"` event listener alongside `"input"` would catch the X-button clear.

---

### SITE-1 — Chrome default new-tab search bar not supported

**Severity:** Informational / Expected
**Site:** `chrome://newtab`, Chrome address bar
**Description:** The extension does not instrument the Chrome new-tab search bar or the URL bar. This is a Chrome security boundary — content scripts cannot run in `chrome://` pages. Not a bug; a platform constraint.
**Action:** Document as a known limitation. No fix possible without a registered new-tab-override permission, which is out of scope.

---

### BIND-DESIGN-1 — Commit replaces entire input, not just the accepted clause(s)

**Severity:** Critical (design + destructive)
**Site:** All
**Description:** When the user accepts 1 of 4 clauses and commits the bind output, the ENTIRE input is replaced with the compiled version of that 1 clause. The other 3 unaccepted clauses are destroyed.

**Root cause (from code):** This is by design. `collectAcceptedBindSections` sends only the accepted segments to the backend. The backend returns a compiled prompt built from those segments. `commitGhostTextToInput` then writes that output to `element.value` (or `textContent`) wholesale — it has no concept of "patch only these ranges." The commit is always a full replace.

**The real question — is this intended?** Architecturally yes: the design intent is that the user accepts ALL clauses they want in the final output, binds, then commits the complete compiled prompt. Bind is a total replacement pass, not a surgical patch. But this intent is not communicated anywhere in the UX. A user accepting 1 of 4 clauses reasonably expects the other 3 to survive commit.

**Fix directions (in order of preference):**
1. **(Immediate, low effort)** Before commit, show a clear warning in the ghost panel: "⚠ This replaces your entire prompt. [Enter] to confirm." — lets the user make an informed choice.
2. **(Better UX)** When Ctrl+Enter is pressed with only some clauses accepted, prompt: "Compile selected (X of Y) or accept all first?" — makes the "accept all before binding" expectation explicit.
3. **(Architectural, complex)** Patch-mode commit: splice the bind output only into the text ranges of the accepted clauses, preserving unaccepted clause text. Complex because the bind output is restructured and expanded, not a 1:1 substitution.

**Note:** Option 1 is the right fix for this round. Option 3 may conflict with the core compiler metaphor (bind = total output, not a patch).

---

### SEG-2 — Confidence scores are manufactured, not calibrated

**Severity:** Medium (signal quality), but raises a design question
**Site:** All
**Description:** A 6-clause prompt produced confidence scores of exactly 100%, 90%, 80%, 70%, 60%, 50% — a linear countdown. The LLM is not computing calibrated uncertainty; it is inventing a plausible-looking sequence. This was partially mitigated by fixing the LLM prompt rule (prior session), but the underlying problem remains: **LLMs are systematically poor at calibrated self-reported confidence.**

**Is the confidence system worth keeping?**

Verdict: **No, in its current form.** The evidence:
- Linear countdown sequences show the model is pattern-matching "what confidence scores look like" rather than reasoning about actual segment clarity
- Non-determinism (SEG-1) means the same clause gets different scores across runs
- The only consumer of confidence is underline style: solid (`>= threshold`) vs dashed
- If scores are manufactured, the solid/dashed distinction is theater — it communicates false certainty

**Options:**
1. **Remove confidence entirely** — use solid underlines everywhere. Simpler prompt, fewer tokens, no fake signal.
2. **Replace with heuristic** — compute locally: short + specific + imperative text → high confidence; long + vague + subordinate → low. No LLM call needed for this signal.
3. **Keep but fix prompt + temperature** — add calibration examples (e.g. "a vague 10-word clause = 0.4, a crisp constraint clause = 0.85"), set `temperature: 0`. Reduces variance but doesn't solve the fundamental calibration problem.

**Recommendation:** Remove confidence from the LLM response. Replace the underline distinction with a heuristic (text length + specificity keywords) computed client-side, or drop the visual distinction and use solid underlines always. Don't ask the LLM to manufacture a number we then use as a quality signal.

---

## UX Gaps Spotted From Code Review (Not Yet Tested)

### BIND-UX-5 — Enter after commit may also submit ChatGPT form

**Severity:** Medium (risk, not confirmed)
**Description:** `commitGhostTextToInput` calls `event.preventDefault()` after committing, which should block ChatGPT's Enter-to-send. But if `commitGhostTextToInput` silently fails (wrong state check, race condition), the event propagates and submits the form with partially replaced or unreplaced text.
**Code location:** `content/index.ts:2468–2473`
**Action:** Test explicitly: compile → commit → confirm the prompt is replaced in the input AND the message is NOT sent.

---

## Regression Checks

| Area | Status |
|---|---|
| BUG-3.2 underline bleed between adjacent segments | not yet confirmed |
| Pause toggle greys out overlay correctly | not yet tested |
| Popover appears on hover, disappears on mouse-out | not yet tested |
| Clause-aware header in popover shows correct label | not yet tested |
| Stale state propagation after upstream edit | not yet tested |
| Force-Groq toggle persists across popup close | confirmed working |
| Non-zero confidence values | confirmed working |

---

## Fix and Test Phases

### Phase 1 — Overlay reliability + state machine (pure frontend)

Goal: make the extension not visually break on any normal use of the target sites. No backend API changes.

| ID | Description |
|---|---|
| DECISION-1 | Remove `confidence` from LLM response, remove dashed underlines (keep dashed for stale-accepted only) |
| BIND-BUG-1 | Escape in COMPLETE state resets to IDLE; any clause-focus change while COMPLETE also resets |
| CHATGPT-CRIT-1 | Detect programmatic text clear via MutationObserver on contenteditable; schedule re-extract |
| CLEAR-BUG-1 | Add `"search"` event listener alongside `"input"` to catch X-button clears on `input[type="search"]` |
| CHATGPT-CRIT-2 | Clip overlay host element to input's `clientWidth` × `clientHeight` (visible rect, not scroll rect) |
| DECISION-2 | Show "this input isn't supported" dismissing toast on focus of writing-surface inputs the extension can't instrument (large contenteditable/textarea only, not email/number/password fields) |

Phase 1 test: reload extension, test on ChatGPT. Overlay clears after send. No bleed. COMPLETE state can be cancelled with Escape.

---

### Phase 2 — Bind architecture overhaul (frontend + backend API change)

Goal: make bind non-destructive (Option E locked in) and fix the Tab interaction model.

| ID | Description |
|---|---|
| BIND-DESIGN-1 | **Option E**: send all clauses to backend with `accepted: boolean` per section. Backend compiles accepted ones, passes unaccepted through verbatim, orders by canonical position. Commit replaces full prompt but nothing is lost. |
| BIND-UX-1 | Tab = cycle focus only (`skipFocusedSegment`). Enter on focused segment = accept it. Ctrl+Enter = bind. Ghost panel hint updated to reflect new bindings. |
| BIND-UX-2 | Shift+Enter (or Enter again on an already-accepted focused segment) = un-accept it, remove from `acceptedSegmentIndices` and `acceptanceOrder`. |
| BIND-UX-3 | When all clauses accepted, Tab shows brief ghost panel hint: "All clauses accepted · ⌘+Enter to bind" |

Backend contract change for BIND-DESIGN-1:
```
// Request payload per section (before: only accepted sections sent)
{ canonical_order, goal_type, expansion, accepted: boolean }

// Backend: compile accepted sections, pass-through unaccepted as literal text
// Output: assembled full prompt in canonical order
```

Phase 2 test: accept 1 of 4 clauses, bind, commit — confirm remaining 3 clauses appear verbatim in the committed text.

---

### Phase 3 — Classifier tuning + polish

Goal: improve segment quality and clean up remaining edge cases.

| ID | Description |
|---|---|
| SEG-1 | Set `temperature: 0` on Groq segment call. Add canonical goal-type definitions and 1 example per type to the classifier system prompt. |
| BIND-UX-4 | Verify whether backend re-sorts clauses into canonical order (if yes, acceptance order is a non-issue; if no, document that acceptance order determines output order) |
| BIND-UX-5 | Test explicitly: commit ghost text, confirm prompt is replaced AND ChatGPT message is NOT sent. Fix if race confirmed. |
| SITE-1 | Document Chrome new-tab as known limitation in popup or onboarding. |

Phase 3 test: run the test prompt from SEG-1 three times, confirm same clause count each time. Verify confidence UI is fully gone (no dashes on non-stale segments, no % label in popover).

---

## Design Decisions Made This Round

### DECISION-1: Remove confidence scores and dashed underlines

**Decision:** Drop `confidence` from the LLM segment response entirely. All underlines become solid. The dashed style for **stale accepted segments** is kept — that is a different signal (staleness, not quality) and remains valid.

**Removal scope:**
- `extension/src/content/index.ts`: remove `DRAFT_HIGH_CONFIDENCE_THRESHOLD`, remove `confidence` field from `DraftSegment` type, remove `isHighConfidence` variable and the `textDecorationStyle: dashed` branch in both rendering paths (`renderDraftOverlaySegments` and `applyAcceptanceVisualsToSpan`), remove `data-confidence` dataset attribute, remove `confidenceLabel` DOM node from popover, remove `[data-draft-hover-meta-confidence]` CSS, remove fallback `confidence: 0`
- `backend/src/services/segment.ts`: remove `confidence` from Zod schema, remove from LLM prompt example and calibration rule, remove `normalizeConfidence` call, remove `SEGMENT_FAILURE_FALLBACK_CONFIDENCE`
- `backend/src/lib/schemas.ts`: remove `confidence` from section schema

**What stays:** The `dashed` style on line ~1260 (`isStaleAccepted ? "dashed" : "solid"`) is a staleness indicator, not a confidence indicator — keep it.

---

### DECISION-2: "This input box does not support extensions" notification

**Decision:** Show a brief in-page toast when the user interacts with an input box that the extension cannot instrument.

**Scope of "unsupported" inputs (from code):**
- The extension instruments: `textarea`, `[contenteditable]`, `input[type='text']`, `input[type='search']`
- It does NOT instrument: `input[type='email']`, `input[type='number']`, `input[type='password']`, inputs in cross-origin iframes, and `chrome://` pages (content script cannot run)
- For `chrome://newtab` specifically: the content script never runs, so an in-page notification is impossible. Only the extension badge (`chrome.action.setBadgeText`) can communicate there.

**Design:** On `focus` of any input that matches none of the instrumented selectors (and is not a trivially short or password-type input), show a dismissing toast in the page corner: `"PromptCompiler: this input type isn't supported"`. Auto-dismiss after 3s. No close button needed.

**Open question:** Should this fire on every unsupported input focus (noisy), or only on specific input types that look like they "should" work (e.g. large contenteditable divs that aren't instrumented, perhaps due to nested iframe)? Leaning toward the latter — only show when the input looks like a text editor or chat box.

---

### DISCUSSION-1: Bind commits the full prompt — what should the behavior be?

**Current behavior (code):**
`commitGhostTextToInput` writes `pendingGhostText` (the bind output) to `element.value` / `textContent` wholesale. Bind output is assembled from ONLY the accepted clauses — unaccepted clauses are not sent to the backend and not included. Committing destroys them.

**The five options considered:**

**A. Enforce "accept all before bind" (warning only)**
Block Ctrl+Enter unless all clauses are accepted, or show a pre-bind warning: "X of Y clauses unaccepted — they will be replaced with their original text OR LOST." Simple, no architectural change. Still destructive, just more intentional.

**B. Patch mode (splice output into original positions)**
Commit replaces only the text ranges of accepted clauses, leaving unaccepted clause text in place. Hard: the bind output is restructured/expanded — a 20-char clause may become 100 chars. Splicing back into original character positions produces incoherent prompts. Not recommended.

**C. Two-mode bind (compile one clause vs compile all)**
`Ctrl+Enter` = compile the focused clause only, patch it in place. `Ctrl+Shift+Enter` = compile all accepted into a full replacement. Single-clause compile is a different, simpler backend call. Gives maximum flexibility. Complex keybinding surface and two different backend behaviors.

**D. Undo after commit**
Full replacement (current), but ghost panel stays visible for a few seconds: "✓ Committed. [Undo]" Undo restores the full original text (stored before commit). Non-destructive feel without changing the architecture. Tricky: `element.value` assignment may break undo history on some sites; contenteditable undo is even harder.

**E. Include unaccepted clauses as pass-through in bind output ← RECOMMENDED**
Send ALL clauses to the backend, tagged as `"accepted": true/false`. Backend compiles accepted clauses into expanded sections, includes unaccepted clause text verbatim, orders everything by canonical position. The commit output is a full assembled prompt that preserves every clause — just with accepted ones rewritten.

This is the most architecturally elegant: non-destructive by default, no UX complexity added, no undo required, no two-mode keybinding. The backend change is: accept a `accepted` boolean per section, pass unaccepted ones through as literal `text` blocks in the output.

**Recommendation:** Option E for the next implementation round. Option A (warning) as an immediate stopgap before E is built — add one line to the ghost panel status: "Compiling X of Y clauses — unaccepted clauses will be included as-is."

---

## General Notes

<!-- Free-form observations during the session -->
