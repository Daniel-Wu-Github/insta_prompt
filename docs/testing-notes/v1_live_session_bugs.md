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

### BUG-1.3 - Pop up still works and costs requests when user is signed out
- **Severity:** Configuration / UX
- **Description:** When the user is signed out, the popup still allows users to hover, the clauses are still underlined.
- **Fix needed:** The extension popup should show a "Please sign in" message and disable hover/underline functionality when there is no valid session. This may involve adding a check for authentication state in the content script and popup components, and gating the enhancement features behind that check.
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

- **Error Log:** Bind action blocked in chrome console logs: var content=(function(){function e(e){return e}var t=[`context`,`tech_stack`,`constraint`,`action`,`output_format`,`edge_case`],n=[`efficiency`,`balanced`,`detailed`],r=e({matches:[`<all_urls>`],runAt:`document_idle`,main(){let e=`data-insta-instrumented`,r=`true`,i=`promptcompiler-dev-jwt`,a=`2147483647`,o=.85,s=`0.45`,c={context:1,tech_stack:2,constraint:3,action:4,output_format:5,edge_case:6},l={action:{cssVariable:`--insta-goal-type-action-color`,color:`rgb(124 58 237)`},tech_stack:{cssVariable:`--insta-goal-type-tech-stack-color`,color:`rgb(15 118 110)`},constraint:{cssVariable:`--insta-goal-type-constraint-color`,color:`rgb(244 63 94)`},output_format:{cssVariable:`--insta-goal-type-output-format-color`,color:`rgb(29 78 216)`},context:{cssVariable:`--insta-goal-type-context-color`,color:`rgb(217 119 6)`},edge_case:{cssVariable:`--insta-goal-type-edge-case-color`,color:`rgb(107 114 128)`}},u=new Set(`ADDRESS.ARTICLE.ASIDE.BLOCKQUOTE.DIV.DL.DT.DD.FIELDSET.FIGCAPTION.FIGURE.FOOTER.FORM.H1.H2.H3.H4.H5.H6.HEADER.HR.LI.MAIN.NAV.OL.P.PRE.SECTION.TABLE.TBODY.TD.TH.TR.UL`.split(`.`)),d,f,p,m,h=!1,g=null,_=e=>u.has(e.tagName),v=e=>e.replace(/\r\n?/g,`
`),ee=e=>typeof e==`string`&&n.includes(e),te=e=>typeof e==`string`&&t.includes(e),y=e=>{if(typeof e==`string`){let t=e.trim();return t.length>0?t:void 0}if(typeof e!=`object`||!e||Array.isArray(e))return;let t=e;for(let e of[`token`,`accessToken`,`access_token`,`jwt`]){let n=t[e];if(typeof n!=`string`)continue;let r=n.trim();if(r.length>0)return r}for(let e of[`session`,`auth`,`data`]){let n=y(t[e]);if(n)return n}},b=e=>e instanceof Error?e.message.includes(`Access to storage is not allowed`):typeof e==`string`?e.includes(`Access to storage is not allowed`):!1,ne=async()=>{try{return await chrome.storage.session.get(null)}catch(e){if(b(e))return{};throw e}},re=async()=>{try{return await chrome.storage.sync.get(null)}catch(e){if(b(e))return{};throw e}},x=async()=>{let e=await re(),t=await chrome.storage.local.get(null),n=await ne(),r=`balanced`;for(let n of[e,t]){let e=n[`promptcompiler.settings`];if(typeof e==`object`&&e&&!Array.isArray(e)){let t=e.mode;if(ee(t)){r=t;break}}}let i=t[`promptcompiler.auth`];if(typeof i==`object`&&i&&!Array.isArray(i)){let e=i.access_token;if(typeof e==`string`&&e.trim().length>0)return{mode:r,jwt:e.trim()}}for(let e of[n,t])for(let t of Object.values(e)){let e=y(t);if(e)return{mode:r,jwt:e}}return{mode:r,jwt:null}},ie=async e=>{let{mode:t,jwt:n}=await x();return{verb:`SEGMENT`,jwt:n,requestId:crypto.randomUUID(),payload:{segments:[e],mode:t}}},ae=e=>{for(let n of t){let t=l[n];e.style.setProperty(t.cssVariable,t.color)}},S=(e,t)=>{e.dataset.draftStale=t?`true`:`false`,e.style.opacity=t?s:`1`},oe=e=>`${e.goalType.replace(/_/g,` `)} preview: ${e.text}`,se=e=>[...e].sort((e,t)=>c[e.goal_type]-c[t.goal_type]),ce=(e,t)=>e.start===t.start&&e.end===t.end&&e.text===t.text&&e.goalType===t.goalType&&e.confidence===t.confidence,le=()=>{let e=document.createElement(`div`);e.setAttribute(`aria-hidden`,`true`),e.dataset.instaDraftHoverPopover=`true`,e.style.position=`fixed`,e.style.left=`0px`,e.style.top=`0px`,e.style.zIndex=a,e.style.pointerEvents=`none`,e.style.contain=`layout paint style`;let t=e.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=`
:host {
	all: initial;
	position: fixed;
	left: 0;
	top: 0;
	z-index: ${a};
	pointer-events: none;
	contain: layout paint style;
}

[data-draft-hover-panel] {
	all: initial;
	display: block;
	box-sizing: border-box;
	max-width: min(320px, calc(100vw - 24px));
	border-radius: 12px;
	border: 1px solid rgba(148, 163, 184, 0.24);
	background: rgba(15, 23, 42, 0.98);
	color: rgb(248, 250, 252);
	box-shadow: 0 16px 40px rgba(15, 23, 42, 0.24);
	padding: 10px 12px;
	font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	font-size: 13px;
	line-height: 1.45;
	letter-spacing: 0;
	white-space: pre-wrap;
	pointer-events: none;
	user-select: none;
	-webkit-user-select: none;
}

[data-draft-hover-status] {
	display: block;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	margin-bottom: 6px;
	color: rgb(165, 180, 252);
}

[data-draft-hover-body] {
	display: block;
	white-space: pre-wrap;
	color: rgb(226, 232, 240);
}

[data-draft-hover-panel][data-state="loading"] [data-draft-hover-status] {
	color: rgb(125, 211, 252);
}

[data-draft-hover-panel][data-state="ready"] [data-draft-hover-status] {
	color: rgb(134, 239, 172);
}

[data-draft-hover-panel][data-state="stale"] [data-draft-hover-status] {
	color: rgb(248, 113, 113);
}

[data-draft-hover-panel][data-state="stale"] [data-draft-hover-body] {
	color: rgb(226, 232, 240);
}
`;let r=document.createElement(`div`);r.dataset.draftHoverPanel=`true`,r.dataset.state=`loading`,r.setAttribute(`role`,`tooltip`);let i=document.createElement(`div`);i.dataset.draftHoverStatus=`true`;let o=document.createElement(`div`);return o.dataset.draftHoverBody=`true`,r.append(i,o),t.append(n,r),O().appendChild(e),{containerElement:e,panelElement:r,statusElement:i,bodyElement:o}},C=e=>{let t=p;if(!t){e?.preservePointer||(m=void 0);return}t.readyTimerId!==void 0&&(window.clearTimeout(t.readyTimerId),t.readyTimerId=void 0),t.containerElement.remove(),p=void 0,e?.preservePointer||(m=void 0)},w=e=>{let{statusElement:t,bodyElement:n,panelElement:r,segment:i,status:a}=e;switch(r.dataset.state=a,a){case`loading`:t.textContent=`Loading`,n.textContent=`Loading preview...`;break;case`stale`:t.textContent=`Stale`,n.textContent=`This preview is outdated because the text changed.`;break;case`ready`:t.textContent=`Ready`,n.textContent=d?.enhancedTextBySegmentId.get(i.id)??oe(i);break}},T=e=>{let t=e.anchorRect,n=e.panelElement.getBoundingClientRect().height||96,r=Math.max(12,Math.min(t.left,window.innerWidth-320-12)),i=t.bottom+10,a=t.top-n-10,o=i+n>window.innerHeight-12&&a>=12;e.containerElement.style.left=`${r}px`,e.containerElement.style.top=`${Math.max(12,o?a:i)}px`},ue=e=>{e.readyTimerId!==void 0&&window.clearTimeout(e.readyTimerId),e.readyTimerId=window.setTimeout(()=>{p!==e||e.status!==`loading`||(e.readyTimerId=void 0,e.status=`ready`,w(e),T(e))},120)},E=e=>{!p||p.sourceElement!==e||(p.readyTimerId!==void 0&&(window.clearTimeout(p.readyTimerId),p.readyTimerId=void 0),p.status!==`stale`&&(p.status=`stale`,w(p),T(p)))},de=(e,t,n)=>{let r=e.draftOverlayContentElement;if(!r)return;let i=Array.from(r.querySelectorAll(`span[data-goal-type][data-segment-index]`));for(let r of i){let i=r.getBoundingClientRect();if(t<i.left||t>i.right||n<i.top||n>i.bottom)continue;let a=Number.parseInt(r.getAttribute(`data-segment-index`)??``,10);if(!Number.isFinite(a)||a<0||a>=e.draftSegments.length)continue;let o=e.draftSegments[a];if(o)return{segment:o,rect:i}}},D=(e,t,n)=>{let r=f;if(!r||r.element!==e||!r.draftOverlayContentElement){C();return}let i=de(r,t,n);if(!i){C();return}m={clientX:t,clientY:n};let a=r.draftIsStale,o=p;if(o&&o.sourceElement===e&&ce(o.segment,i.segment)){o.anchorRect=i.rect,o.clientX=t,o.clientY=n,T(o),a&&o.status!==`stale`&&E(e);return}C({preservePointer:!0});let s={sourceElement:e,segment:i.segment,status:a?`stale`:`loading`,containerElement:void 0,shadowRoot:void 0,panelElement:void 0,statusElement:void 0,bodyElement:void 0,readyTimerId:void 0,anchorRect:i.rect,clientX:t,clientY:n},c=le();s.containerElement=c.containerElement,s.shadowRoot=c.containerElement.shadowRoot,s.panelElement=c.panelElement,s.statusElement=c.statusElement,s.bodyElement=c.bodyElement,p=s,w(s),T(s),s.status===`loading`&&(d?.activeEnhanceRequestIdsBySegmentId.has(i.segment.id)||ue(s))},fe=e=>{m&&D(e,m.clientX,m.clientY)},pe=e=>{let t=n=>{if(n.nodeType===Node.TEXT_NODE)return n.textContent??``;if(n.nodeType!==Node.ELEMENT_NODE)return``;let r=n;if(r.tagName===`BR`)return`
`;let i=r===e||_(r)?`
`:``,a=[];for(let e of r.childNodes){let n=t(e);n.length>0&&a.push(n)}return a.join(i)};return t(e)},me=e=>{let n=v(e),r=[],i=0,a=e=>{let a=n.slice(i,e),o=a.match(/^\s*/)?a.match(/^\s*/)?.[0].length??0:0,s=a.match(/\s*$/)?a.match(/\s*$/)?.[0].length??0:0,c=i+o,l=e-s;c>=l||r.push({id:`seg-${c}-${l}`,depends_on:[],start:c,end:l,text:n.slice(c,l),goalType:t[0],confidence:0})};for(let e=0;e<n.length;e+=1){let t=n[e];if(t===`
`){a(e),i=e+1;continue}(t===`.`||t===`,`||t===`;`||t===`:`||t===`!`||t===`?`)&&(a(e+1),i=e+1)}a(n.length);for(let e=1;e<r.length;e++)r[e].depends_on=r.slice(0,e).map(e=>e.id);return r},he=()=>{if(!(typeof CSS>`u`))return CSS.highlights},O=()=>document.body??document.documentElement,ge=(e,t)=>{let n=window.getComputedStyle(e);t.style.boxSizing=`border-box`,t.style.font=n.font,t.style.fontFamily=n.fontFamily,t.style.fontSize=n.fontSize,t.style.fontStyle=n.fontStyle,t.style.fontWeight=n.fontWeight,t.style.fontStretch=n.fontStretch,t.style.borderRadius=n.borderRadius,t.style.fontKerning=n.fontKerning,t.style.fontVariant=n.fontVariant,t.style.fontFeatureSettings=n.fontFeatureSettings,t.style.fontVariationSettings=n.fontVariationSettings,t.style.lineHeight=n.lineHeight,t.style.letterSpacing=n.letterSpacing,t.style.wordSpacing=n.wordSpacing,t.style.textAlign=n.textAlign,t.style.textIndent=n.textIndent,t.style.textTransform=n.textTransform,t.style.direction=n.direction,t.style.whiteSpace=n.whiteSpace,t.style.wordBreak=n.wordBreak,t.style.overflowWrap=n.overflowWrap,t.style.background=`transparent`,t.style.color=`transparent`,t.style.caretColor=`transparent`,t.style.overflow=`hidden`,t.style.border=`0`,t.style.padding=`0`,t.style.pointerEvents=`none`,t.style.userSelect=`none`,t.style.setProperty(`-webkit-user-select`,`none`),t.style.setProperty(`-webkit-text-fill-color`,`transparent`)},k=e=>{if(!e)return;let t=Array.from(e.activeEnhanceRequestIdsBySegmentId.keys());for(let n of t){let t=e.activeEnhanceRequestIdsBySegmentId.get(n);t&&($({verb:`CANCEL`,jwt:i,requestId:t}),e.activeEnhanceRequestIdsBySegmentId.delete(n))}e.enhancedTextBySegmentId.clear(),f===e&&(f=void 0),p?.sourceElement===e.element&&C({preservePointer:!0}),he()?.delete(`insta-prompt-draft-highlight`),e.draftOverlayElement&&=(e.draftOverlayElement.remove(),void 0),e.draftOverlayScrollListener&&=(e.element.removeEventListener(`scroll`,e.draftOverlayScrollListener),void 0),e.draftOverlayContentElement=void 0,e.draftOverlaySegmentRootElement=void 0,e.draftOverlayResizeObserver?.disconnect(),e.draftOverlayResizeObserver=void 0,e.draftIsStale=!1,e.draftRenderMode=void 0,e.draftText=``,e.draftSegments=[]},_e=e=>{let t=document.createElement(`div`);t.setAttribute(`aria-hidden`,`true`),t.dataset.instaDraftOverlay=`true`,t.style.position=`fixed`,t.style.left=`0px`,t.style.top=`0px`,t.style.margin=`0`,t.style.zIndex=a,t.style.background=`transparent`,t.style.color=`transparent`,t.style.caretColor=`transparent`,t.style.overflow=`hidden`,t.style.pointerEvents=`none`,t.style.userSelect=`none`,t.style.setProperty(`-webkit-user-select`,`none`),t.style.setProperty(`-webkit-text-fill-color`,`transparent`),t.style.contain=`layout paint style`,ge(e,t),ae(t),S(t,!1);let n=document.createElement(`div`);return n.style.position=`absolute`,n.style.inset=`0`,n.style.pointerEvents=`none`,n.style.color=`transparent`,n.style.caretColor=`transparent`,n.style.userSelect=`none`,n.style.setProperty(`-webkit-user-select`,`none`),n.style.setProperty(`-webkit-text-fill-color`,`transparent`),n.style.font=`inherit`,n.style.lineHeight=`inherit`,n.style.letterSpacing=`inherit`,n.style.wordSpacing=`inherit`,n.style.whiteSpace=`inherit`,n.style.transformOrigin=`top left`,t.appendChild(n),O().appendChild(t),{hostElement:t,contentElement:n}},ve=e=>{let t=e.draftOverlayElement,n=e.draftOverlayContentElement,r=e.draftOverlaySegmentRootElement;if(t&&n&&t.isConnected&&n.isConnected){let i=r;if(!i||i.parentElement!==n){let t=n.firstElementChild;t instanceof HTMLDivElement&&t.dataset.instaDraftSegmentRoot===`true`&&(i=t,e.draftOverlaySegmentRootElement=i)}if(i)return{hostElement:t,contentElement:n,segmentRootElement:i}}(t||n||r)&&k(e);let i=_e(e.element),a=document.createElement(`div`);return a.dataset.instaDraftSegmentRoot=`true`,a.style.margin=`0`,a.style.opacity=e.draftIsStale?s:`1`,A(e.element,a),i.contentElement.appendChild(a),e.draftOverlayElement=i.hostElement,e.draftOverlayContentElement=i.contentElement,e.draftOverlaySegmentRootElement=a,{hostElement:i.hostElement,contentElement:i.contentElement,segmentRootElement:a}},A=(e,t)=>{let n=window.getComputedStyle(e);t.style.position=`relative`,t.style.width=`100%`,t.style.minHeight=`100%`,t.style.boxSizing=`border-box`,t.style.borderTopStyle=n.borderTopStyle,t.style.borderRightStyle=n.borderRightStyle,t.style.borderBottomStyle=n.borderBottomStyle,t.style.borderLeftStyle=n.borderLeftStyle,t.style.borderTopWidth=n.borderTopWidth,t.style.borderRightWidth=n.borderRightWidth,t.style.borderBottomWidth=n.borderBottomWidth,t.style.borderLeftWidth=n.borderLeftWidth,t.style.borderTopColor=`transparent`,t.style.borderRightColor=`transparent`,t.style.borderBottomColor=`transparent`,t.style.borderLeftColor=`transparent`,t.style.borderRadius=n.borderRadius,t.style.background=`transparent`,t.style.color=`transparent`,t.style.caretColor=`transparent`,t.style.font=`inherit`,t.style.lineHeight=`inherit`,t.style.letterSpacing=`inherit`,t.style.wordSpacing=`inherit`,t.style.whiteSpace=`inherit`,t.style.wordBreak=`inherit`,t.style.overflowWrap=`inherit`,t.style.margin=`0`,t.style.paddingTop=n.paddingTop,t.style.paddingRight=n.paddingRight,t.style.paddingBottom=n.paddingBottom,t.style.paddingLeft=n.paddingLeft,t.style.pointerEvents=`none`,t.style.userSelect=`none`,t.style.setProperty(`-webkit-user-select`,`none`),t.style.setProperty(`-webkit-text-fill-color`,`transparent`)},j=(e,t,n,r)=>{let i=e.getBoundingClientRect();t.style.left=`${i.left}px`,t.style.top=`${i.top}px`,t.style.width=`${i.width}px`,t.style.height=`${i.height}px`,r&&(r.style.width=`${e.clientWidth}px`),M(e,n)},M=(e,t)=>{t.style.transform=`translate(-${e.scrollLeft}px, -${e.scrollTop}px)`},N=e=>{if(e.draftOverlayResizeObserver?.disconnect(),typeof ResizeObserver>`u`){e.draftOverlayResizeObserver=void 0;return}let t=new ResizeObserver(()=>{P()});t.observe(e.element),e.draftOverlayResizeObserver=t},P=()=>{let e=f;if(!(!e?.draftOverlayElement||!e.draftOverlayContentElement)){if(!e.element.isConnected){k(e);return}j(e.element,e.draftOverlayElement,e.draftOverlayContentElement,e.draftOverlaySegmentRootElement)}},ye=()=>{h||(h=!0,window.addEventListener(`scroll`,P,!0),window.addEventListener(`resize`,P))},F=(e,t,n,r,i)=>{let a=l[t.goalType],s=t.confidence>=o;e.dataset.accepted=n?`true`:`false`,e.dataset.focused=r?`true`:`false`,e.dataset.acceptedStale=i?`true`:`false`,n?(e.style.opacity=i?`0.3`:`0.4`,e.style.textDecorationLine=`underline`,e.style.textDecorationColor=i?`rgb(217 119 6)`:`var(${a.cssVariable})`,e.style.textDecorationStyle=i?`dashed`:`solid`,e.style.textDecorationThickness=`2px`,e.style.outline=`none`):(e.style.opacity=`1`,e.style.textDecorationColor=`var(${a.cssVariable})`,e.style.textDecorationStyle=s?`solid`:`dashed`,e.style.textDecorationThickness=s?`2px`:`1.5px`,e.style.outline=r?`1px solid var(${a.cssVariable})`:`none`,e.style.outlineOffset=r?`1px`:`0`)},I=e=>{let t=e.draftOverlaySegmentRootElement;if(!t)return;let n=t.querySelectorAll(`span[data-segment-index]`);for(let t of n){let n=Number.parseInt(t.dataset.segmentIndex??``,10);if(!Number.isFinite(n))continue;let r=e.draftSegments[n];if(!r)continue;let i=e.acceptedSegmentIndices.has(n);F(t,r,i,e.focusedSegmentIndex===n,i&&e.hasStaleAccepted)}},be=(e,t,n,r,i,a,c,u)=>{t.textContent=``,t.dataset.instaDraftSegments=String(r.length),t.style.opacity=i?s:`1`,A(e,t);let d=document.createDocumentFragment(),f=0;for(let[e,t]of r.entries()){f<t.start&&d.appendChild(document.createTextNode(n.slice(f,t.start)));let r=document.createElement(`span`),s=l[t.goalType],p=t.confidence>=o,m=a.has(e),h=c===e,g=m&&u;r.dataset.goalType=t.goalType,r.dataset.segmentIndex=String(e),r.dataset.confidence=t.confidence.toFixed(2),r.dataset.draftStale=i?`true`:`false`,r.style.display=`inline`,r.style.color=`transparent`,r.style.background=`transparent`,r.style.caretColor=`transparent`,r.style.font=`inherit`,r.style.lineHeight=`inherit`,r.style.letterSpacing=`inherit`,r.style.whiteSpace=`inherit`,r.style.wordBreak=`inherit`,r.style.overflowWrap=`inherit`,r.style.pointerEvents=`none`,r.style.userSelect=`none`,r.style.setProperty(`-webkit-user-select`,`none`),r.style.setProperty(`-webkit-text-fill-color`,`transparent`),r.style.textDecorationLine=`underline`,r.style.textDecorationColor=`var(${s.cssVariable})`,r.style.textDecorationStyle=p?`solid`:`dashed`,r.style.textDecorationThickness=p?`2px`:`1.5px`,r.style.textUnderlineOffset=`2px`,r.style.textDecorationSkipInk=`none`,F(r,t,m,h,g);let _=t.text.match(/\s+$/)?.[0]??``;r.textContent=_.length>0?t.text.slice(0,t.text.length-_.length):t.text,d.appendChild(r),_.length>0&&d.appendChild(document.createTextNode(_)),f=t.end}f<n.length&&d.appendChild(document.createTextNode(n.slice(f))),t.appendChild(d)},L=(e,t,n,r)=>{if(!e.element.isConnected||t.length===0){k(e);return}ye();let i=ve(e);N(e),j(e.element,i.hostElement,i.contentElement,i.segmentRootElement),be(e.element,i.segmentRootElement,t,n,r,e.acceptedSegmentIndices,e.focusedSegmentIndex,e.hasStaleAccepted),S(i.hostElement,r),e.draftIsStale=r,e.draftRenderMode=`overlay`,e.draftOverlayElement=i.hostElement,e.draftOverlayContentElement=i.contentElement,e.draftText=t,e.draftSegments=n,f=e,fe(e.element)},xe=[`box-sizing`,`width`,`border-top-width`,`border-right-width`,`border-bottom-width`,`border-left-width`,`padding-top`,`padding-right`,`padding-bottom`,`padding-left`,`font-family`,`font-size`,`font-style`,`font-weight`,`font-stretch`,`letter-spacing`,`word-spacing`,`line-height`,`text-align`,`text-transform`,`text-indent`],Se=e=>{try{if(!(e instanceof HTMLTextAreaElement)){let e=window.getSelection();if(!e||e.rangeCount===0)return null;let t=e.getRangeAt(0).cloneRange();t.collapse(!0);let n=t.getBoundingClientRect();return n.top===0&&n.left===0&&n.width===0&&n.height===0?null:{x:n.left,y:n.bottom}}let t=e,n=t.selectionStart??t.value.length,r=window.getComputedStyle(t),i=t.getBoundingClientRect(),a=document.createElement(`div`);a.setAttribute(`aria-hidden`,`true`),a.style.position=`absolute`,a.style.visibility=`hidden`,a.style.pointerEvents=`none`,a.style.top=`${i.top+window.scrollY}px`,a.style.left=`${i.left+window.scrollX}px`,a.style.overflowY=`scroll`,a.style.overflowX=`hidden`,a.style.whiteSpace=`pre-wrap`,a.style.wordBreak=`break-word`;for(let e of xe){let t=r.getPropertyValue(e);t&&a.style.setProperty(e,t)}a.textContent=t.value.substring(0,n);let o=document.createElement(`span`);o.textContent=`​`,a.appendChild(o),document.body.appendChild(a),a.scrollTop=t.scrollTop,a.scrollLeft=t.scrollLeft;let s=o.getBoundingClientRect();return a.remove(),s.top===0&&s.left===0?null:{x:s.left,y:s.bottom}}catch{return null}},R=e=>{if(e.ghostPanelElement&&e.ghostPanelElement.isConnected){z(e);return}let t=document.createElement(`div`);t.setAttribute(`aria-hidden`,`true`),t.dataset.instaGhostPanel=`true`,t.style.position=`fixed`,t.style.left=`0px`,t.style.top=`0px`,t.style.zIndex=a,t.style.pointerEvents=`none`;let n=t.attachShadow({mode:`open`}),r=document.createElement(`style`);r.textContent=`
:host {
	all: initial;
	position: fixed;
	left: 0;
	top: 0;
	z-index: ${a};
	pointer-events: none;
}

[data-ghost-panel] {
	all: initial;
	display: block;
	box-sizing: border-box;
	max-width: min(560px, calc(100vw - 24px));
	border-radius: 10px;
	border: 1px solid rgba(148, 163, 184, 0.32);
	background: rgba(15, 23, 42, 0.97);
	color: rgb(226, 232, 240);
	box-shadow: 0 12px 32px rgba(15, 23, 42, 0.32);
	padding: 12px 14px;
	font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	font-size: 13px;
	line-height: 1.5;
	font-style: italic;
	white-space: pre-wrap;
	pointer-events: none;
	user-select: none;
}

[data-ghost-status] {
	display: block;
	font-size: 11px;
	font-style: normal;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	margin-bottom: 6px;
	color: rgb(165, 180, 252);
}

[data-ghost-body] {
	display: block;
	white-space: pre-wrap;
	font-style: italic;
	color: rgb(203, 213, 225);
}
`;let i=document.createElement(`div`);i.dataset.ghostPanel=`true`;let o=document.createElement(`div`);o.dataset.ghostStatus=`true`,o.textContent=`Compiling...`;let s=document.createElement(`div`);s.dataset.ghostBody=`true`,i.append(o,s),n.append(r,i),O().appendChild(t),e.ghostPanelElement=t,e.ghostPanelStatusElement=o,e.ghostPanelBodyElement=s;let c=()=>z(e);window.addEventListener(`scroll`,c,!0),window.addEventListener(`resize`,c),e.ghostPanelLayoutListener=c,z(e)},z=e=>{let t=e.ghostPanelElement;if(!t)return;let n=Se(e.element);if(n!==null){let e=Math.max(12,Math.min(window.innerWidth-12-200,n.x)),r=Math.max(12,Math.min(window.innerHeight-12-80,n.y+4));t.style.left=`${e}px`,t.style.top=`${r}px`;return}let r=e.element.getBoundingClientRect(),i=Math.min(window.innerHeight-12-80,r.bottom+8),a=Math.max(12,r.left);t.style.left=`${a}px`,t.style.top=`${Math.max(12,i)}px`},B=(e,t)=>{e.ghostPanelStatusElement&&(e.ghostPanelStatusElement.textContent=t)},V=e=>{R(e),B(e,`Session expired`),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=`Session expired — please reopen the extension`)},H=e=>{e.bindRecoveryTimeoutId!==void 0&&(window.clearTimeout(e.bindRecoveryTimeoutId),e.bindRecoveryTimeoutId=void 0),e.bindRecoveryObserver&&=(e.bindRecoveryObserver.disconnect(),void 0)},Ce=async e=>{if(e.length===0)return;if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(e);return}let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.opacity=`0`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),t.remove()},we=(e,t)=>{let n=0;e.tagName===t.tagName&&(n+=4);for(let r of[`id`,`name`,`role`,`aria-label`,`placeholder`,`data-testid`,`data-test-id`]){let i=e.getAttribute(r),a=t.getAttribute(r);i&&a&&i===a&&(n+=1)}return e.className&&e.className===t.className&&(n+=1),e instanceof HTMLTextAreaElement&&t instanceof HTMLTextAreaElement&&(n+=2),e instanceof HTMLElement&&t instanceof HTMLElement&&e.matches(`[contenteditable]:not([contenteditable="false"])`)===t.matches(`[contenteditable]:not([contenteditable="false"])`)&&(n+=1),n},U=(e,t)=>{let n=[],r=e=>{if((e instanceof HTMLTextAreaElement||e instanceof HTMLElement)&&X(e)&&n.push(e),e instanceof Element||e instanceof DocumentFragment)for(let t of e.querySelectorAll(`textarea, [contenteditable]:not([contenteditable='false'])`))X(t)&&n.push(t)};for(let e of t)if(e.type===`childList`)for(let t of e.addedNodes)r(t);let i,a=0;for(let t of n){if(t===e.element||Z(t))continue;let n=we(e.element,t);n>a&&(i=t,a=n)}return a>0?i:void 0},W=(e,t)=>{let n=e.element;n!==t&&(e.draftOverlayScrollListener&&n.removeEventListener(`scroll`,e.draftOverlayScrollListener),e.element=t,e.draftOverlayScrollListener=void 0,Pe(e),N(e),e.ghostPanelElement&&R(e)),e.draftOverlayElement?.isConnected&&e.draftOverlayContentElement?.isConnected&&(j(e.element,e.draftOverlayElement,e.draftOverlayContentElement,e.draftOverlaySegmentRootElement),S(e.draftOverlayElement,e.draftIsStale)),e.ghostPanelElement?.isConnected&&z(e),f=e},Te=e=>{e.bindRecoveryObserver||e.bindRecoveryTimeoutId!==void 0||(e.bindRecoveryObserver=new MutationObserver(t=>{let n=U(e,t);n&&(H(e),W(e,n))}),e.bindRecoveryObserver.observe(document.body,{childList:!0,subtree:!0}),e.bindRecoveryTimeoutId=window.setTimeout(()=>{H(e),!(e.element.isConnected||e.bindPhase===`IDLE`)&&(Ce(e.pendingGhostText).catch(e=>{console.warn(`Failed to copy recovered bind text`,e)}),V(e),B(e,`Editor changed`),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=`Editor changed — your compiled prompt was saved to clipboard`))},500))},G=e=>{e.ghostPanelLayoutListener&&=(window.removeEventListener(`scroll`,e.ghostPanelLayoutListener,!0),window.removeEventListener(`resize`,e.ghostPanelLayoutListener),void 0),e.ghostPanelElement&&e.ghostPanelElement.remove(),e.ghostPanelElement=void 0,e.ghostPanelBodyElement=void 0,e.ghostPanelStatusElement=void 0},Ee=(e,t)=>{e.bindPhase=`BINDING`,e.pendingGhostText+=t,R(e),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=e.pendingGhostText)},De=e=>{e.bindPhase=`COMPLETE`,e.ghostStreamComplete=!0,B(e,`Press Enter to commit`)},Oe=(e,t)=>{e.bindHistoryWarning=t,R(e),B(e,`Press Enter to commit`),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=`${e.pendingGhostText}\n\n${t}`)},ke=(e,t)=>{H(e),e.bindPhase=`IDLE`,e.ghostStreamComplete=!1,e.activeBindRequestId=void 0,e.bindHistoryWarning=void 0,R(e),B(e,`Bind failed`),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=t)},Ae=(e,t,n)=>{let r=(e.enhancedTextBySegmentId.get(t)??``)+n;e.enhancedTextBySegmentId.set(t,r),p&&p.sourceElement===e.element&&p.segment.id===t&&(p.bodyElement.textContent=r)},je=(e,t)=>{e.activeEnhanceRequestIdsBySegmentId.delete(t),p&&p.sourceElement===e.element&&p.segment.id===t&&(p.readyTimerId!==void 0&&(window.clearTimeout(p.readyTimerId),p.readyTimerId=void 0),p.status=`ready`,w(p),T(p))},Me=(e,t,n)=>{e.activeEnhanceRequestIdsBySegmentId.delete(t),p&&p.sourceElement===e.element&&p.segment.id===t&&(p.readyTimerId!==void 0&&(window.clearTimeout(p.readyTimerId),p.readyTimerId=void 0),p.panelElement.dataset.state=`error`,p.statusElement.textContent=`Error`,p.bodyElement.textContent=n)},K=e=>{e&&(e.debounceTimerId!==void 0&&(window.clearTimeout(e.debounceTimerId),e.debounceTimerId=void 0),e.abortController&&=(e.abortController.abort(),void 0),H(e),e.bindPhase=`IDLE`,e.status=`IDLE`)},Ne=e=>{e.currentTarget instanceof HTMLElement&&(C(),d?.element===e.currentTarget&&d.draftOverlayContentElement&&M(e.currentTarget,d.draftOverlayContentElement))},Pe=e=>{e.draftOverlayScrollListener||(e.draftOverlayScrollListener=Ne,e.element.addEventListener(`scroll`,e.draftOverlayScrollListener,{passive:!0}))},Fe=e=>{!(e.currentTarget instanceof HTMLElement)||!(e instanceof MouseEvent)||D(e.currentTarget,e.clientX,e.clientY)},Ie=()=>{C()},Le=()=>{C()},Re=e=>{if(e.draftSegments.length===0)return!1;let t=q(e,e.focusedSegmentIndex);return t===void 0?!1:(e.acceptedSegmentIndices.add(t),e.acceptanceOrder.push(t),e.focusedSegmentIndex=q(e,t+1)??t,I(e),!0)},q=(e,t)=>{let n=typeof t==`number`&&t>=0?t:0;for(let t=n;t<e.draftSegments.length;t+=1)if(!e.acceptedSegmentIndices.has(t))return t;for(let t=0;t<n;t+=1)if(!e.acceptedSegmentIndices.has(t))return t},ze=e=>{if(e.draftSegments.length===0||e.focusedSegmentIndex===void 0)return!1;let t=q(e,e.focusedSegmentIndex+1);return t===void 0||t===e.focusedSegmentIndex?!1:(e.focusedSegmentIndex=t,I(e),!0)},Be=e=>e.acceptedSegmentIndices.size>0&&!e.hasStaleAccepted&&e.activeBindRequestId===void 0&&e.bindPhase===`IDLE`,Ve=e=>{console.warn(`[content] bind blocked`,{accepted:e.acceptedSegmentIndices.size,hasStaleAccepted:e.hasStaleAccepted,bindPhase:e.bindPhase,activeBindRequestId:e.activeBindRequestId})},He=e=>{let t=[];for(let n of e.acceptedSegmentIndices){let r=e.draftSegments[n];r&&t.push({canonical_order:c[r.goalType],goal_type:r.goalType,expansion:e.enhancedTextBySegmentId.get(r.id)??r.text})}return se(t)},Ue=e=>{if(!Be(e)){Ve(e);return}let t=He(e);t.length!==0&&(async()=>{let{mode:n,jwt:r}=await x();if(!r){V(e);return}if(!Be(e)){Ve(e);return}let i=crypto.randomUUID();H(e),e.bindPhase=`BINDING`,e.activeBindRequestId=i,e.bindHistoryWarning=void 0,e.pendingGhostText=``,e.ghostStreamComplete=!1,R(e),B(e,`Compiling...`),e.ghostPanelBodyElement&&(e.ghostPanelBodyElement.textContent=``),$({verb:`BIND`,jwt:r,requestId:i,payload:{sections:t,mode:n}})})().catch(e=>{console.warn(`Failed to dispatch BIND request`,e)})},J=e=>{let t=e.activeBindRequestId;return t?(H(e),$({verb:`CANCEL`,jwt:i,requestId:t}),e.activeBindRequestId=void 0,e.bindPhase=`IDLE`,e.bindHistoryWarning=void 0,e.pendingGhostText=``,e.ghostStreamComplete=!1,G(e),!0):!1},We=(e,t)=>{let n=e.activeEnhanceRequestIdsBySegmentId.get(t);n&&($({verb:`CANCEL`,jwt:i,requestId:n}),e.activeEnhanceRequestIdsBySegmentId.delete(t))},Ge=async(e,t,n)=>{let{mode:r,jwt:i}=await x();if(!i){V(e);return}if(d!==e||e.activeEnhanceRequestIdsBySegmentId.has(t.id))return;let a=crypto.randomUUID();e.activeEnhanceRequestIdsBySegmentId.set(t.id,a),$({verb:`ENHANCE`,jwt:i,requestId:a,payload:{section:{id:t.id,text:t.text,goal_type:t.goalType},siblings:n.filter(e=>e.id!==t.id).map(e=>({id:e.id,text:e.text,goal_type:e.goalType})),mode:r,project_id:null}})},Ke=e=>{if(!e.ghostStreamComplete||e.pendingGhostText.length===0)return!1;let t=e.element,n=e.pendingGhostText;if(Y(t)){let e=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,`value`)?.set;e?e.call(t,n):t.value=n,t.dispatchEvent(new Event(`input`,{bubbles:!0})),t.dispatchEvent(new Event(`change`,{bubbles:!0}));try{t.setSelectionRange(n.length,n.length)}catch{}}else t.textContent=n,t.dispatchEvent(new InputEvent(`input`,{bubbles:!0,inputType:`insertText`}));return Ye(e),!0},qe=(e,n)=>{let r=[],i=0;for(let a of e){let e=typeof a.text==`string`?a.text.trim():``;if(!e)continue;let o=te(a.goal_type)?a.goal_type:t[0],s=typeof a.confidence==`number`?a.confidence:.5,c=n.indexOf(e,i);c!==-1&&(r.push({id:`seg-${c}-${c+e.length}`,depends_on:[],start:c,end:c+e.length,text:e,goalType:o,confidence:s}),i=c+e.length)}for(let e=1;e<r.length;e++)r[e].depends_on=r.slice(0,e).map(e=>e.id);return r},Je=(e,t)=>{let n=qe(Array.isArray(t.sections)?t.sections:[],e.draftText);if(n.length===0)return;let r=e.draftSegments,i=Math.min(r.length,n.length);for(let e=0;e<i;e++)if(r[e]?.id!==n[e]?.id){i=e;break}let a=new Map;for(let e=0;e<n.length;e++)a.set(n[e].id,e);let o=new Set,s=[],c=!1;for(let t of e.acceptanceOrder){let e=r[t];if(!e)continue;let n=a.get(e.id);n!==void 0&&(o.add(n),s.push(n),n>=i&&(c=!0))}e.acceptedSegmentIndices=o,e.acceptanceOrder=s,e.hasStaleAccepted=c||e.hasStaleAccepted&&o.size>0;for(let[t]of Array.from(e.activeEnhanceRequestIdsBySegmentId.entries())){let n=a.get(t);(n===void 0||n>=i)&&(We(e,t),e.enhancedTextBySegmentId.delete(t))}L(e,e.draftText,n,e.draftIsStale);for(let t of n)!e.activeEnhanceRequestIdsBySegmentId.has(t.id)&&!e.enhancedTextBySegmentId.has(t.id)&&Ge(e,t,n)},Ye=e=>{G(e),e.pendingGhostText=``,e.ghostStreamComplete=!1,e.activeBindRequestId=void 0,e.activeSegmentRequestId=void 0,e.acceptedSegmentIndices=new Set,e.acceptanceOrder=[],e.focusedSegmentIndex=void 0,e.hasStaleAccepted=!1,e.bindHistoryWarning=void 0,K(e),k(e)},Xe=e=>{if(!(e instanceof KeyboardEvent)||e.isComposing)return;let t=d,n=t!==void 0&&t.element===e.currentTarget;if(e.key===`Escape`){if(n&&t&&t.activeBindRequestId){e.preventDefault(),e.stopPropagation(),J(t);return}C();return}if(!(!n||!t)){if(e.key===`Tab`){e.preventDefault(),e.stopPropagation(),e.shiftKey?ze(t):Re(t);return}if(e.key===`Enter`&&(e.metaKey||e.ctrlKey)){e.preventDefault(),e.stopPropagation(),Ue(t);return}if(e.key===`Enter`&&t.ghostStreamComplete&&t.pendingGhostText.length>0){e.preventDefault(),e.stopPropagation(),Ke(t);return}}},Ze=e=>{d&&d.element!==e&&(K(d),k(d));let t=d;t?.element===e&&(t.activeBindRequestId&&J(t),K(t),t.draftIsStale=!0,t.draftOverlayElement&&S(t.draftOverlayElement,!0),t.acceptedSegmentIndices.size>0&&(t.hasStaleAccepted=!0,I(t)),E(e));let n=new AbortController,r=t?.element===e&&t?{element:e,status:`TYPING`,debounceTimerId:void 0,abortController:n,draftOverlayScrollListener:t.draftOverlayScrollListener,draftOverlayElement:t.draftOverlayElement,draftOverlayContentElement:t.draftOverlayContentElement,draftOverlaySegmentRootElement:t.draftOverlaySegmentRootElement,draftOverlayResizeObserver:t.draftOverlayResizeObserver,draftIsStale:t.draftIsStale,draftRenderMode:t.draftRenderMode,draftText:t.draftText,draftSegments:t.draftSegments,acceptedSegmentIndices:t.acceptedSegmentIndices,acceptanceOrder:t.acceptanceOrder,focusedSegmentIndex:t.focusedSegmentIndex,hasStaleAccepted:t.hasStaleAccepted,activeBindRequestId:t.activeBindRequestId,activeSegmentRequestId:t.activeSegmentRequestId,activeEnhanceRequestIdsBySegmentId:new Map(t.activeEnhanceRequestIdsBySegmentId),enhancedTextBySegmentId:new Map(t.enhancedTextBySegmentId),ghostPanelElement:t.ghostPanelElement,ghostPanelBodyElement:t.ghostPanelBodyElement,ghostPanelStatusElement:t.ghostPanelStatusElement,ghostPanelLayoutListener:t.ghostPanelLayoutListener,bindPhase:t.bindPhase,bindHistoryWarning:void 0,bindRecoveryObserver:t.bindRecoveryObserver,bindRecoveryTimeoutId:t.bindRecoveryTimeoutId,pendingGhostText:t.pendingGhostText,ghostStreamComplete:t.ghostStreamComplete}:{element:e,status:`TYPING`,debounceTimerId:void 0,abortController:n,draftOverlayScrollListener:void 0,draftOverlayElement:void 0,draftOverlayContentElement:void 0,draftOverlaySegmentRootElement:void 0,draftOverlayResizeObserver:void 0,draftIsStale:!1,draftRenderMode:void 0,draftText:``,draftSegments:[],acceptedSegmentIndices:new Set,acceptanceOrder:[],focusedSegmentIndex:void 0,hasStaleAccepted:!1,activeBindRequestId:void 0,activeSegmentRequestId:void 0,activeEnhanceRequestIdsBySegmentId:new Map,enhancedTextBySegmentId:new Map,ghostPanelElement:void 0,ghostPanelBodyElement:void 0,ghostPanelStatusElement:void 0,ghostPanelLayoutListener:void 0,bindPhase:`IDLE`,bindHistoryWarning:void 0,bindRecoveryObserver:void 0,bindRecoveryTimeoutId:void 0,pendingGhostText:``,ghostStreamComplete:!1};Pe(r),r.debounceTimerId=window.setTimeout(()=>{(async()=>{if(n.signal.aborted)return;let t=v($e(e)),i=me(t),a=await ie(t);if(n.signal.aborted)return;r.debounceTimerId=void 0,r.abortController=void 0,r.status=`SEGMENTING`;let o=r.draftSegments,s=Math.min(o.length,i.length);for(let e=0;e<s;e++)if(o[e]?.id!==i[e]?.id){s=e;break}let c=new Map;for(let e=0;e<i.length;e++)c.set(i[e].id,e);let l=new Set,u=[],f=!1;for(let e of r.acceptanceOrder){let t=o[e];if(!t)continue;let n=c.get(t.id);n!==void 0&&(l.add(n),u.push(n),n>=s&&(f=!0))}r.acceptedSegmentIndices=l,r.acceptanceOrder=u,r.hasStaleAccepted=f||r.hasStaleAccepted&&l.size>0;for(let[e]of Array.from(r.activeEnhanceRequestIdsBySegmentId.entries())){let t=c.get(e);(t===void 0||t>=s)&&(We(r,e),r.enhancedTextBySegmentId.delete(e))}let p;if(i.length>0){for(let e=0;e<i.length;e++)if(!l.has(e)){p=e;break}p===void 0&&(p=0)}r.focusedSegmentIndex=p,r.activeSegmentRequestId=a.requestId,d=r,a.jwt?$(a):console.warn(`[content] skipping SEGMENT dispatch because no JWT was available`),L(r,t,i,!1)})().catch(e=>{console.warn(`Failed to send debounced extraction to background`,e)})},400),d=r},Qe=e=>{!(e.currentTarget instanceof HTMLTextAreaElement)&&!(e.currentTarget instanceof HTMLElement)||Ze(e.currentTarget)},$e=e=>Y(e)?e.value:pe(e),Y=e=>e instanceof HTMLTextAreaElement,et=e=>e instanceof HTMLElement&&e.matches(`[contenteditable]:not([contenteditable="false"])`)&&e.isContentEditable,X=e=>Y(e)||et(e),Z=t=>t.getAttribute(e)===r,tt=t=>{Z(t)||(t.addEventListener(`input`,Qe),t.addEventListener(`mousemove`,Fe),t.addEventListener(`mouseleave`,Ie),t.addEventListener(`blur`,Le),t.addEventListener(`keydown`,Xe),t.setAttribute(e,r))},nt=e=>{if(e.nodeType!==Node.ELEMENT_NODE&&e.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;let t=e;e instanceof Element&&X(e)&&!Z(e)&&tt(e);for(let e of t.querySelectorAll(`textarea, [contenteditable]:not([contenteditable='false'])`))X(e)&&!Z(e)&&tt(e)},rt=()=>{document.body&&nt(document.body)},it=()=>{if(!document.body)return;let t=new MutationObserver(t=>{if(d?.element&&!d.element.isConnected)if(d.bindPhase===`BINDING`||d.bindPhase===`COMPLETE`){let e=U(d,t);e?(H(d),W(d,e)):Te(d)}else K(d),J(d),G(d),k(d);f?.element&&!f.element.isConnected&&k(f);for(let n of t){if(n.type===`attributes`){if(n.attributeName===e)continue;continue}if(n.type===`childList`)for(let e of n.addedNodes)(e.nodeType===Node.ELEMENT_NODE||e.nodeType===Node.DOCUMENT_FRAGMENT_NODE)&&nt(e)}});return t.observe(document.body,{attributes:!0,attributeFilter:[e],childList:!0,subtree:!0}),t},at=e=>{if(typeof e!=`object`||!e)return;let t=e,n=typeof t.type==`string`?t.type:``,r=typeof t.requestId==`string`?t.requestId:``;if(n.length===0||r.length===0)return;let i=d;if(!i)return;if(i.activeBindRequestId===r){if(n===`token`&&typeof t.data==`string`){Ee(i,t.data);return}if(n===`done`){De(i);return}if(n===`warning`&&typeof t.message==`string`){Oe(i,t.message);return}if(n===`error`){ke(i,typeof t.message==`string`?t.message:`Bind stream failed`);return}return}if(i.activeSegmentRequestId===r){if(n===`segment`){i.activeSegmentRequestId=void 0,typeof t.data==`object`&&t.data!==null&&Je(i,t.data);return}if(n===`error`){i.activeSegmentRequestId=void 0,i.draftOverlayElement&&S(i.draftOverlayElement,!0),console.warn(`[content] SEGMENT request failed:`,t.message);return}return}let a;for(let[e,t]of i.activeEnhanceRequestIdsBySegmentId.entries())if(t===r){a=e;break}if(a!==void 0){if(n===`token`&&typeof t.data==`string`){Ae(i,a,t.data);return}if(n===`done`){je(i,a);return}if(n===`error`){Me(i,a,typeof t.message==`string`?t.message:`Enhance failed`);return}return}},ot=e=>{e.onMessage.addListener(at),e.onDisconnect.addListener(()=>{g=null,d&&(d.activeEnhanceRequestIdsBySegmentId.clear(),E(d.element))})},Q=()=>(g===null&&(g=chrome.runtime.connect({name:`insta_prompt_bridge`}),ot(g)),g),$=e=>{try{Q().postMessage(e)}catch{g=null}};rt(),it(),Q()}}),i={debug:(...e)=>([...e],void 0),log:(...e)=>([...e],void 0),warn:(...e)=>([...e],void 0),error:(...e)=>([...e],void 0)},a=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome,o=class e extends Event{static EVENT_NAME=s(`wxt:locationchange`);constructor(t,n){super(e.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function s(e){return`${a?.runtime?.id}:content:${e}`}var c=typeof globalThis.navigation?.addEventListener==`function`;function l(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),c?globalThis.navigation.addEventListener(`navigate`,e=>{let n=new URL(e.destination.url);n.href!==t.href&&(window.dispatchEvent(new o(n,t)),t=n)},{signal:e.signal}):e.setInterval(()=>{let e=new URL(location.href);e.href!==t.href&&(window.dispatchEvent(new o(e,t)),t=e)},1e3))}}}var u=class e{static SCRIPT_STARTED_MESSAGE_TYPE=s(`wxt:content-script-started`);id;abortController;locationWatcher=l(this);constructor(e,t){this.contentScriptName=e,this.options=t,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(e){return this.abortController.abort(e)}get isInvalid(){return a.runtime?.id??this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(e){return this.signal.addEventListener(`abort`,e),()=>this.signal.removeEventListener(`abort`,e)}block(){return new Promise(()=>{})}setInterval(e,t){let n=setInterval(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearInterval(n)),n}setTimeout(e,t){let n=setTimeout(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearTimeout(n)),n}requestAnimationFrame(e){let t=requestAnimationFrame((...t)=>{this.isValid&&e(...t)});return this.onInvalidated(()=>cancelAnimationFrame(t)),t}requestIdleCallback(e,t){let n=requestIdleCallback((...t)=>{this.signal.aborted||e(...t)},t);return this.onInvalidated(()=>cancelIdleCallback(n)),n}addEventListener(e,t,n,r){t===`wxt:locationchange`&&this.isValid&&this.locationWatcher.run(),e.addEventListener?.(t.startsWith(`wxt:`)?s(t):t,n,{...r,signal:this.signal})}notifyInvalidated(){this.abort(`Content script context invalidated`),i.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(e.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:e.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},`*`)}verifyScriptStartedEvent(e){let t=e.detail?.contentScriptName===this.contentScriptName,n=e.detail?.messageId===this.id;return t&&!n}listenForNewerScripts(){let t=e=>{!(e instanceof CustomEvent)||!this.verifyScriptStartedEvent(e)||this.notifyInvalidated()};document.addEventListener(e.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(e.SCRIPT_STARTED_MESSAGE_TYPE,t))}},d={debug:(...e)=>([...e],void 0),log:(...e)=>([...e],void 0),warn:(...e)=>([...e],void 0),error:(...e)=>([...e],void 0)};return(async()=>{try{let{main:e,...t}=r;return await e(new u(`content`,t))}catch(e){throw d.error(`The content script "content" crashed on startup!`,e),e}})()})();
content;

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

---

## Fix Phases

> Appended 2026-05-28. BUG-1.1 is a config-only action (Supabase dashboard → Auth → URL Configuration → set Site URL to production domain). It is not a code phase.

---

### Phase 1 — Popup + backend isolated fixes

**Bugs:** BUG-1.2, BUG-3.1  
**Files touched:** `extension/src/popup/App.tsx`, `backend/src/services/rateLimit.ts`  
**Risk:** Low — no content script, no state machine, no MV3 boundary changes.

| Bug | Change |
|-----|--------|
| BUG-1.2 | Add `decodeJwtEmail(token)` helper to `App.tsx`. Decode JWT payload via `atob(token.split('.')[1])`, extract `email` field. Render it as muted subheading in the signed-in header row. |
| BUG-3.1 | Change `FREE_DAILY_LIMIT = 30` → `100` in `backend/src/services/rateLimit.ts` line 4. One token change. |

---

### Phase 2 — Content script: behavioral gating + input discovery + pause button

**Bugs:** BUG-1.3, BUG-2.1 + new: pause enhancements feature  
**Files touched:** `extension/src/content/index.ts`, `extension/src/popup/App.tsx`, `extension/src/popup/components/PauseToggle.tsx` (new)  
**Risk:** Low-medium — targeted guard addition and selector extension. No rendering or state machine changes.

| Item | Change |
|------|--------|
| BUG-1.3 | In the debounced async callback (around line 2454), add: if no JWT from `resolveBridgeContext()`, skip `renderDraftSegments` call and return early. Currently the overlay renders even with no JWT — only the SEGMENT dispatch is gated. |
| BUG-2.1 | Extend `isValidInput` (line 2499) to accept `HTMLInputElement` where `type` is `"text"` or `"search"`. Update `scanNodeForInputs` CSS selector (line 2534) to include `input[type="text"], input[type="search"]`. Add `isValidInput` check for the matched elements. |
| Pause button | Add `PauseToggle` component to signed-in popup view. Writes `promptcompiler.paused: boolean` to `chrome.storage.sync`. Content script reads this key in the debounced callback — if `true`, skip `renderDraftSegments` and SEGMENT dispatch. Pause state persists across popup opens (storage.sync). Button is placed between `ModeToggle` and `AccountStatus` in the signed-in layout. |

---

### Phase 3 — Content script: rendering, popover, legend, bind feedback

**Bugs:** BUG-2.2, BUG-2.3, BUG-4.1  
**Files touched:** `extension/src/content/index.ts`  
**Risk:** Medium — touches rendering functions and creates new DOM in shadow root.

| Bug | Change |
|-----|--------|
| BUG-2.2 | In `positionDraftHoverPreview` (line 498), replace `anchorRect.left` and `anchorRect.bottom` with `hoverState.clientX` and `hoverState.clientY + 16` for placement. Retain viewport-edge flip logic but flip relative to cursor Y. |
| BUG-2.3 | After overlay panel header creation, add a compact legend row (right-aligned) showing the 6 clause-type color swatches. Each swatch is a `<span>` with `display:inline-block; width:8px; height:8px; border-radius:50%; background:<color>` and a text label. |
| BUG-4.1 | Replace `logBindGateBlocked` console-only warn with a ghost panel hint: call `ensureGhostPanel(state)`, show status `"Tab to accept · ⌘/Ctrl+Enter to bind"` and body text describing why bind is blocked (no accepted sections, stale accepted, or already binding). Auto-dismiss after 2s. |
