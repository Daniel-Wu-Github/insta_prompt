# V1 Live Session Bug Report — 2026-05-27

Recorded during first end-to-end live test of the deployed stack:
- Backend: `https://promptcompiler-backend.fly.dev`
- Extension: unpacked from `extension/.output/chrome-mv3/`
- Supabase: hosted project `yrilkwidkpqjzpsbldcr`

---

## Test 1 — Auth / Sign-up

**What was tested:** Creating a new account from the extension popup.

**What worked:** Sign-up form appeared after UI fix (previously sign-in only). Supabase accepted the request and sent a confirmation email.

**Bugs found:**

### BUG-1.1 — Confirmation email link points to localhost

- **Severity:** Blocking for new users
- **Description:** Supabase sent a confirmation email with a link that points to `localhost` instead of the production app URL. Users cannot confirm their email address from the link.
- **Root cause:** Supabase project "Site URL" and "Redirect URLs" are not configured for production. Supabase defaults to `localhost` if these are unset.
- **Fix location:** Supabase dashboard → Authentication → URL Configuration → Site URL and Redirect URLs. Set to the production domain (Vercel or fly.dev URL).
- **Not a code bug.** Configuration-only fix in the Supabase dashboard.

### BUG-1.2 — Popup shows no user identity when signed in

- **Severity:** UX gap
- **Description:** After signing in, the popup does not display the logged-in user's email address or any account identifier. The user has no confirmation of which account is active.
- **Fix needed:** Display `auth.access_token` decoded email or fetch it from `/account/status` response and render it in the signed-in view of `App.tsx`.

---

## Test 2 — Content Script / Overlay (chatgpt.com and google.com)

**What was tested:** Typing a multi-sentence prompt into a textarea on chatgpt.com and the Google search bar.

### BUG-2.1 — Underlines and popup do not appear in Google search bar

- **Severity:** Feature gap on this target site
- **Description:** The extension works correctly on chatgpt.com (underlines appear, hover popover shows). On google.com, nothing appears when typing in the search bar. No underlines, no segmentation.
- **Root cause:** The Google search bar is not a `<textarea>` or `contenteditable` div — it is a custom `<input type="search">` inside a Shadow DOM or dynamically constructed element. The content script's input discovery logic does not attach to this element type.
- **Fix needed:** Extend input discovery in the content script to handle `<input type="text">` and `<input type="search">` elements, or at minimum document this as a known unsupported surface.

### BUG-2.2 — Hover popover is not spatially aware

- **Severity:** UX — popover can be clipped or scroll off-screen
- **Description:** The hover popover always appears anchored to the bottom of the entire clause underline span, not at the cursor position. On long clauses this means the popover appears far from where the mouse is. If the clause is near the bottom of the viewport the popover is clipped below the browser's bottom border and becomes unreadable.
- **Fix needed:** In the underline/preview rendering layer, use `MouseEvent.clientX/Y` to position the popover near the cursor, and add viewport-edge detection to flip the popover above the cursor when there is insufficient space below.

### BUG-2.3 — Overlay panel missing clause type legend

- **Severity:** UX — users cannot interpret underline colors without a key
- **Description:** The overlay shows "READY" status and displays clause metadata (Task Definition, Key Constraints, Output Shape) but has no legend mapping underline color to clause type (context, tech\_stack, constraint, action, output\_format, edge\_case). The legend should appear in the top-right corner of the overlay panel, opposite "READY".
- **Fix needed:** Add a compact inline legend component to the overlay panel top bar. Each entry should show the color swatch and the clause type label.

---

## Test 3 — Enhancement (hover preview / accept flow)

**What was tested:** Hovering over underlined clauses to see the enhanced version.

**What worked:** Enhancements rendered correctly and in time. Content was accurate.

**Bugs found:**

### BUG-3.1 — Free tier daily limit of 30 requests is too low for meaningful testing

- **Severity:** Configuration — not a code bug
- **Description:** The free tier allows 30 enhance/bind requests per day. This is depleted quickly during a testing session.
- **Options:**
  1. Raise the `FREE_DAILY_LIMIT` constant in `backend/src/services/rateLimit.ts` (currently `30`).
  2. Add a test/admin flag in Fly secrets to bypass rate limiting for known test accounts.
  3. Accept the limit and document it clearly in the popup (currently only shown as `Usage: 0/30` with no context).

---

## Test 4 — Bind (Ctrl+Enter trigger)

**What was tested:** Pressing Ctrl+Enter on Windows to trigger the bind step, in three states: (a) hovering over a clause, (b) having a clause selected/accepted, (c) with text highlighted.

**Bugs found:**

### BUG-4.1 — Ctrl+Enter does not trigger bind on Windows

- **Severity:** Blocking — core workflow is non-functional on Windows
- **Description:** Pressing Ctrl+Enter has no effect in any of the three tested states (hovering, accepted clause, highlighted text). No bind stream is initiated. The keybinding appears to not fire at all.
- **Possible causes:**
  1. The keybinding listener may be registered for `metaKey` (Cmd, Mac-only) and not `ctrlKey` (Windows/Linux).
  2. The listener may not be attached to the correct element or may be blocked by the target site's own keyboard handler.
  3. The bind-gate precondition (at least one accepted section) may not be satisfied, silently preventing bind from firing.
- **Fix needed:** Audit `hotkey-bind-commit-ux` implementation to confirm `ctrlKey` is included alongside `metaKey` in the bind trigger condition. Verify the listener is attached at the correct point in the DOM and that the gate condition is met before the keydown fires.

---

## Summary Table

| Bug ID | Area | Severity | Type |
|--------|------|----------|------|
| BUG-1.1 | Auth / Supabase config | Blocking | Config |
| BUG-1.2 | Popup UX | UX gap | Code |
| BUG-2.1 | Content script / Google search | Feature gap | Code |
| BUG-2.2 | Overlay / popover positioning | UX | Code |
| BUG-2.3 | Overlay / legend missing | UX | Code |
| BUG-3.1 | Rate limit | Config | Config |
| BUG-4.1 | Bind keybinding / Windows | Blocking | Code |
