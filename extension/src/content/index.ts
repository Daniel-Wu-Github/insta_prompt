import { GOAL_TYPE_VALUES, MODE_VALUES, type GoalType, type Mode, type SegmentRequest } from "../../../shared/contracts";
import { brand, clauseAccent, clauseEncoding, motionPreset, rgba, sectionState, shadowBaseCss, transition as motionTransition, zIndex } from "../../../shared/design";
import { CANONICAL_ORDER_BY_GOAL_TYPE, GOAL_TYPES_IN_CANONICAL_ORDER } from "../../../packages/core";

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main(ctx) {
		const BRIDGE_PORT_NAME = "insta_prompt_bridge";
		const SETTINGS_STORAGE_KEY = "promptcompiler.settings";
		const PAUSE_STORAGE_KEY = "promptcompiler.paused";
		const CLAUSE_ORDERING_STORAGE_KEY = "promptcompiler.clauseOrdering";
		const INSTRUMENTED_ATTRIBUTE = "data-insta-instrumented";
		const INSTRUMENTED_VALUE = "true";
		// Idempotency marker source of truth. React (ChatGPT, Claude.ai, etc.) strips
		// unknown HTML attributes during reconciliation, so an attribute-based check
		// (BUG-REACT) gives false negatives — re-instrumenting live inputs, stacking
		// duplicate listeners, and firing the unsupported-input toast on supported
		// inputs. A WeakSet keyed on the element survives reconciliation and is
		// GC-safe. The attribute is still written, but only for DevTools visibility.
		const _instrumentedElements = new WeakSet<Element>();
		// Per-element teardown registry (dom-memory-management Rule 3). Every listener and
		// observer attached in markInstrumented registers its disposer here so element
		// removal (SPA churn) or content-script invalidation can fully tear down — no
		// orphaned MutationObserver pinning a detached input in memory (AUD-10 / G-3).
		const _instrumentCleanups = new Map<Element, Array<() => void>>();
		const DEBOUNCE_DELAY_MS = 400;
		const DEFAULT_BRIDGE_MODE: Mode = "balanced";
		const BRIDGE_FALLBACK_JWT = "promptcompiler-dev-jwt";
		const SESSION_EXPIRED_NOTICE = "Session expired — please reopen the extension";
		const DRAFT_HIGHLIGHT_NAME = "insta-prompt-draft-highlight";
		const DRAFT_HIGHLIGHT_STYLE_ID = "insta-prompt-draft-highlight-style";
		// AUD-2: these are now derived from the portable design tokens (shared/design)
		// instead of inline magic values. Values are unchanged — the token set was
		// authored to match exactly — so this is behavior-preserving.
		const DRAFT_OVERLAY_Z_INDEX = String(zIndex.overlayCeiling);
		const DRAFT_STALE_OPACITY = String(sectionState.stale.opacity);
		const DRAFT_ACCEPTED_OPACITY = String(sectionState.accepted.opacity);
		const DRAFT_ACCEPTED_STALE_OPACITY = String(sectionState.acceptedStale.opacity);
		const DRAFT_UNDERLINE_COLOR = rgba(brand.accent, 0.95);
		// BIND-UX-1: Tab now *reviews* (cycles focus) instead of accepting. Acceptance is
		// the explicit Enter act, and Esc leaves review mode so Enter sends normally again.
		const REVIEW_HINT = "Tab to review · Enter to accept · ⌘/Ctrl+Enter to bind · Esc to exit";
		// CANONICAL_ORDER_BY_GOAL_TYPE is now imported from packages/core (Track C1) —
		// one slot-definition source shared across surfaces (canonical-clause-ordering).

		// AUD-2: clause colors now come from the LOCKED design tokens (shared/design
		// `clauseAccent`) rather than inline literals. This reconciles three colors that
		// had drifted from the canonical palette (tech_stack, constraint, output_format)
		// to their documented values — an intentional design-system alignment, not a
		// regression. action/context/edge_case were already canonical.
		const GOAL_TYPE_PALETTE = {
			action: { cssVariable: "--insta-goal-type-action-color", color: clauseAccent.action },
			tech_stack: { cssVariable: "--insta-goal-type-tech-stack-color", color: clauseAccent.tech_stack },
			constraint: { cssVariable: "--insta-goal-type-constraint-color", color: clauseAccent.constraint },
			output_format: { cssVariable: "--insta-goal-type-output-format-color", color: clauseAccent.output_format },
			context: { cssVariable: "--insta-goal-type-context-color", color: clauseAccent.context },
			edge_case: { cssVariable: "--insta-goal-type-edge-case-color", color: clauseAccent.edge_case },
		} as const satisfies Record<GoalType, { cssVariable: string; color: string }>;


		type InputLifecycleState = "IDLE" | "TYPING" | "SEGMENTING";
		type DraftRenderMode = "highlight" | "overlay";
		type DraftHoverPreviewStatus = "loading" | "ready" | "stale";
		// "entry" = clause number by left-to-right position in the text (default, matches
		// what the user sees and how Tab cycles). "canonical" = clause's slot in the final
		// compiled prompt (context=1 … edge_case=6); a display-only preference set in the popup.
		type ClauseOrdering = "entry" | "canonical";

		interface DraftSegment {
			id: string;
			depends_on: string[];
			start: number;
			end: number;
			text: string;
			goalType: GoalType;
		}

		interface ActiveInputState {
			element: HTMLTextAreaElement | HTMLElement;
			status: InputLifecycleState;
			debounceTimerId: number | undefined;
			abortController: AbortController | undefined;
			draftOverlayScrollListener: EventListener | undefined;
			draftOverlayElement: HTMLDivElement | undefined;
			draftOverlayContentElement: HTMLDivElement | undefined;
			draftOverlaySegmentRootElement: HTMLDivElement | undefined;
			draftOverlayResizeObserver: ResizeObserver | undefined;
			draftIsStale: boolean;
			draftRenderMode: DraftRenderMode | undefined;
			draftText: string;
			draftSegments: DraftSegment[];
			acceptedSegmentIndices: Set<number>;
			acceptanceOrder: number[];
			focusedSegmentIndex: number | undefined;
			hasStaleAccepted: boolean;
			activeBindRequestId: string | undefined;
			activeSegmentRequestId: string | undefined;
			activeEnhanceRequestIdsBySegmentId: Map<string, string>;
			enhancedTextBySegmentId: Map<string, string>;
			ghostPanelElement: HTMLDivElement | undefined;
			ghostPanelBodyElement: HTMLDivElement | undefined;
			ghostPanelStatusElement: HTMLDivElement | undefined;
			ghostPanelLayoutListener: EventListener | undefined;
			bindPhase: "IDLE" | "BINDING" | "COMPLETE";
			bindHistoryWarning: string | undefined;
			bindRecoveryObserver: MutationObserver | undefined;
			bindRecoveryTimeoutId: number | undefined;
			pendingGhostText: string;
			ghostStreamComplete: boolean;
		}

		interface DraftHoverPreviewState {
			sourceElement: HTMLTextAreaElement | HTMLElement;
			segment: DraftSegment;
			// Position of `segment` in the draftSegments array (0-based, entry order).
			segmentIndex: number;
			// Total number of clauses in the current draft, for the "Clause X of N" label.
			totalSegments: number;
			status: DraftHoverPreviewStatus;
			containerElement: HTMLDivElement;
			shadowRoot: ShadowRoot;
			panelElement: HTMLDivElement;
			statusElement: HTMLDivElement;
			metaElement: HTMLDivElement;
			bodyElement: HTMLDivElement;
			readyTimerId: number | undefined;
			anchorRect: DOMRectReadOnly;
			clientX: number;
			clientY: number;
		}

		const BLOCK_LEVEL_TAGS = new Set([
			"ADDRESS",
			"ARTICLE",
			"ASIDE",
			"BLOCKQUOTE",
			"DIV",
			"DL",
			"DT",
			"DD",
			"FIELDSET",
			"FIGCAPTION",
			"FIGURE",
			"FOOTER",
			"FORM",
			"H1",
			"H2",
			"H3",
			"H4",
			"H5",
			"H6",
			"HEADER",
			"HR",
			"LI",
			"MAIN",
			"NAV",
			"OL",
			"P",
			"PRE",
			"SECTION",
			"TABLE",
			"TBODY",
			"TD",
			"TH",
			"TR",
			"UL",
		]);

		let activeInputState: ActiveInputState | undefined;
		let renderedDraftOverlayState: ActiveInputState | undefined;
		let activeDraftHoverPreviewState: DraftHoverPreviewState | undefined;
		let lastDraftHoverPoint: { clientX: number; clientY: number } | undefined;
		let draftOverlaySyncListenersInstalled = false;
		// Display-only preference, read from chrome.storage.sync and kept fresh via the
		// storage.onChanged listener below. Defaults to "entry" until the first read resolves.
		// Never sent over the bridge — it only affects the clause number shown in the hover popover.
		let clauseOrderingPreference: ClauseOrdering = "entry";
		// Null when the SW port has been killed and not yet reconnected.
		let _bridgePort: chrome.runtime.Port | null = null;

		const isBlockLevelElement = (element: Element): boolean => {
			return BLOCK_LEVEL_TAGS.has(element.tagName);
		};

		const normalizeDraftText = (text: string): string => {
			return text.replace(/\r\n?/g, "\n");
		};

		const isModeValue = (value: unknown): value is Mode => {
			return typeof value === "string" && MODE_VALUES.includes(value as Mode);
		};

		const isGoalTypeValue = (value: unknown): value is GoalType => {
			return typeof value === "string" && GOAL_TYPE_VALUES.includes(value as GoalType);
		};

		const extractBridgeJwtCandidate = (value: unknown): string | undefined => {
			if (typeof value === "string") {
				const trimmedValue = value.trim();
				return trimmedValue.length > 0 ? trimmedValue : undefined;
			}

			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				return undefined;
			}

			const record = value as Record<string, unknown>;

			for (const key of ["token", "accessToken", "access_token", "jwt"] as const) {
				const candidateValue = record[key];
				if (typeof candidateValue !== "string") {
					continue;
				}

				const trimmedCandidate = candidateValue.trim();
				if (trimmedCandidate.length > 0) {
					return trimmedCandidate;
				}
			}

			for (const key of ["session", "auth", "data"] as const) {
				const nestedCandidate = extractBridgeJwtCandidate(record[key]);
				if (nestedCandidate) {
					return nestedCandidate;
				}
			}

			return undefined;
		};

		const isStorageAccessRestrictedError = (error: unknown): boolean => {
			const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
			return (
				msg.includes("Access to storage is not allowed") ||
				msg.includes("Extension context invalidated")
			);
		};

		const readSessionStorageSnapshot = async (): Promise<Record<string, unknown>> => {
			try {
				// chrome.storage.session can be undefined in some content-script contexts
				// (e.g. after an extension reload with the old script still running).
				if (typeof chrome?.storage?.session?.get !== "function") {
					return {};
				}
				return await chrome.storage.session.get(null);
			} catch (error) {
				if (isStorageAccessRestrictedError(error)) {
					return {};
				}

				throw error;
			}
		};

		const readSyncStorageSnapshot = async (): Promise<Record<string, unknown>> => {
			try {
				return await chrome.storage.sync.get(null);
			} catch (error) {
				if (isStorageAccessRestrictedError(error)) {
					return {};
				}

				throw error;
			}
		};

		const AUTH_STORAGE_KEY = "promptcompiler.auth";

		const readLocalStorageSnapshot = async (): Promise<Record<string, unknown>> => {
			try {
				return await chrome.storage.local.get(null);
			} catch (error) {
				if (isStorageAccessRestrictedError(error)) {
					return {};
				}
				throw error;
			}
		};

		const isClauseOrdering = (value: unknown): value is ClauseOrdering => {
			return value === "entry" || value === "canonical";
		};

		// Refresh the cached clause-ordering preference from sync storage. Called once on
		// startup and again whenever the popup writes a new value (via storage.onChanged).
		const refreshClauseOrderingPreference = async (): Promise<void> => {
			const syncSnapshot = await readSyncStorageSnapshot();
			const stored = syncSnapshot[CLAUSE_ORDERING_STORAGE_KEY];
			clauseOrderingPreference = isClauseOrdering(stored) ? stored : "entry";
		};

		const resolveBridgeContext = async (): Promise<{ mode: Mode; jwt: string | null; paused: boolean }> => {
			const syncSnapshot = await readSyncStorageSnapshot();
			const localSnapshot = await readLocalStorageSnapshot();
			const sessionSnapshot = await readSessionStorageSnapshot();

			const paused = syncSnapshot[PAUSE_STORAGE_KEY] === true;

			let mode: Mode = DEFAULT_BRIDGE_MODE;
			for (const snapshot of [syncSnapshot, localSnapshot]) {
				const storedSettings = snapshot[SETTINGS_STORAGE_KEY];
				if (typeof storedSettings === "object" && storedSettings !== null && !Array.isArray(storedSettings)) {
					const storedMode = (storedSettings as { mode?: unknown }).mode;
					if (isModeValue(storedMode)) {
						mode = storedMode;
						break;
					}
				}
			}

			// Check the canonical auth key written by App.tsx on login.
			const storedAuth = localSnapshot[AUTH_STORAGE_KEY];
			if (typeof storedAuth === "object" && storedAuth !== null && !Array.isArray(storedAuth)) {
				const accessToken = (storedAuth as Record<string, unknown>).access_token;
				if (typeof accessToken === "string" && accessToken.trim().length > 0) {
					return { mode, jwt: accessToken.trim(), paused };
				}
			}

			// Fall back to broad storage scan for dev/legacy tokens.
			for (const snapshot of [sessionSnapshot, localSnapshot]) {
				for (const candidate of Object.values(snapshot)) {
					const jwt = extractBridgeJwtCandidate(candidate);
					if (jwt) {
						return { mode, jwt, paused };
					}
				}
			}

			return { mode, jwt: null, paused };
		};

		const buildSegmentBridgeMessage = async (normalizedText: string): Promise<{
			verb: "SEGMENT";
			jwt: string | null;
			requestId: string;
			payload: SegmentRequest;
			paused: boolean;
		}> => {
			const { mode, jwt, paused } = await resolveBridgeContext();

			return {
				verb: "SEGMENT",
				jwt,
				paused,
				requestId: crypto.randomUUID(),
				payload: {
					segments: [normalizedText],
					mode,
				},
			};
		};

		const applyDraftGoalTypePalette = (target: HTMLDivElement): void => {
			for (const goalType of GOAL_TYPE_VALUES) {
				const paletteEntry = GOAL_TYPE_PALETTE[goalType];
				target.style.setProperty(paletteEntry.cssVariable, paletteEntry.color);
			}
		};

		const applyDraftOverlayFreshness = (target: HTMLDivElement, isStale: boolean): void => {
			target.dataset.draftStale = isStale ? "true" : "false";
			target.style.opacity = isStale ? DRAFT_STALE_OPACITY : "1";
		};

		const getDraftHoverPreviewBodyText = (segment: DraftSegment): string => {
			const readableGoalType = segment.goalType.replace(/_/g, " ");
			return `${readableGoalType} preview: ${segment.text}`;
		};

		const sortByCanonicalOrder = <T extends { goal_type: GoalType }>(sections: readonly T[]): T[] => {
			return [...sections].sort((left, right) => {
				const leftOrder = CANONICAL_ORDER_BY_GOAL_TYPE[left.goal_type];
				const rightOrder = CANONICAL_ORDER_BY_GOAL_TYPE[right.goal_type];
				return leftOrder - rightOrder;
			});
		};

		const isSameDraftSegment = (left: DraftSegment, right: DraftSegment): boolean => {
			return left.start === right.start && left.end === right.end && left.text === right.text && left.goalType === right.goalType;
		};

		// Human-readable labels for goal types, used in the hover-popover header and the
		// persistent overlay legend HUD. Kept in canonical bind order where iterated.
		const GOAL_TYPE_LEGEND_LABEL: Record<GoalType, string> = {
			context: "Context",
			tech_stack: "Tech stack",
			constraint: "Constraint",
			action: "Action",
			output_format: "Output format",
			edge_case: "Edge case",
		};

		// GOAL_TYPES_IN_CANONICAL_ORDER is imported from packages/core (Track C1).

		// Computes the clause label shown in the hover popover header for a given segment,
		// honoring the user's clause-ordering preference.
		//   - "entry":     "Clause 3 of 5" — 1-based position in text, with total count.
		//   - "canonical": "Slot 4 of 6"   — the clause's fixed position in the compiled
		//                  prompt (context=1 … edge_case=6). No live count, since multiple
		//                  clauses can share a slot.
		const formatClauseLabel = (segmentIndex: number, totalSegments: number, goalType: GoalType): string => {
			if (clauseOrderingPreference === "canonical") {
				return `Slot ${CANONICAL_ORDER_BY_GOAL_TYPE[goalType]} of ${GOAL_TYPES_IN_CANONICAL_ORDER.length}`;
			}
			return `Clause ${segmentIndex + 1} of ${totalSegments}`;
		};

		const createDraftHoverPopoverShell = (): {
			containerElement: HTMLDivElement;
			panelElement: HTMLDivElement;
			statusElement: HTMLDivElement;
			metaElement: HTMLDivElement;
			bodyElement: HTMLDivElement;
		} => {
			const containerElement = document.createElement("div");
			containerElement.setAttribute("aria-hidden", "true");
			containerElement.dataset.instaDraftHoverPopover = "true";
			containerElement.style.position = "fixed";
			containerElement.style.left = "0px";
			containerElement.style.top = "0px";
			containerElement.style.zIndex = DRAFT_OVERLAY_Z_INDEX;
			containerElement.style.pointerEvents = "none";
			containerElement.style.contain = "layout paint style";

			const shadowRoot = containerElement.attachShadow({ mode: "open" });
			const styleElement = document.createElement("style");
			styleElement.textContent = `${shadowBaseCss("dark")}
:host {
	all: initial;
	position: fixed;
	left: 0;
	top: 0;
	z-index: ${DRAFT_OVERLAY_Z_INDEX};
	pointer-events: none;
	contain: layout paint style;
}

[data-draft-hover-panel] {
	all: initial;
	display: block;
	box-sizing: border-box;
	max-width: min(320px, calc(100vw - 24px));
	border-radius: 12px;
	border: 1px solid var(--pc-surface-border);
	background: rgba(15, 23, 42, 0.98);
	color: var(--pc-text-primary);
	box-shadow: var(--pc-shadow-panel);
	padding: 10px 12px;
	font-family: var(--pc-font-family);
	font-size: 13px;
	line-height: 1.45;
	letter-spacing: 0;
	white-space: pre-wrap;
	pointer-events: none;
	user-select: none;
	-webkit-user-select: none;
	animation: ${motionPreset.floatIn};
}

[data-draft-hover-header] {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px 8px;
	margin-bottom: 6px;
}

[data-draft-hover-status] {
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: rgb(165, 180, 252);
	flex: 0 0 auto;
}

/* "Clause 3 of 5 · Action · 91%" — the per-clause metadata line. The goal-type
   token inside is colored inline to match the underline (the in-context legend). */
[data-draft-hover-meta] {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	letter-spacing: 0.02em;
	color: rgb(148, 163, 184);
	flex: 1 1 auto;
	min-width: 0;
}

[data-draft-hover-meta-sep] {
	color: rgb(71, 85, 105);
	flex: 0 0 auto;
}

[data-draft-hover-meta-type] {
	font-weight: 700;
	white-space: nowrap;
	flex: 0 0 auto;
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
`;

			const panelElement = document.createElement("div");
			panelElement.dataset.draftHoverPanel = "true";
			panelElement.dataset.state = "loading";
			panelElement.setAttribute("role", "tooltip");

			const headerElement = document.createElement("div");
			headerElement.dataset.draftHoverHeader = "true";

			const statusElement = document.createElement("div");
			statusElement.dataset.draftHoverStatus = "true";

			// Per-clause metadata ("Clause 3 of 5 · Action · 91%"). Populated in
			// renderDraftHoverPreview; the goal-type token is colored inline to match
			// the underline, which doubles as the in-context color legend.
			const metaElement = document.createElement("div");
			metaElement.dataset.draftHoverMeta = "true";

			headerElement.append(statusElement, metaElement);

			const bodyElement = document.createElement("div");
			bodyElement.dataset.draftHoverBody = "true";

			panelElement.append(headerElement, bodyElement);
			shadowRoot.append(styleElement, panelElement);
			getOverlayContainer().appendChild(containerElement);

			return { containerElement, panelElement, statusElement, metaElement, bodyElement };
		};

		const clearDraftHoverPreview = (options?: { preservePointer?: boolean }): void => {
			const hoverState = activeDraftHoverPreviewState;

			if (!hoverState) {
				if (!options?.preservePointer) {
					lastDraftHoverPoint = undefined;
				}
				return;
			}

			if (hoverState.readyTimerId !== undefined) {
				window.clearTimeout(hoverState.readyTimerId);
				hoverState.readyTimerId = undefined;
			}

			hoverState.containerElement.remove();
			activeDraftHoverPreviewState = undefined;

			if (!options?.preservePointer) {
				lastDraftHoverPoint = undefined;
			}
		};

		// Rebuilds the header meta line "Clause 3 of 5 · Action · 91%" for a hover state.
		// Built with createElement only (no innerHTML); the goal-type token is colored to
		// match the underline so the header doubles as the in-context color legend.
		const renderDraftHoverMeta = (hoverState: DraftHoverPreviewState): void => {
			const { metaElement, segment, segmentIndex, totalSegments } = hoverState;
			metaElement.textContent = "";

			const clauseLabel = document.createElement("span");
			clauseLabel.textContent = formatClauseLabel(segmentIndex, totalSegments, segment.goalType);

			const sep = document.createElement("span");
			sep.dataset.draftHoverMetaSep = "true";
			sep.textContent = "·";

			const typeLabel = document.createElement("span");
			typeLabel.dataset.draftHoverMetaType = "true";
			// S-VIS-3: lead the type with its glyph so the clause type reads without color.
			typeLabel.textContent = `${clauseEncoding[segment.goalType].glyph} ${GOAL_TYPE_LEGEND_LABEL[segment.goalType]}`;
			typeLabel.style.color = GOAL_TYPE_PALETTE[segment.goalType].color;

			metaElement.append(clauseLabel, sep, typeLabel);
		};

		const renderDraftHoverPreview = (hoverState: DraftHoverPreviewState): void => {
			const { statusElement, bodyElement, panelElement, segment, status } = hoverState;

			panelElement.dataset.state = status;
			renderDraftHoverMeta(hoverState);

			switch (status) {
				case "loading":
					statusElement.textContent = "Loading";
					bodyElement.textContent = "Loading preview...";
					break;
				case "stale":
					statusElement.textContent = "Stale";
					bodyElement.textContent = "This preview is outdated because the text changed.";
					break;
				case "ready": {
					statusElement.textContent = "Ready";
					const enhancedText = activeInputState?.enhancedTextBySegmentId.get(segment.id);
					bodyElement.textContent = enhancedText ?? getDraftHoverPreviewBodyText(segment);
					break;
				}
			}
		};

		const positionDraftHoverPreview = (hoverState: DraftHoverPreviewState): void => {
			// BUG-2.2: anchor the popover to the cursor (clientX/Y) rather than the clause
			// span's bounding box, so it tracks the mouse on long/wrapped clauses. The
			// span rect is still used as a fallback for the rare case where the pointer
			// coordinates have not been captured yet.
			const viewportPadding = 12;
			const estimatedWidth = 320;
			const estimatedHeight = hoverState.panelElement.getBoundingClientRect().height || 96;

			const anchorX = Number.isFinite(hoverState.clientX) ? hoverState.clientX : hoverState.anchorRect.left;
			const anchorY = Number.isFinite(hoverState.clientY) ? hoverState.clientY : hoverState.anchorRect.bottom;

			const clampedLeft = Math.max(viewportPadding, Math.min(anchorX, window.innerWidth - estimatedWidth - viewportPadding));
			// Offset below the cursor so the popover does not sit under the pointer; flip
			// above the cursor when there is not enough room below.
			const belowTop = anchorY + 18;
			const aboveTop = anchorY - estimatedHeight - 12;
			const shouldPlaceAbove = belowTop + estimatedHeight > window.innerHeight - viewportPadding && aboveTop >= viewportPadding;

			hoverState.containerElement.style.left = `${clampedLeft}px`;
			hoverState.containerElement.style.top = `${Math.max(viewportPadding, shouldPlaceAbove ? aboveTop : belowTop)}px`;
		};

		const scheduleDraftHoverPreviewReady = (hoverState: DraftHoverPreviewState): void => {
			if (hoverState.readyTimerId !== undefined) {
				window.clearTimeout(hoverState.readyTimerId);
			}

			hoverState.readyTimerId = window.setTimeout(() => {
				if (activeDraftHoverPreviewState !== hoverState || hoverState.status !== "loading") {
					return;
				}

				hoverState.readyTimerId = undefined;
				hoverState.status = "ready";
				renderDraftHoverPreview(hoverState);
				positionDraftHoverPreview(hoverState);
			}, 120);
		};

		const setDraftHoverPreviewStale = (sourceElement: HTMLTextAreaElement | HTMLElement): void => {
			if (!activeDraftHoverPreviewState || activeDraftHoverPreviewState.sourceElement !== sourceElement) {
				return;
			}

			if (activeDraftHoverPreviewState.readyTimerId !== undefined) {
				window.clearTimeout(activeDraftHoverPreviewState.readyTimerId);
				activeDraftHoverPreviewState.readyTimerId = undefined;
			}

			if (activeDraftHoverPreviewState.status !== "stale") {
				activeDraftHoverPreviewState.status = "stale";
				renderDraftHoverPreview(activeDraftHoverPreviewState);
				positionDraftHoverPreview(activeDraftHoverPreviewState);
			}
		};

		const findDraftHoverTargetAtPoint = (
			overlayState: ActiveInputState,
			clientX: number,
			clientY: number,
		): { segment: DraftSegment; segmentIndex: number; rect: DOMRect } | undefined => {
			const contentElement = overlayState.draftOverlayContentElement;
			if (!contentElement) {
				return undefined;
			}

			const segmentSpans = Array.from(contentElement.querySelectorAll("span[data-goal-type][data-segment-index]"));

			for (const segmentSpan of segmentSpans) {
				const rect = segmentSpan.getBoundingClientRect();
				if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
					continue;
				}

				const segmentIndex = Number.parseInt(segmentSpan.getAttribute("data-segment-index") ?? "", 10);
				if (!Number.isFinite(segmentIndex) || segmentIndex < 0 || segmentIndex >= overlayState.draftSegments.length) {
					continue;
				}

				const segment = overlayState.draftSegments[segmentIndex];
				if (!segment) {
					continue;
				}

				return { segment, segmentIndex, rect };
			}

			return undefined;
		};

		const syncDraftHoverPreviewFromPoint = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			clientX: number,
			clientY: number,
		): void => {
			const overlayState = renderedDraftOverlayState;
			if (!overlayState || overlayState.element !== sourceElement || !overlayState.draftOverlayContentElement) {
				clearDraftHoverPreview();
				return;
			}

			const hitTarget = findDraftHoverTargetAtPoint(overlayState, clientX, clientY);
			if (!hitTarget) {
				clearDraftHoverPreview();
				return;
			}

			lastDraftHoverPoint = { clientX, clientY };

			const isStale = overlayState.draftIsStale;
			const existingHoverState = activeDraftHoverPreviewState;

			if (existingHoverState && existingHoverState.sourceElement === sourceElement && isSameDraftSegment(existingHoverState.segment, hitTarget.segment)) {
				existingHoverState.anchorRect = hitTarget.rect;
				existingHoverState.clientX = clientX;
				existingHoverState.clientY = clientY;
				positionDraftHoverPreview(existingHoverState);

				if (isStale && existingHoverState.status !== "stale") {
					setDraftHoverPreviewStale(sourceElement);
				}

				return;
			}

			clearDraftHoverPreview({ preservePointer: true });

			const hoverState: DraftHoverPreviewState = {
				sourceElement,
				segment: hitTarget.segment,
				segmentIndex: hitTarget.segmentIndex,
				totalSegments: overlayState.draftSegments.length,
				status: isStale ? "stale" : "loading",
				containerElement: undefined as unknown as HTMLDivElement,
				shadowRoot: undefined as unknown as ShadowRoot,
				panelElement: undefined as unknown as HTMLDivElement,
				statusElement: undefined as unknown as HTMLDivElement,
				metaElement: undefined as unknown as HTMLDivElement,
				bodyElement: undefined as unknown as HTMLDivElement,
				readyTimerId: undefined,
				anchorRect: hitTarget.rect,
				clientX,
				clientY,
			};

			const hoverShell = createDraftHoverPopoverShell();
			hoverState.containerElement = hoverShell.containerElement;
			hoverState.shadowRoot = hoverShell.containerElement.shadowRoot as ShadowRoot;
			hoverState.panelElement = hoverShell.panelElement;
			hoverState.statusElement = hoverShell.statusElement;
			hoverState.metaElement = hoverShell.metaElement;
			hoverState.bodyElement = hoverShell.bodyElement;
			activeDraftHoverPreviewState = hoverState;

			renderDraftHoverPreview(hoverState);
			positionDraftHoverPreview(hoverState);

			if (hoverState.status === "loading") {
				// Use the timer fallback only when no ENHANCE stream is driving this segment.
				// If a stream is active the done-handler will transition to "ready" instead.
				if (!activeInputState?.activeEnhanceRequestIdsBySegmentId.has(hitTarget.segment.id)) {
					scheduleDraftHoverPreviewReady(hoverState);
				}
			}
		};

		const restoreDraftHoverPreviewFromLastPointer = (sourceElement: HTMLTextAreaElement | HTMLElement): void => {
			if (!lastDraftHoverPoint) {
				return;
			}

			syncDraftHoverPreviewFromPoint(sourceElement, lastDraftHoverPoint.clientX, lastDraftHoverPoint.clientY);
		};


		const extractContenteditableText = (element: HTMLElement): string => {
			const extractNodeText = (node: Node): string => {
				if (node.nodeType === Node.TEXT_NODE) {
					return node.textContent ?? "";
				}

				if (node.nodeType !== Node.ELEMENT_NODE) {
					return "";
				}

				const childElement = node as HTMLElement;

				if (childElement.tagName === "BR") {
					return "\n";
				}

				const childSeparator = childElement === element || isBlockLevelElement(childElement) ? "\n" : "";
				const childTexts: string[] = [];

				for (const childNode of childElement.childNodes) {
					const childText = extractNodeText(childNode);
					if (childText.length > 0) {
						childTexts.push(childText);
					}
				}

				return childTexts.join(childSeparator);
			};

			return extractNodeText(element);
		};

		const splitTextIntoDraftSegments = (text: string): DraftSegment[] => {
			const normalizedText = normalizeDraftText(text);
			const segments: DraftSegment[] = [];
			let segmentStart = 0;

			const pushSegment = (segmentEndExclusive: number): void => {
				const rawSegment = normalizedText.slice(segmentStart, segmentEndExclusive);
				const leadingWhitespace = rawSegment.match(/^\s*/) ? rawSegment.match(/^\s*/)?.[0].length ?? 0 : 0;
				const trailingWhitespace = rawSegment.match(/\s*$/) ? rawSegment.match(/\s*$/)?.[0].length ?? 0 : 0;
				const start = segmentStart + leadingWhitespace;
				const end = segmentEndExclusive - trailingWhitespace;

				if (start >= end) {
					return;
				}

				segments.push({
					id: `seg-${start}-${end}`,
					depends_on: [],
					start,
					end,
					text: normalizedText.slice(start, end),
					// Placeholder until the backend /segment response updates these fields.
					goalType: GOAL_TYPE_VALUES[0],
				});
			};

			for (let index = 0; index < normalizedText.length; index += 1) {
				const character = normalizedText[index];

				if (character === "\n") {
					pushSegment(index);
					segmentStart = index + 1;
					continue;
				}

				if (character === "." || character === "," || character === ";" || character === ":" || character === "!" || character === "?") {
					pushSegment(index + 1);
					segmentStart = index + 1;
				}
			}

			pushSegment(normalizedText.length);

			// Second pass: fill depends_on with all upstream segment IDs
			for (let i = 1; i < segments.length; i++) {
				segments[i]!.depends_on = segments.slice(0, i).map(s => s.id);
			}

			return segments;
		};

		const getDraftHighlightRegistry = (): { delete: (name: string) => boolean; set: (name: string, value: unknown) => unknown } | undefined => {
			if (typeof CSS === "undefined") {
				return undefined;
			}

			return (CSS as typeof CSS & { highlights?: { delete: (name: string) => boolean; set: (name: string, value: unknown) => unknown } }).highlights;
		};

		const getDraftHighlightConstructor = (): (new (...ranges: Range[]) => unknown) | undefined => {
			return (window as Window & { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
		};

		const ensureDraftHighlightStyle = (): void => {
			if (document.getElementById(DRAFT_HIGHLIGHT_STYLE_ID)) {
				return;
			}

			const styleElement = document.createElement("style");
			styleElement.id = DRAFT_HIGHLIGHT_STYLE_ID;
			styleElement.textContent = `
::highlight(${DRAFT_HIGHLIGHT_NAME}) {
	text-decoration-line: underline;
	text-decoration-color: ${DRAFT_UNDERLINE_COLOR};
	text-decoration-thickness: 2px;
	text-decoration-skip-ink: none;
	text-underline-offset: 2px;
}
`;

			(document.head ?? document.documentElement).appendChild(styleElement);
		};

		const canUseCustomHighlights = (): boolean => {
			return Boolean(getDraftHighlightRegistry() && getDraftHighlightConstructor());
		};

		const getOverlayContainer = (): HTMLElement => {
			return document.body ?? document.documentElement;
		};

		// ── Persistent overlay legend HUD (BUG-2.3) ───────────────────────────────
		// A small always-on color key anchored to the bottom-right of the active input
		// while underlines exist. It owns the "what do the colors mean" reference so the
		// hover popover can stay focused on the single clause under the cursor. Built with
		// createElement only and torn down with the overlay (dom-memory-management).


		const copyDraftOverlayStyles = (source: HTMLElement, target: HTMLDivElement): void => {
			const computedStyle = window.getComputedStyle(source);

			target.style.boxSizing = "border-box";
			target.style.font = computedStyle.font;
			target.style.fontFamily = computedStyle.fontFamily;
			target.style.fontSize = computedStyle.fontSize;
			target.style.fontStyle = computedStyle.fontStyle;
			target.style.fontWeight = computedStyle.fontWeight;
			target.style.fontStretch = computedStyle.fontStretch;
			target.style.borderRadius = computedStyle.borderRadius;
			target.style.fontKerning = computedStyle.fontKerning;
			target.style.fontVariant = computedStyle.fontVariant;
			target.style.fontFeatureSettings = computedStyle.fontFeatureSettings;
			target.style.fontVariationSettings = computedStyle.fontVariationSettings;
			target.style.lineHeight = computedStyle.lineHeight;
			target.style.letterSpacing = computedStyle.letterSpacing;
			target.style.wordSpacing = computedStyle.wordSpacing;
			target.style.textAlign = computedStyle.textAlign;
			target.style.textIndent = computedStyle.textIndent;
			target.style.textTransform = computedStyle.textTransform;
			target.style.direction = computedStyle.direction;
			target.style.whiteSpace = computedStyle.whiteSpace;
			target.style.wordBreak = computedStyle.wordBreak;
			target.style.overflowWrap = computedStyle.overflowWrap;
			// BUG-ALIGN: these are inherited, text-metric/wrap-affecting properties that the
			// `font` shorthand does NOT carry. Without them the mirror's glyph widths (and
			// therefore wrap points) drift from the host editor — e.g. ChatGPT enables
			// text-rendering: optimizeLegibility, which turns on kerning/ligatures. Set them
			// on the host so they inherit down to the content and segment-root layers.
			target.style.setProperty("tab-size", computedStyle.getPropertyValue("tab-size"));
			target.style.setProperty("text-rendering", computedStyle.getPropertyValue("text-rendering"));
			target.style.setProperty("font-optical-sizing", computedStyle.getPropertyValue("font-optical-sizing"));
			target.style.background = "transparent";
			target.style.color = "transparent";
			target.style.caretColor = "transparent";
			target.style.overflow = "hidden";
			target.style.border = "0";
			target.style.padding = "0";
			target.style.pointerEvents = "none";
			target.style.userSelect = "none";
			target.style.setProperty("-webkit-user-select", "none");
			target.style.setProperty("-webkit-text-fill-color", "transparent");
		};

		const clearDraftRendering = (state: ActiveInputState | undefined): void => {
			if (!state) {
				return;
			}

			// Cancel all live ENHANCE streams before clearing segment state.
			const enhanceSegmentIds = Array.from(state.activeEnhanceRequestIdsBySegmentId.keys());
			for (const segId of enhanceSegmentIds) {
				const reqId = state.activeEnhanceRequestIdsBySegmentId.get(segId);
				if (reqId) {
					postToBridge({ verb: "CANCEL", jwt: BRIDGE_FALLBACK_JWT, requestId: reqId });
					state.activeEnhanceRequestIdsBySegmentId.delete(segId);
				}
			}
			state.enhancedTextBySegmentId.clear();

			if (renderedDraftOverlayState === state) {
				renderedDraftOverlayState = undefined;
			}

			if (activeDraftHoverPreviewState?.sourceElement === state.element) {
				clearDraftHoverPreview({ preservePointer: true });
			}

			const highlightRegistry = getDraftHighlightRegistry();
			highlightRegistry?.delete(DRAFT_HIGHLIGHT_NAME);

			if (state.draftOverlayElement) {
				state.draftOverlayElement.remove();
				state.draftOverlayElement = undefined;
			}

			if (state.draftOverlayScrollListener) {
				state.element.removeEventListener("scroll", state.draftOverlayScrollListener);
				state.draftOverlayScrollListener = undefined;
			}

			state.draftOverlayContentElement = undefined;
			state.draftOverlaySegmentRootElement = undefined;
			state.draftOverlayResizeObserver?.disconnect();
			state.draftOverlayResizeObserver = undefined;
			state.draftIsStale = false;
			state.draftRenderMode = undefined;
			state.draftText = "";
			state.draftSegments = [];
		};

		const createDraftOverlayShell = (sourceElement: HTMLTextAreaElement | HTMLElement): { hostElement: HTMLDivElement; contentElement: HTMLDivElement } => {
			const hostElement = document.createElement("div");
			hostElement.setAttribute("aria-hidden", "true");
			hostElement.dataset.instaDraftOverlay = "true";
			hostElement.style.position = "fixed";
			hostElement.style.left = "0px";
			hostElement.style.top = "0px";
			hostElement.style.margin = "0";
			hostElement.style.zIndex = DRAFT_OVERLAY_Z_INDEX;
			hostElement.style.background = "transparent";
			hostElement.style.color = "transparent";
			hostElement.style.caretColor = "transparent";
			hostElement.style.overflow = "hidden";
			hostElement.style.pointerEvents = "none";
			hostElement.style.userSelect = "none";
			hostElement.style.setProperty("-webkit-user-select", "none");
			hostElement.style.setProperty("-webkit-text-fill-color", "transparent");
			hostElement.style.contain = "layout paint style";
			copyDraftOverlayStyles(sourceElement, hostElement);
			applyDraftGoalTypePalette(hostElement);
			applyDraftOverlayFreshness(hostElement, false);

			const contentElement = document.createElement("div");
			contentElement.style.position = "absolute";
			contentElement.style.inset = "0";
			contentElement.style.pointerEvents = "none";
			contentElement.style.color = "transparent";
			contentElement.style.caretColor = "transparent";
			contentElement.style.userSelect = "none";
			contentElement.style.setProperty("-webkit-user-select", "none");
			contentElement.style.setProperty("-webkit-text-fill-color", "transparent");
			contentElement.style.font = "inherit";
			contentElement.style.lineHeight = "inherit";
			contentElement.style.letterSpacing = "inherit";
			contentElement.style.wordSpacing = "inherit";
			contentElement.style.whiteSpace = "inherit";
			contentElement.style.transformOrigin = "top left";

			hostElement.appendChild(contentElement);
			getOverlayContainer().appendChild(hostElement);

			return { hostElement, contentElement };
		};

		const ensureDraftOverlayShell = (
			state: ActiveInputState,
		): { hostElement: HTMLDivElement; contentElement: HTMLDivElement; segmentRootElement: HTMLDivElement } => {
			const existingHostElement = state.draftOverlayElement;
			const existingContentElement = state.draftOverlayContentElement;
			const existingSegmentRootElement = state.draftOverlaySegmentRootElement;

			if (existingHostElement && existingContentElement && existingHostElement.isConnected && existingContentElement.isConnected) {
				let segmentRootElement = existingSegmentRootElement;

				if (!segmentRootElement || segmentRootElement.parentElement !== existingContentElement) {
					const firstChild = existingContentElement.firstElementChild;
					if (firstChild instanceof HTMLDivElement && firstChild.dataset.instaDraftSegmentRoot === "true") {
						segmentRootElement = firstChild;
						state.draftOverlaySegmentRootElement = segmentRootElement;
					}
				}

				if (segmentRootElement) {
					return {
						hostElement: existingHostElement,
						contentElement: existingContentElement,
						segmentRootElement,
					};
				}
			}

			if (existingHostElement || existingContentElement || existingSegmentRootElement) {
				clearDraftRendering(state);
			}

			const overlayShell = createDraftOverlayShell(state.element);
			const segmentRootElement = document.createElement("div");
			segmentRootElement.dataset.instaDraftSegmentRoot = "true";
			segmentRootElement.style.margin = "0";
			segmentRootElement.style.opacity = state.draftIsStale ? DRAFT_STALE_OPACITY : "1";
			copyDraftOverlaySegmentRootStyles(state.element, segmentRootElement);
			overlayShell.contentElement.appendChild(segmentRootElement);

			state.draftOverlayElement = overlayShell.hostElement;
			state.draftOverlayContentElement = overlayShell.contentElement;
			state.draftOverlaySegmentRootElement = segmentRootElement;

			return {
				hostElement: overlayShell.hostElement,
				contentElement: overlayShell.contentElement,
				segmentRootElement,
			};
		};

		const copyDraftOverlaySegmentRootStyles = (source: HTMLElement, target: HTMLDivElement): void => {
			const computedStyle = window.getComputedStyle(source);

			target.style.position = "relative";
			target.style.width = "100%";
			target.style.minHeight = "100%";
			target.style.boxSizing = "border-box";
			target.style.borderTopStyle = computedStyle.borderTopStyle;
			target.style.borderRightStyle = computedStyle.borderRightStyle;
			target.style.borderBottomStyle = computedStyle.borderBottomStyle;
			target.style.borderLeftStyle = computedStyle.borderLeftStyle;
			target.style.borderTopWidth = computedStyle.borderTopWidth;
			target.style.borderRightWidth = computedStyle.borderRightWidth;
			target.style.borderBottomWidth = computedStyle.borderBottomWidth;
			target.style.borderLeftWidth = computedStyle.borderLeftWidth;
			target.style.borderTopColor = "transparent";
			target.style.borderRightColor = "transparent";
			target.style.borderBottomColor = "transparent";
			target.style.borderLeftColor = "transparent";
			target.style.borderRadius = computedStyle.borderRadius;
			target.style.background = "transparent";
			target.style.color = "transparent";
			target.style.caretColor = "transparent";
			target.style.font = "inherit";
			target.style.lineHeight = "inherit";
			target.style.letterSpacing = "inherit";
			target.style.wordSpacing = "inherit";
			target.style.whiteSpace = "inherit";
			target.style.wordBreak = "inherit";
			target.style.overflowWrap = "inherit";
			target.style.margin = "0";
			target.style.paddingTop = computedStyle.paddingTop;
			target.style.paddingRight = computedStyle.paddingRight;
			target.style.paddingBottom = computedStyle.paddingBottom;
			target.style.paddingLeft = computedStyle.paddingLeft;
			target.style.pointerEvents = "none";
			target.style.userSelect = "none";
			target.style.setProperty("-webkit-user-select", "none");
			target.style.setProperty("-webkit-text-fill-color", "transparent");
		};

		// BUG-GEOM: For a contenteditable that grows without a CSS max-height (e.g. the
		// ChatGPT/Lexical input), getBoundingClientRect() and clientHeight both return the
		// element's INTRINSIC content height — not the visible clip height. The visible
		// region is bounded by an ancestor with overflow clipping. Walk up to find every
		// clipping ancestor and intersect, so the overlay host can be clamped to what the
		// user actually sees. Self-clipping elements (textarea) have no smaller clip
		// ancestor, so this returns their own border-box rect and the path is unchanged.
		const getClippedVisibleRect = (
			element: HTMLElement,
		): { left: number; top: number; right: number; bottom: number } => {
			const rect = element.getBoundingClientRect();
			let left = rect.left;
			let top = rect.top;
			let right = rect.right;
			let bottom = rect.bottom;

			let ancestor = element.parentElement;
			while (ancestor && ancestor !== document.documentElement) {
				const style = window.getComputedStyle(ancestor);
				const isClipValue = (value: string): boolean =>
					value === "hidden" || value === "scroll" || value === "auto" || value === "clip";
				const clipY = isClipValue(style.overflowY);
				const clipX = isClipValue(style.overflowX);
				if (clipY || clipX) {
					const ancestorRect = ancestor.getBoundingClientRect();
					if (clipY) {
						top = Math.max(top, ancestorRect.top);
						bottom = Math.min(bottom, ancestorRect.bottom);
					}
					if (clipX) {
						left = Math.max(left, ancestorRect.left);
						right = Math.min(right, ancestorRect.right);
					}
				}
				ancestor = ancestor.parentElement;
			}

			return { left, top, right, bottom };
		};

		const updateDraftOverlayGeometry = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			hostElement: HTMLDivElement,
			contentElement: HTMLDivElement,
			segmentRootElement: HTMLDivElement | undefined,
		): void => {
			const clip = getClippedVisibleRect(sourceElement);
			// Width/height baseline is the self-clip content box (correct for textarea).
			// Clamp to the ancestor clip so a grown contenteditable cannot bleed past its
			// visible container; the host's overflow:hidden then trims underlines outside it.
			const width = Math.min(sourceElement.clientWidth, Math.max(0, clip.right - clip.left));
			const height = Math.min(sourceElement.clientHeight, Math.max(0, clip.bottom - clip.top));
			hostElement.style.left = `${clip.left}px`;
			hostElement.style.top = `${clip.top}px`;
			hostElement.style.width = `${width}px`;
			hostElement.style.height = `${height}px`;
			if (segmentRootElement) {
				segmentRootElement.style.width = `${width}px`;
			}
			syncDraftOverlayScrollPosition(sourceElement, contentElement);
		};

		const syncDraftOverlayScrollPosition = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			layer2Element: HTMLDivElement,
		): void => {
			// The host is clamped to the visible clip region (BUG-GEOM), so its top-left
			// can sit below/right of the source element's true top-left when an ancestor
			// clips it. Offset the content layer by (rect - clip) so the mirrored text
			// still aligns 1:1 with the real text, then apply the element's own scroll.
			// For self-clipping elements (textarea) rect === clip, so this reduces to the
			// original translate(-scrollLeft, -scrollTop) and the path is unchanged.
			const rect = sourceElement.getBoundingClientRect();
			const clip = getClippedVisibleRect(sourceElement);
			const offsetX = rect.left - clip.left - sourceElement.scrollLeft;
			const offsetY = rect.top - clip.top - sourceElement.scrollTop;
			layer2Element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
		};

		const installDraftOverlayResizeObserver = (state: ActiveInputState): void => {
			state.draftOverlayResizeObserver?.disconnect();

			if (typeof ResizeObserver === "undefined") {
				state.draftOverlayResizeObserver = undefined;
				return;
			}

			const resizeObserver = new ResizeObserver(() => {
				syncActiveDraftOverlayPosition();
			});

			resizeObserver.observe(state.element);
			state.draftOverlayResizeObserver = resizeObserver;
		};

		const syncActiveDraftOverlayPosition = (): void => {
			const state = renderedDraftOverlayState;

			if (!state?.draftOverlayElement || !state.draftOverlayContentElement) {
				return;
			}

			if (!state.element.isConnected) {
				clearDraftRendering(state);
				return;
			}

			updateDraftOverlayGeometry(state.element, state.draftOverlayElement, state.draftOverlayContentElement, state.draftOverlaySegmentRootElement);
		};

		const ensureDraftOverlaySyncListenersInstalled = (): void => {
			if (draftOverlaySyncListenersInstalled) {
				return;
			}

			draftOverlaySyncListenersInstalled = true;
			window.addEventListener("scroll", syncActiveDraftOverlayPosition, true);
			window.addEventListener("resize", syncActiveDraftOverlayPosition);
		};

		const applyAcceptanceVisualsToSpan = (
			segmentSpan: HTMLSpanElement,
			segment: DraftSegment,
			isAccepted: boolean,
			isFocused: boolean,
			isStaleAccepted: boolean,
		): void => {
			const paletteEntry = GOAL_TYPE_PALETTE[segment.goalType];
			// S-VIS-3: each clause type also gets a distinct underline texture + weight so
			// the type is legible without relying on color alone (color-blind redundancy).
			const enc = clauseEncoding[segment.goalType];

			segmentSpan.dataset.accepted = isAccepted ? "true" : "false";
			segmentSpan.dataset.focused = isFocused ? "true" : "false";
			segmentSpan.dataset.acceptedStale = isStaleAccepted ? "true" : "false";

			if (isAccepted) {
				segmentSpan.style.opacity = isStaleAccepted ? DRAFT_ACCEPTED_STALE_OPACITY : DRAFT_ACCEPTED_OPACITY;
				segmentSpan.style.textDecorationLine = "underline";
				// Legacy stale-accepted treatment (amber === clauseAccent.context); tokenized
				// for AUD-2 with identical value. Revisited as a true stale state in B4/Track D.
				segmentSpan.style.textDecorationColor = isStaleAccepted ? rgba(clauseAccent.context) : `var(${paletteEntry.cssVariable})`;
				// Stale-accepted keeps the dashed STATE signal; otherwise the per-type texture.
				segmentSpan.style.textDecorationStyle = isStaleAccepted ? "dashed" : enc.underlineStyle;
				segmentSpan.style.textDecorationThickness = `${enc.underlineThickness}px`;
				segmentSpan.style.outline = "none";
			} else {
				segmentSpan.style.opacity = "1";
				segmentSpan.style.textDecorationColor = `var(${paletteEntry.cssVariable})`;
				segmentSpan.style.textDecorationStyle = enc.underlineStyle;
				segmentSpan.style.textDecorationThickness = `${enc.underlineThickness}px`;
				segmentSpan.style.outline = isFocused ? `1px solid var(${paletteEntry.cssVariable})` : "none";
				segmentSpan.style.outlineOffset = isFocused ? "1px" : "0";
			}
		};

		const restampAcceptedSegmentVisuals = (state: ActiveInputState): void => {
			const root = state.draftOverlaySegmentRootElement;
			if (!root) {
				return;
			}

			const spans = root.querySelectorAll<HTMLSpanElement>("span[data-segment-index]");
			for (const span of spans) {
				const segmentIndex = Number.parseInt(span.dataset.segmentIndex ?? "", 10);
				if (!Number.isFinite(segmentIndex)) {
					continue;
				}

				const segment = state.draftSegments[segmentIndex];
				if (!segment) {
					continue;
				}

				const isAccepted = state.acceptedSegmentIndices.has(segmentIndex);
				const isFocused = state.focusedSegmentIndex === segmentIndex;
				const isStaleAccepted = isAccepted && state.hasStaleAccepted;
				applyAcceptanceVisualsToSpan(span, segment, isAccepted, isFocused, isStaleAccepted);
			}
		};

		const renderDraftOverlaySegments = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			segmentRootElement: HTMLDivElement,
			extractedText: string,
			segments: DraftSegment[],
			isStale: boolean,
			acceptedSegmentIndices: Set<number>,
			focusedSegmentIndex: number | undefined,
			hasStaleAccepted: boolean,
		): void => {
			segmentRootElement.textContent = "";
			segmentRootElement.dataset.instaDraftSegments = String(segments.length);
			segmentRootElement.style.opacity = isStale ? DRAFT_STALE_OPACITY : "1";
			copyDraftOverlaySegmentRootStyles(sourceElement, segmentRootElement);

			const fragment = document.createDocumentFragment();
			let cursor = 0;

			for (const [segmentIndex, segment] of segments.entries()) {
				if (cursor < segment.start) {
					fragment.appendChild(document.createTextNode(extractedText.slice(cursor, segment.start)));
				} else if (segmentIndex > 0) {
					// Adjacent segments with no gap text: insert a zero-width break to prevent
					// CSS underline from bleeding across adjacent inline spans.
					const breaker = document.createElement("span");
					breaker.style.textDecorationLine = "none";
					breaker.textContent = "​";
					fragment.appendChild(breaker);
				}

				const segmentSpan = document.createElement("span");
				const paletteEntry = GOAL_TYPE_PALETTE[segment.goalType];
				const isAccepted = acceptedSegmentIndices.has(segmentIndex);
				const isFocused = focusedSegmentIndex === segmentIndex;
				const isStaleAccepted = isAccepted && hasStaleAccepted;

				segmentSpan.dataset.goalType = segment.goalType;
				segmentSpan.dataset.segmentIndex = String(segmentIndex);
				segmentSpan.dataset.draftStale = isStale ? "true" : "false";
				segmentSpan.style.display = "inline";
				segmentSpan.style.color = "transparent";
				segmentSpan.style.background = "transparent";
				segmentSpan.style.caretColor = "transparent";
				segmentSpan.style.font = "inherit";
				segmentSpan.style.lineHeight = "inherit";
				segmentSpan.style.letterSpacing = "inherit";
				segmentSpan.style.whiteSpace = "inherit";
				segmentSpan.style.wordBreak = "inherit";
				segmentSpan.style.overflowWrap = "inherit";
				segmentSpan.style.pointerEvents = "none";
				segmentSpan.style.userSelect = "none";
				segmentSpan.style.setProperty("-webkit-user-select", "none");
				segmentSpan.style.setProperty("-webkit-text-fill-color", "transparent");
				segmentSpan.style.textDecorationLine = "underline";
				segmentSpan.style.textDecorationColor = `var(${paletteEntry.cssVariable})`;
				// Per-type texture + weight (S-VIS-3); applyAcceptanceVisualsToSpan below
				// may override style for the stale state but keeps the per-type thickness.
				segmentSpan.style.textDecorationStyle = clauseEncoding[segment.goalType].underlineStyle;
				segmentSpan.style.textDecorationThickness = `${clauseEncoding[segment.goalType].underlineThickness}px`;
				segmentSpan.style.textUnderlineOffset = "2px";
				segmentSpan.style.textDecorationSkipInk = "none";
				applyAcceptanceVisualsToSpan(segmentSpan, segment, isAccepted, isFocused, isStaleAccepted);
				const trailingSpaces = segment.text.match(/\s+$/)?.[0] ?? "";
				segmentSpan.textContent = trailingSpaces.length > 0
					? segment.text.slice(0, segment.text.length - trailingSpaces.length)
					: segment.text;
				fragment.appendChild(segmentSpan);
				if (trailingSpaces.length > 0) {
					fragment.appendChild(document.createTextNode(trailingSpaces));
				}
				cursor = segment.end;
			}

			if (cursor < extractedText.length) {
				fragment.appendChild(document.createTextNode(extractedText.slice(cursor)));
			}

			segmentRootElement.appendChild(fragment);
		};

		const renderHighlightedDraftOverlay = (
			contentElement: HTMLDivElement,
			extractedText: string,
			segments: DraftSegment[],
		): boolean => {
			const highlightRegistry = getDraftHighlightRegistry();
			const highlightConstructor = getDraftHighlightConstructor();

			if (!highlightRegistry || !highlightConstructor) {
				return false;
			}

			contentElement.replaceChildren(document.createTextNode(extractedText));
			const textNode = contentElement.firstChild;

			if (!(textNode instanceof Text)) {
				return false;
			}

			const ranges: Range[] = [];
			for (const segment of segments) {
				const start = Math.max(0, Math.min(segment.start, textNode.length));
				const end = Math.max(start, Math.min(segment.end, textNode.length));

				if (start >= end) {
					continue;
				}

				const range = document.createRange();
				range.setStart(textNode, start);
				range.setEnd(textNode, end);
				ranges.push(range);
			}

			if (ranges.length === 0) {
				return false;
			}

			ensureDraftHighlightStyle();
			highlightRegistry.delete(DRAFT_HIGHLIGHT_NAME);
			const highlight = new highlightConstructor(...ranges);
			highlightRegistry.set(DRAFT_HIGHLIGHT_NAME, highlight);

			return true;
		};

		const renderDraftSegments = (
			state: ActiveInputState,
			extractedText: string,
			segments: DraftSegment[],
			isStale: boolean,
		): void => {
			if (!state.element.isConnected || extractedText.length === 0) {
				clearDraftRendering(state);
				return;
			}

			ensureDraftOverlaySyncListenersInstalled();
			const overlayShell = ensureDraftOverlayShell(state);
			installDraftOverlayResizeObserver(state);
			updateDraftOverlayGeometry(state.element, overlayShell.hostElement, overlayShell.contentElement, overlayShell.segmentRootElement);
			renderDraftOverlaySegments(
				state.element,
				overlayShell.segmentRootElement,
				extractedText,
				segments,
				isStale,
				state.acceptedSegmentIndices,
				state.focusedSegmentIndex,
				state.hasStaleAccepted,
			);
			applyDraftOverlayFreshness(overlayShell.hostElement, isStale);
			state.draftIsStale = isStale;
			state.draftRenderMode = "overlay";

			state.draftOverlayElement = overlayShell.hostElement;
			state.draftOverlayContentElement = overlayShell.contentElement;
			state.draftText = extractedText;
			state.draftSegments = segments;
			renderedDraftOverlayState = state;
			restoreDraftHoverPreviewFromLastPointer(state.element);
		};

		// CSS properties (hyphenated) that control text layout inside a textarea.
		// These are copied to the mirror div so wrapping and character widths match exactly.
		const MIRROR_LAYOUT_PROPS = [
			"box-sizing", "width",
			"border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
			"padding-top", "padding-right", "padding-bottom", "padding-left",
			"font-family", "font-size", "font-style", "font-weight", "font-stretch",
			"letter-spacing", "word-spacing", "line-height",
			"text-align", "text-transform", "text-indent",
		] as const;

		// Returns the viewport-relative {x, y} of the insertion point (bottom of the caret
		// line) inside the given element, or null if the technique cannot be applied.
		//
		// For contenteditable elements the Selection API gives us the caret range rect
		// directly, so no cloning is needed.
		//
		// For <textarea> elements we use the mirror-clone technique:
		//   1. Build a hidden div with identical layout styles and the same pixel width.
		//   2. Fill it with all text *before* the caret, then append a zero-width-space
		//      sentinel <span>.
		//   3. Scroll the mirror to match the textarea's own scrollTop / scrollLeft so
		//      text that has scrolled off the top does not shift the sentinel upward.
		//   4. Read the sentinel's viewport rect — its bottom-left is exactly where the
		//      next character would appear in the textarea.
		//
		// Step 3 is what makes the math correct under scroll and wrapping: the mirror's
		// layout engine performs the same line-breaking as the browser does inside the
		// real textarea (because box width, font metrics, and padding are identical), and
		// scrollTop alignment ensures visible-area coordinates rather than document-area.
		const getCaretCoordinates = (element: HTMLTextAreaElement | HTMLElement): { x: number; y: number } | null => {
			try {
				if (!(element instanceof HTMLTextAreaElement)) {
					// contenteditable / ProseMirror: Selection API is authoritative.
					const sel = window.getSelection();
					if (!sel || sel.rangeCount === 0) {
						return null;
					}
					const range = sel.getRangeAt(0).cloneRange();
					range.collapse(true);
					const rect = range.getBoundingClientRect();
					// A zero rect means the selection is in an invisible node.
					if (rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0) {
						return null;
					}
					return { x: rect.left, y: rect.bottom };
				}

				const ta = element;
				const caretPos = ta.selectionStart ?? ta.value.length;
				const computed = window.getComputedStyle(ta);
				const taRect = ta.getBoundingClientRect();

				const mirror = document.createElement("div");
				mirror.setAttribute("aria-hidden", "true");

				// Base positioning: place mirror at the textarea's document position so
				// its internal layout matches the textarea's coordinate space.
				mirror.style.position = "absolute";
				mirror.style.visibility = "hidden";
				mirror.style.pointerEvents = "none";
				mirror.style.top = `${taRect.top + window.scrollY}px`;
				mirror.style.left = `${taRect.left + window.scrollX}px`;
				// Allow overflow so scrollTop assignment below takes effect.
				mirror.style.overflowY = "scroll";
				mirror.style.overflowX = "hidden";
				// Textareas always wrap — enforce consistent wrapping on the mirror.
				mirror.style.whiteSpace = "pre-wrap";
				mirror.style.wordBreak = "break-word";

				for (const prop of MIRROR_LAYOUT_PROPS) {
					const val = computed.getPropertyValue(prop);
					if (val) {
						mirror.style.setProperty(prop, val);
					}
				}

				// Text before caret + zero-width-space sentinel.
				mirror.textContent = ta.value.substring(0, caretPos);
				const sentinel = document.createElement("span");
				sentinel.textContent = "​";
				mirror.appendChild(sentinel);

				document.body.appendChild(mirror);
				// Scroll the mirror to match the textarea so lines above the viewport
				// are accounted for in the sentinel's viewport-relative rect.
				mirror.scrollTop = ta.scrollTop;
				mirror.scrollLeft = ta.scrollLeft;

				const sentinelRect = sentinel.getBoundingClientRect();
				mirror.remove();

				if (sentinelRect.top === 0 && sentinelRect.left === 0) {
					return null;
				}
				return { x: sentinelRect.left, y: sentinelRect.bottom };
			} catch {
				// Any DOM or CSP failure falls through to the floating-panel fallback.
				return null;
			}
		};

		const ensureGhostPanel = (state: ActiveInputState): void => {
			if (state.ghostPanelElement && state.ghostPanelElement.isConnected) {
				positionGhostPanel(state);
				return;
			}

			const containerElement = document.createElement("div");
			containerElement.setAttribute("aria-hidden", "true");
			containerElement.dataset.instaGhostPanel = "true";
			containerElement.style.position = "fixed";
			containerElement.style.left = "0px";
			containerElement.style.top = "0px";
			containerElement.style.zIndex = DRAFT_OVERLAY_Z_INDEX;
			containerElement.style.pointerEvents = "none";

			const shadow = containerElement.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = `${shadowBaseCss("dark")}
:host {
	all: initial;
	position: fixed;
	left: 0;
	top: 0;
	z-index: ${DRAFT_OVERLAY_Z_INDEX};
	pointer-events: none;
}

[data-ghost-panel] {
	all: initial;
	display: block;
	box-sizing: border-box;
	max-width: min(560px, calc(100vw - 24px));
	border-radius: var(--pc-radius-lg);
	border: 1px solid rgba(148, 163, 184, 0.32);
	background: rgba(15, 23, 42, 0.97);
	color: var(--pc-neutral-8);
	box-shadow: var(--pc-shadow-popover);
	padding: 12px 14px;
	font-family: var(--pc-font-family);
	font-size: 13px;
	line-height: 1.5;
	font-style: italic;
	white-space: pre-wrap;
	pointer-events: none;
	user-select: none;
	animation: ${motionPreset.floatIn};
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
`;

			const panelElement = document.createElement("div");
			panelElement.dataset.ghostPanel = "true";

			const statusElement = document.createElement("div");
			statusElement.dataset.ghostStatus = "true";
			statusElement.textContent = "Compiling...";

			const bodyElement = document.createElement("div");
			bodyElement.dataset.ghostBody = "true";

			panelElement.append(statusElement, bodyElement);
			shadow.append(style, panelElement);
			getOverlayContainer().appendChild(containerElement);

			state.ghostPanelElement = containerElement;
			state.ghostPanelStatusElement = statusElement;
			state.ghostPanelBodyElement = bodyElement;

			const layoutListener: EventListener = () => positionGhostPanel(state);
			window.addEventListener("scroll", layoutListener, true);
			window.addEventListener("resize", layoutListener);
			state.ghostPanelLayoutListener = layoutListener;

			positionGhostPanel(state);
		};

		const positionGhostPanel = (state: ActiveInputState): void => {
			const panel = state.ghostPanelElement;
			if (!panel) {
				return;
			}

			const viewportPadding = 12;

			// Primary: anchor to the exact caret position via mirror-clone.
			const caret = getCaretCoordinates(state.element);
			if (caret !== null) {
				const x = Math.max(viewportPadding, Math.min(window.innerWidth - viewportPadding - 200, caret.x));
				const y = Math.max(viewportPadding, Math.min(window.innerHeight - viewportPadding - 80, caret.y + 4));
				panel.style.left = `${x}px`;
				panel.style.top = `${y}px`;
				return;
			}

			// Fallback: float the panel just below the host element's bounding box.
			const rect = state.element.getBoundingClientRect();
			const top = Math.min(window.innerHeight - viewportPadding - 80, rect.bottom + 8);
			const left = Math.max(viewportPadding, rect.left);
			panel.style.left = `${left}px`;
			panel.style.top = `${Math.max(viewportPadding, top)}px`;
		};

		const updateGhostPanelStatus = (state: ActiveInputState, text: string): void => {
			if (state.ghostPanelStatusElement) {
				state.ghostPanelStatusElement.textContent = text;
			}
		};

		const _unsupportedToastShownFor = new WeakSet<Element>();

		const showUnsupportedInputToast = (): void => {
			const container = document.createElement("div");
			container.setAttribute("aria-hidden", "true");
			container.style.position = "fixed";
			container.style.right = "16px";
			container.style.bottom = "16px";
			container.style.zIndex = String(Number(DRAFT_OVERLAY_Z_INDEX) + 1);
			container.style.pointerEvents = "none";
			container.style.opacity = "1";
			// motionTransition honors prefers-reduced-motion (collapses to 0ms); the
			// host element is light-DOM so the shadow reduced-motion guard can't reach it.
			container.style.transition = motionTransition("opacity", "slow");

			const shadow = container.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = `${shadowBaseCss("dark")}
:host { all: initial; pointer-events: none; }
[data-unsupported-toast] {
	all: initial;
	display: block;
	box-sizing: border-box;
	border-radius: var(--pc-radius-lg);
	border: 1px solid rgba(148, 163, 184, 0.32);
	background: rgba(15, 23, 42, 0.97);
	color: var(--pc-neutral-8);
	box-shadow: var(--pc-shadow-popover);
	padding: 10px 14px;
	font-family: var(--pc-font-family);
	font-size: 13px;
	line-height: 1.5;
	pointer-events: none;
	user-select: none;
	white-space: nowrap;
	animation: ${motionPreset.floatIn};
}
`;
			const toast = document.createElement("div");
			toast.dataset.unsupportedToast = "true";
			toast.textContent = "PromptCompiler doesn't support this input";
			shadow.append(style, toast);
			getOverlayContainer().appendChild(container);

			setTimeout(() => {
				container.style.opacity = "0";
				setTimeout(() => container.remove(), 400);
			}, 3000);
		};

		const showSessionExpiredNotice = (state: ActiveInputState): void => {
			ensureGhostPanel(state);
			updateGhostPanelStatus(state, "Session expired");
			if (state.ghostPanelBodyElement) {
				state.ghostPanelBodyElement.textContent = SESSION_EXPIRED_NOTICE;
			}
		};

		const clearBindRecoveryTracking = (state: ActiveInputState): void => {
			if (state.bindRecoveryTimeoutId !== undefined) {
				window.clearTimeout(state.bindRecoveryTimeoutId);
				state.bindRecoveryTimeoutId = undefined;
			}

			if (state.bindRecoveryObserver) {
				state.bindRecoveryObserver.disconnect();
				state.bindRecoveryObserver = undefined;
			}
		};

		const copyTextToClipboard = async (text: string): Promise<void> => {
			if (text.length === 0) {
				return;
			}

			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return;
			}

			const fallback = document.createElement("textarea");
			fallback.value = text;
			fallback.setAttribute("readonly", "true");
			fallback.style.position = "fixed";
			fallback.style.opacity = "0";
			document.body.appendChild(fallback);
			fallback.select();
			document.execCommand("copy");
			fallback.remove();
		};

		const scoreReplacementInput = (previous: HTMLTextAreaElement | HTMLElement, candidate: HTMLElement): number => {
			let score = 0;

			if (previous.tagName === candidate.tagName) {
				score += 4;
			}

			const comparableAttributes = ["id", "name", "role", "aria-label", "placeholder", "data-testid", "data-test-id"] as const;
			for (const attribute of comparableAttributes) {
				const previousValue = previous.getAttribute(attribute);
				const candidateValue = candidate.getAttribute(attribute);
				if (previousValue && candidateValue && previousValue === candidateValue) {
					score += 1;
				}
			}

			if (previous.className && previous.className === candidate.className) {
				score += 1;
			}

			if (previous instanceof HTMLTextAreaElement && candidate instanceof HTMLTextAreaElement) {
				score += 2;
			}

			if (
				previous instanceof HTMLElement &&
				candidate instanceof HTMLElement &&
				previous.matches('[contenteditable]:not([contenteditable="false"])') === candidate.matches('[contenteditable]:not([contenteditable="false"])')
			) {
				score += 1;
			}

			return score;
		};

		const findReplacementInput = (
			state: ActiveInputState,
			mutationList: MutationRecord[],
		): HTMLTextAreaElement | HTMLElement | undefined => {
			const candidates: HTMLElement[] = [];

			const collectCandidates = (node: Node): void => {
				if (node instanceof HTMLTextAreaElement || node instanceof HTMLElement) {
					if (isValidInput(node)) {
						candidates.push(node);
					}
				}

				if (node instanceof Element || node instanceof DocumentFragment) {
					for (const descendant of node.querySelectorAll("textarea, [contenteditable]:not([contenteditable='false'])")) {
						if (isValidInput(descendant)) {
							candidates.push(descendant);
						}
					}
				}
			};

			for (const mutation of mutationList) {
				if (mutation.type !== "childList") {
					continue;
				}

				for (const addedNode of mutation.addedNodes) {
					collectCandidates(addedNode);
				}
			}

			let bestCandidate: HTMLTextAreaElement | HTMLElement | undefined;
			let bestScore = 0;
			for (const candidate of candidates) {
				if (candidate === state.element || isInstrumented(candidate)) {
					continue;
				}

				const score = scoreReplacementInput(state.element, candidate);
				if (score > bestScore) {
					bestCandidate = candidate;
					bestScore = score;
				}
			}

			return bestScore > 0 ? bestCandidate : undefined;
		};

		const reattachActiveInput = (state: ActiveInputState, nextElement: HTMLTextAreaElement | HTMLElement): void => {
			const previousElement = state.element;
			if (previousElement !== nextElement) {
				if (state.draftOverlayScrollListener) {
					previousElement.removeEventListener("scroll", state.draftOverlayScrollListener);
				}

				state.element = nextElement;
				state.draftOverlayScrollListener = undefined;
				ensureSourceScrollListenerInstalled(state);
				installDraftOverlayResizeObserver(state);
				if (state.ghostPanelElement) {
					ensureGhostPanel(state);
				}
			}

			if (state.draftOverlayElement?.isConnected && state.draftOverlayContentElement?.isConnected) {
				updateDraftOverlayGeometry(state.element, state.draftOverlayElement, state.draftOverlayContentElement, state.draftOverlaySegmentRootElement);
				applyDraftOverlayFreshness(state.draftOverlayElement, state.draftIsStale);
			}

			if (state.ghostPanelElement?.isConnected) {
				positionGhostPanel(state);
			}

			renderedDraftOverlayState = state;
		};

		const scheduleBindRecoveryFallback = (state: ActiveInputState): void => {
			if (state.bindRecoveryObserver || state.bindRecoveryTimeoutId !== undefined) {
				return;
			}

			state.bindRecoveryObserver = new MutationObserver((mutationList) => {
				const replacement = findReplacementInput(state, mutationList);
				if (!replacement) {
					return;
				}

				clearBindRecoveryTracking(state);
				reattachActiveInput(state, replacement);
			});

			state.bindRecoveryObserver.observe(document.body, {
				childList: true,
				subtree: true,
			});

			state.bindRecoveryTimeoutId = window.setTimeout(() => {
				clearBindRecoveryTracking(state);
				if (state.element.isConnected || state.bindPhase === "IDLE") {
					return;
				}

				void copyTextToClipboard(state.pendingGhostText).catch((error) => {
					console.warn("Failed to copy recovered bind text", error);
				});
				showSessionExpiredNotice(state);
				updateGhostPanelStatus(state, "Editor changed");
				if (state.ghostPanelBodyElement) {
					state.ghostPanelBodyElement.textContent = "Editor changed — your compiled prompt was saved to clipboard";
				}
			}, 500);
		};

		const removeGhostPanel = (state: ActiveInputState): void => {
			if (state.ghostPanelLayoutListener) {
				window.removeEventListener("scroll", state.ghostPanelLayoutListener, true);
				window.removeEventListener("resize", state.ghostPanelLayoutListener);
				state.ghostPanelLayoutListener = undefined;
			}

			if (state.ghostPanelElement) {
				state.ghostPanelElement.remove();
			}

			state.ghostPanelElement = undefined;
			state.ghostPanelBodyElement = undefined;
			state.ghostPanelStatusElement = undefined;
		};

		const handleBindStreamToken = (state: ActiveInputState, token: string): void => {
			state.bindPhase = "BINDING";
			state.pendingGhostText += token;
			ensureGhostPanel(state);
			if (state.ghostPanelBodyElement) {
				state.ghostPanelBodyElement.textContent = state.pendingGhostText;
			}
		};

		const handleBindStreamDone = (state: ActiveInputState): void => {
			state.bindPhase = "COMPLETE";
			state.ghostStreamComplete = true;
			updateGhostPanelStatus(state, "Press Enter to commit");
		};

		const handleBindStreamWarning = (state: ActiveInputState, message: string): void => {
			state.bindHistoryWarning = message;
			ensureGhostPanel(state);
			updateGhostPanelStatus(state, "Press Enter to commit");
			if (state.ghostPanelBodyElement) {
				state.ghostPanelBodyElement.textContent = `${state.pendingGhostText}\n\n${message}`;
			}
		};

		const handleBindStreamError = (state: ActiveInputState, message: string): void => {
			clearBindRecoveryTracking(state);
			state.bindPhase = "IDLE";
			state.ghostStreamComplete = false;
			state.activeBindRequestId = undefined;
			state.bindHistoryWarning = undefined;
			ensureGhostPanel(state);
			updateGhostPanelStatus(state, "Bind failed");
			if (state.ghostPanelBodyElement) {
				state.ghostPanelBodyElement.textContent = message;
			}
		};

		const handleEnhanceStreamToken = (state: ActiveInputState, segmentId: string, token: string): void => {
			const accumulated = (state.enhancedTextBySegmentId.get(segmentId) ?? "") + token;
			state.enhancedTextBySegmentId.set(segmentId, accumulated);

			// Live-update the hover preview body if it is currently showing this segment.
			if (
				activeDraftHoverPreviewState &&
				activeDraftHoverPreviewState.sourceElement === state.element &&
				activeDraftHoverPreviewState.segment.id === segmentId
			) {
				activeDraftHoverPreviewState.bodyElement.textContent = accumulated;
			}
		};

		const handleEnhanceStreamDone = (state: ActiveInputState, segmentId: string): void => {
			state.activeEnhanceRequestIdsBySegmentId.delete(segmentId);

			// Transition hover preview to ready, cancelling any pending 120ms timer.
			if (
				activeDraftHoverPreviewState &&
				activeDraftHoverPreviewState.sourceElement === state.element &&
				activeDraftHoverPreviewState.segment.id === segmentId
			) {
				if (activeDraftHoverPreviewState.readyTimerId !== undefined) {
					window.clearTimeout(activeDraftHoverPreviewState.readyTimerId);
					activeDraftHoverPreviewState.readyTimerId = undefined;
				}
				activeDraftHoverPreviewState.status = "ready";
				renderDraftHoverPreview(activeDraftHoverPreviewState);
				positionDraftHoverPreview(activeDraftHoverPreviewState);
			}
		};

		const handleEnhanceStreamError = (state: ActiveInputState, segmentId: string, errorMessage: string): void => {
			state.activeEnhanceRequestIdsBySegmentId.delete(segmentId);

			// Surface the error in the hover preview if it is showing this segment.
			if (
				activeDraftHoverPreviewState &&
				activeDraftHoverPreviewState.sourceElement === state.element &&
				activeDraftHoverPreviewState.segment.id === segmentId
			) {
				if (activeDraftHoverPreviewState.readyTimerId !== undefined) {
					window.clearTimeout(activeDraftHoverPreviewState.readyTimerId);
					activeDraftHoverPreviewState.readyTimerId = undefined;
				}
				activeDraftHoverPreviewState.panelElement.dataset.state = "error";
				activeDraftHoverPreviewState.statusElement.textContent = "Error";
				activeDraftHoverPreviewState.bodyElement.textContent = errorMessage;
			}
		};

		const clearActiveInputWork = (state: ActiveInputState | undefined): void => {
			if (!state) {
				return;
			}

			if (state.debounceTimerId !== undefined) {
				window.clearTimeout(state.debounceTimerId);
				state.debounceTimerId = undefined;
			}

			if (state.abortController) {
				state.abortController.abort();
				state.abortController = undefined;
			}

			clearBindRecoveryTracking(state);
			state.bindPhase = "IDLE";
			state.status = "IDLE";
		};

		const handleSourceScrollEvent = (event: Event): void => {
			if (!(event.currentTarget instanceof HTMLElement)) {
				return;
			}

			clearDraftHoverPreview();

			if (activeInputState?.element === event.currentTarget && activeInputState.draftOverlayContentElement) {
				syncDraftOverlayScrollPosition(event.currentTarget, activeInputState.draftOverlayContentElement);
			}
		};

		const ensureSourceScrollListenerInstalled = (state: ActiveInputState): void => {
			if (state.draftOverlayScrollListener) {
				return;
			}

			state.draftOverlayScrollListener = handleSourceScrollEvent;
			state.element.addEventListener("scroll", state.draftOverlayScrollListener, { passive: true });
		};

		const handleSourceMouseMoveEvent = (event: Event): void => {
			if (!(event.currentTarget instanceof HTMLElement) || !(event instanceof MouseEvent)) {
				return;
			}

			syncDraftHoverPreviewFromPoint(event.currentTarget, event.clientX, event.clientY);
		};

		const handleSourceMouseLeaveEvent = (): void => {
			clearDraftHoverPreview();
		};

		const handleSourceBlurEvent = (): void => {
			clearDraftHoverPreview();
		};

		// BIND-UX-1: accept the clause currently under review focus. Acceptance is now an
		// explicit, separate act from browsing — Tab moves focus, Enter accepts. After
		// accepting, advance focus to the next unaccepted clause for fast sequential accept.
		const acceptFocusedSegment = (state: ActiveInputState): boolean => {
			if (state.draftSegments.length === 0 || state.focusedSegmentIndex === undefined) {
				return false;
			}

			const index = state.focusedSegmentIndex;
			if (!state.acceptedSegmentIndices.has(index)) {
				state.acceptedSegmentIndices.add(index);
				state.acceptanceOrder.push(index);
			}
			state.focusedSegmentIndex = findNextUnacceptedIndex(state, index + 1) ?? index;
			restampAcceptedSegmentVisuals(state);
			return true;
		};

		const findNextUnacceptedIndex = (state: ActiveInputState, fromIndex: number | undefined): number | undefined => {
			const start = typeof fromIndex === "number" && fromIndex >= 0 ? fromIndex : 0;
			for (let index = start; index < state.draftSegments.length; index += 1) {
				if (!state.acceptedSegmentIndices.has(index)) {
					return index;
				}
			}
			for (let index = 0; index < start; index += 1) {
				if (!state.acceptedSegmentIndices.has(index)) {
					return index;
				}
			}
			return undefined;
		};

		// BIND-UX-1: move review focus WITHOUT accepting. Cycles through every clause —
		// accepted or not — so the user can inspect any clause's hover preview before
		// committing to it. The first Tab enters review mode from no-focus; Esc exits it
		// (clears focus) so plain Enter sends/newlines normally again.
		const focusSegment = (state: ActiveInputState, direction: 1 | -1): boolean => {
			const count = state.draftSegments.length;
			if (count === 0) {
				return false;
			}
			if (state.focusedSegmentIndex === undefined) {
				state.focusedSegmentIndex = direction === 1 ? 0 : count - 1;
			} else {
				state.focusedSegmentIndex = (state.focusedSegmentIndex + direction + count) % count;
			}
			restampAcceptedSegmentVisuals(state);
			return true;
		};

		const isBindGateOpen = (state: ActiveInputState): boolean => {
			return (
				state.acceptedSegmentIndices.size > 0 &&
				!state.hasStaleAccepted &&
				state.activeBindRequestId === undefined &&
				state.bindPhase === "IDLE"
			);
		};

		// BUG-4.1: surface why a bind keypress did nothing. The gate was previously
		// console-only, so on Windows (where Ctrl+Enter reaches this path but the gate is
		// closed) the user saw no feedback at all. Show the reason in the ghost panel and
		// auto-dismiss after 2s — unless a real bind/commit has since taken over the panel.
		const describeBindGateBlock = (state: ActiveInputState): string => {
			if (state.bindPhase !== "IDLE" || state.activeBindRequestId !== undefined) {
				return "Compilation already in progress…";
			}
			if (state.acceptedSegmentIndices.size === 0) {
				return "Accept at least one clause first — press Tab to review, Enter to accept.";
			}
			if (state.hasStaleAccepted) {
				return "Your accepted clauses are stale — re-accept them after the recent edit.";
			}
			return "Bind is not available right now.";
		};

		const logBindGateBlocked = (state: ActiveInputState): void => {
			console.warn("[content] bind blocked", {
				accepted: state.acceptedSegmentIndices.size,
				hasStaleAccepted: state.hasStaleAccepted,
				bindPhase: state.bindPhase,
				activeBindRequestId: state.activeBindRequestId,
			});

			ensureGhostPanel(state);
			updateGhostPanelStatus(state, REVIEW_HINT);
			if (state.ghostPanelBodyElement) {
				state.ghostPanelBodyElement.textContent = describeBindGateBlock(state);
			}

			window.setTimeout(() => {
				// Only dismiss if nothing real has claimed the panel in the meantime.
				if (state.bindPhase === "IDLE" && state.activeBindRequestId === undefined && state.pendingGhostText.length === 0) {
					removeGhostPanel(state);
				}
			}, 2000);
		};

		const collectAcceptedBindSections = (state: ActiveInputState): Array<{
			canonical_order: number;
			goal_type: GoalType;
			expansion: string;
		}> => {
			const sections: Array<{ canonical_order: number; goal_type: GoalType; expansion: string }> = [];
			for (const index of state.acceptedSegmentIndices) {
				const segment = state.draftSegments[index];
				if (!segment) {
					continue;
				}

				sections.push({
					canonical_order: CANONICAL_ORDER_BY_GOAL_TYPE[segment.goalType],
					goal_type: segment.goalType,
					expansion: state.enhancedTextBySegmentId.get(segment.id) ?? segment.text,
				});
			}

			return sortByCanonicalOrder(sections);
		};

		const dispatchBindRequest = (state: ActiveInputState): void => {
			if (!isBindGateOpen(state)) {
				logBindGateBlocked(state);
				return;
			}

			const sections = collectAcceptedBindSections(state);
			if (sections.length === 0) {
				return;
			}

			void (async () => {
				const { mode, jwt } = await resolveBridgeContext();
				if (!jwt) {
					showSessionExpiredNotice(state);
					return;
				}

				if (!isBindGateOpen(state)) {
					logBindGateBlocked(state);
					return;
				}

				const requestId = crypto.randomUUID();
				clearBindRecoveryTracking(state);
				state.bindPhase = "BINDING";
				state.activeBindRequestId = requestId;
				state.bindHistoryWarning = undefined;
				state.pendingGhostText = "";
				state.ghostStreamComplete = false;
				ensureGhostPanel(state);
				updateGhostPanelStatus(state, "Compiling...");
				if (state.ghostPanelBodyElement) {
					state.ghostPanelBodyElement.textContent = "";
				}

				postToBridge({
					verb: "BIND",
					jwt,
					requestId,
					payload: {
						sections,
						mode,
					},
				});
			})().catch((error) => {
				console.warn("Failed to dispatch BIND request", error);
			});
		};

		const cancelActiveBindStream = (state: ActiveInputState): boolean => {
			const requestId = state.activeBindRequestId;
			if (!requestId) {
				return false;
			}

			clearBindRecoveryTracking(state);
			postToBridge({ verb: "CANCEL", jwt: BRIDGE_FALLBACK_JWT, requestId });

			state.activeBindRequestId = undefined;
			state.bindPhase = "IDLE";
			state.bindHistoryWarning = undefined;
			state.pendingGhostText = "";
			state.ghostStreamComplete = false;
			removeGhostPanel(state);
			return true;
		};

		const cancelEnhanceStreamForSegment = (state: ActiveInputState, segmentId: string): void => {
			const requestId = state.activeEnhanceRequestIdsBySegmentId.get(segmentId);
			if (!requestId) {
				return;
			}

			postToBridge({ verb: "CANCEL", jwt: BRIDGE_FALLBACK_JWT, requestId });
			state.activeEnhanceRequestIdsBySegmentId.delete(segmentId);
		};

		const dispatchEnhanceRequest = async (state: ActiveInputState, segment: DraftSegment, allSegments: DraftSegment[]): Promise<void> => {
			const { mode, jwt } = await resolveBridgeContext();
			if (!jwt) {
				showSessionExpiredNotice(state);
				return;
			}

			// Guard: if state was superseded by a newer debounce, do nothing.
			if (activeInputState !== state) {
				return;
			}

			// Guard: don't re-dispatch if one is already active for this segment.
			if (state.activeEnhanceRequestIdsBySegmentId.has(segment.id)) {
				return;
			}

			const requestId = crypto.randomUUID();
			state.activeEnhanceRequestIdsBySegmentId.set(segment.id, requestId);

			postToBridge({
				verb: "ENHANCE",
				jwt,
				requestId,
				payload: {
					section: { id: segment.id, text: segment.text, goal_type: segment.goalType },
					siblings: allSegments
						.filter(s => s.id !== segment.id)
						.map(s => ({ id: s.id, text: s.text, goal_type: s.goalType })),
					mode,
					project_id: null,
				},
			});
		};

		const commitGhostTextToInput = (state: ActiveInputState): boolean => {
			if (!state.ghostStreamComplete || state.pendingGhostText.length === 0) {
				return false;
			}

			const element = state.element;
			const text = state.pendingGhostText;

			if (isValidTextarea(element)) {
				const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
				if (nativeSetter) {
					nativeSetter.call(element, text);
				} else {
					element.value = text;
				}
				element.dispatchEvent(new Event("input", { bubbles: true }));
				element.dispatchEvent(new Event("change", { bubbles: true }));
				try {
					element.setSelectionRange(text.length, text.length);
				} catch {
					// Some host pages may guard setSelectionRange — safe to ignore.
				}
			} else {
				element.textContent = text;
				element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
			}

			resetActiveInputAfterCommit(state);
			return true;
		};

		const mapBackendSectionsToDraftSegments = (
			sections: Array<Record<string, unknown>>,
			fullText: string,
		): DraftSegment[] => {
			const result: DraftSegment[] = [];
			let cursor = 0;

			for (const section of sections) {
				const text = typeof section.text === "string" ? section.text.trim() : "";
				if (!text) {
					continue;
				}
				const goalType = isGoalTypeValue(section.goal_type) ? section.goal_type : GOAL_TYPE_VALUES[0];

				const pos = fullText.indexOf(text, cursor);
				if (pos === -1) {
					continue;
				}

				result.push({
					id: `seg-${pos}-${pos + text.length}`,
					depends_on: [],
					start: pos,
					end: pos + text.length,
					text,
					goalType,
				});
				cursor = pos + text.length;
			}

			for (let i = 1; i < result.length; i++) {
				result[i]!.depends_on = result.slice(0, i).map(s => s.id);
			}

			return result;
		};

		const handleSegmentResponse = (state: ActiveInputState, data: Record<string, unknown>): void => {
			const rawSections = Array.isArray(data.sections) ? (data.sections as Array<Record<string, unknown>>) : [];
			const backendSegments = mapBackendSectionsToDraftSegments(rawSections, state.draftText);

			if (backendSegments.length === 0) {
				return;
			}

			// Acceptance migration: same first-divergence algorithm used in the debounce callback.
			const oldSegments = state.draftSegments;
			let firstDivergenceIndex = Math.min(oldSegments.length, backendSegments.length);
			for (let i = 0; i < firstDivergenceIndex; i++) {
				if (oldSegments[i]?.id !== backendSegments[i]?.id) {
					firstDivergenceIndex = i;
					break;
				}
			}

			const newIndexById = new Map<string, number>();
			for (let i = 0; i < backendSegments.length; i++) {
				newIndexById.set(backendSegments[i]!.id, i);
			}

			const newAcceptedIndices = new Set<number>();
			const newAcceptanceOrder: number[] = [];
			let anyStale = false;
			for (const oldIndex of state.acceptanceOrder) {
				const oldSegment = oldSegments[oldIndex];
				if (!oldSegment) {
					continue;
				}
				const newIndex = newIndexById.get(oldSegment.id);
				if (newIndex === undefined) {
					continue;
				}
				newAcceptedIndices.add(newIndex);
				newAcceptanceOrder.push(newIndex);
				if (newIndex >= firstDivergenceIndex) {
					anyStale = true;
				}
			}
			state.acceptedSegmentIndices = newAcceptedIndices;
			state.acceptanceOrder = newAcceptanceOrder;
			state.hasStaleAccepted = anyStale || (state.hasStaleAccepted && newAcceptedIndices.size > 0);

			// Cancel ENHANCE streams for segments that the backend re-segmented differently.
			for (const [segId] of Array.from(state.activeEnhanceRequestIdsBySegmentId.entries())) {
				const newIndex = newIndexById.get(segId);
				if (newIndex === undefined || newIndex >= firstDivergenceIndex) {
					cancelEnhanceStreamForSegment(state, segId);
					state.enhancedTextBySegmentId.delete(segId);
				}
			}

			// Render with backend-classified segments, then fire ENHANCE for each new one.
			renderDraftSegments(state, state.draftText, backendSegments, state.draftIsStale);

			for (const segment of backendSegments) {
				if (!state.activeEnhanceRequestIdsBySegmentId.has(segment.id) && !state.enhancedTextBySegmentId.has(segment.id)) {
					void dispatchEnhanceRequest(state, segment, backendSegments);
				}
			}
		};

		const resetActiveInputAfterCommit = (state: ActiveInputState): void => {
			removeGhostPanel(state);
			state.pendingGhostText = "";
			state.ghostStreamComplete = false;
			state.activeBindRequestId = undefined;
			state.activeSegmentRequestId = undefined;
			state.acceptedSegmentIndices = new Set<number>();
			state.acceptanceOrder = [];
			state.focusedSegmentIndex = undefined;
			state.hasStaleAccepted = false;
			state.bindHistoryWarning = undefined;
			clearActiveInputWork(state);
			clearDraftRendering(state); // cancels ENHANCE streams and clears maps
		};

		const handleSourceKeyDownEvent = (event: Event): void => {
			if (!(event instanceof KeyboardEvent)) {
				return;
			}

			if (event.isComposing) {
				return;
			}

			const state = activeInputState;
			const isOwnedState = state !== undefined && state.element === event.currentTarget;

			if (event.key === "Escape") {
				if (isOwnedState && state) {
					if (state.activeBindRequestId) {
						event.preventDefault();
						event.stopPropagation();
						cancelActiveBindStream(state);
						return;
					}
					if (state.bindPhase === "COMPLETE") {
						event.preventDefault();
						event.stopPropagation();
						state.bindPhase = "IDLE";
						state.pendingGhostText = "";
						state.ghostStreamComplete = false;
						updateGhostPanelStatus(state, REVIEW_HINT);
						return;
					}
					// BIND-UX-1: Esc leaves review mode (clears focus) so plain Enter sends
					// or inserts a newline normally again instead of accepting a clause.
					if (state.focusedSegmentIndex !== undefined) {
						event.preventDefault();
						event.stopPropagation();
						state.focusedSegmentIndex = undefined;
						restampAcceptedSegmentVisuals(state);
						clearDraftHoverPreview();
						return;
					}
				}
				clearDraftHoverPreview();
				return;
			}

			if (!isOwnedState || !state) {
				return;
			}

			if (event.key === "Tab") {
				// Nothing to review yet → let Tab behave normally (focus traversal, etc.).
				if (state.draftSegments.length === 0) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();

				const enteringReview = state.focusedSegmentIndex === undefined;
				focusSegment(state, event.shiftKey ? -1 : 1);
				// Surface the keymap the first time the user enters review mode.
				if (enteringReview) {
					ensureGhostPanel(state);
					updateGhostPanelStatus(state, REVIEW_HINT);
				}
				return;
			}

			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				event.stopPropagation();
				dispatchBindRequest(state);
				return;
			}

			// Commit takes priority over accept once the bound prompt is ready.
			if (event.key === "Enter" && state.ghostStreamComplete && state.pendingGhostText.length > 0) {
				event.preventDefault();
				event.stopPropagation();
				commitGhostTextToInput(state);
				return;
			}

			// BIND-UX-1: plain Enter accepts the focused clause, but ONLY in review mode
			// (a clause is focused). With no focus, Enter falls through so the host's
			// normal send/newline behavior is preserved.
			if (event.key === "Enter" && !event.shiftKey && state.focusedSegmentIndex !== undefined) {
				event.preventDefault();
				event.stopPropagation();
				acceptFocusedSegment(state);
				return;
			}
		};

		const scheduleDebouncedExtraction = (element: HTMLTextAreaElement | HTMLElement): void => {
			if (activeInputState && activeInputState.element !== element) {
				clearActiveInputWork(activeInputState);
				clearDraftRendering(activeInputState);
			}

			const previousState = activeInputState;
			if (previousState?.element === element) {
				if (previousState.activeBindRequestId) {
					cancelActiveBindStream(previousState);
				}
				clearActiveInputWork(previousState);
				previousState.draftIsStale = true;
				if (previousState.draftOverlayElement) {
					applyDraftOverlayFreshness(previousState.draftOverlayElement, true);
				}
				if (previousState.acceptedSegmentIndices.size > 0) {
					previousState.hasStaleAccepted = true;
					restampAcceptedSegmentVisuals(previousState);
				}
				setDraftHoverPreviewStale(element);
			}

			const abortController = new AbortController();
			const nextState: ActiveInputState = previousState?.element === element && previousState
				? {
					element,
					status: "TYPING",
					debounceTimerId: undefined,
					abortController,
					draftOverlayScrollListener: previousState.draftOverlayScrollListener,
					draftOverlayElement: previousState.draftOverlayElement,
					draftOverlayContentElement: previousState.draftOverlayContentElement,
					draftOverlaySegmentRootElement: previousState.draftOverlaySegmentRootElement,
					draftOverlayResizeObserver: previousState.draftOverlayResizeObserver,
					draftIsStale: previousState.draftIsStale,
					draftRenderMode: previousState.draftRenderMode,
					draftText: previousState.draftText,
					draftSegments: previousState.draftSegments,
					acceptedSegmentIndices: previousState.acceptedSegmentIndices,
					acceptanceOrder: previousState.acceptanceOrder,
					focusedSegmentIndex: previousState.focusedSegmentIndex,
					hasStaleAccepted: previousState.hasStaleAccepted,
					activeBindRequestId: previousState.activeBindRequestId,
					activeSegmentRequestId: previousState.activeSegmentRequestId,
					activeEnhanceRequestIdsBySegmentId: new Map(previousState.activeEnhanceRequestIdsBySegmentId),
					enhancedTextBySegmentId: new Map(previousState.enhancedTextBySegmentId),
					ghostPanelElement: previousState.ghostPanelElement,
					ghostPanelBodyElement: previousState.ghostPanelBodyElement,
					ghostPanelStatusElement: previousState.ghostPanelStatusElement,
					ghostPanelLayoutListener: previousState.ghostPanelLayoutListener,
					bindPhase: previousState.bindPhase,
					bindHistoryWarning: undefined,
					bindRecoveryObserver: previousState.bindRecoveryObserver,
					bindRecoveryTimeoutId: previousState.bindRecoveryTimeoutId,
					pendingGhostText: previousState.pendingGhostText,
					ghostStreamComplete: previousState.ghostStreamComplete,
				}
				: {
					element,
					status: "TYPING",
					debounceTimerId: undefined,
					abortController,
					draftOverlayScrollListener: undefined,
					draftOverlayElement: undefined,
					draftOverlayContentElement: undefined,
					draftOverlaySegmentRootElement: undefined,
					draftOverlayResizeObserver: undefined,
					draftIsStale: false,
					draftRenderMode: undefined,
					draftText: "",
					draftSegments: [],
					acceptedSegmentIndices: new Set<number>(),
					acceptanceOrder: [],
					focusedSegmentIndex: undefined,
					hasStaleAccepted: false,
					activeBindRequestId: undefined,
					activeSegmentRequestId: undefined,
					activeEnhanceRequestIdsBySegmentId: new Map(),
					enhancedTextBySegmentId: new Map(),
					ghostPanelElement: undefined,
					ghostPanelBodyElement: undefined,
					ghostPanelStatusElement: undefined,
					ghostPanelLayoutListener: undefined,
					bindPhase: "IDLE",
					bindHistoryWarning: undefined,
					bindRecoveryObserver: undefined,
					bindRecoveryTimeoutId: undefined,
					pendingGhostText: "",
					ghostStreamComplete: false,
				};

			ensureSourceScrollListenerInstalled(nextState);

			nextState.debounceTimerId = window.setTimeout(() => {
				void (async () => {
					if (abortController.signal.aborted) {
						return;
					}

					const extractedText = extractInputText(element);
					const normalizedText = normalizeDraftText(extractedText);
					const draftSegments = splitTextIntoDraftSegments(normalizedText);
					const bridgeMessage = await buildSegmentBridgeMessage(normalizedText);

					if (abortController.signal.aborted) {
						return;
					}

					nextState.debounceTimerId = undefined;
					nextState.abortController = undefined;

					nextState.status = "SEGMENTING";

					// Dependency-aware acceptance preservation:
					// Segments are identified by their stable positional id ("seg-${start}-${end}").
					// Find the first index where the old and new sequences diverge; any accepted
					// segment whose new index is >= that point has upstream changes and must be
					// marked stale rather than silently dropped.
					const oldSegments = nextState.draftSegments;

					let firstDivergenceIndex = Math.min(oldSegments.length, draftSegments.length);
					for (let i = 0; i < firstDivergenceIndex; i++) {
						if (oldSegments[i]?.id !== draftSegments[i]?.id) {
							firstDivergenceIndex = i;
							break;
						}
					}

					const newIndexById = new Map<string, number>();
					for (let i = 0; i < draftSegments.length; i++) {
						newIndexById.set(draftSegments[i]!.id, i);
					}

					const newAcceptedIndices = new Set<number>();
					const newAcceptanceOrder: number[] = [];
					let anyStale = false;

					for (const oldIndex of nextState.acceptanceOrder) {
						const oldSegment = oldSegments[oldIndex];
						if (!oldSegment) {
							continue;
						}
						const newIndex = newIndexById.get(oldSegment.id);
						if (newIndex === undefined) {
							// Segment was deleted — drop from accepted
							continue;
						}
						newAcceptedIndices.add(newIndex);
						newAcceptanceOrder.push(newIndex);
						if (newIndex >= firstDivergenceIndex) {
							anyStale = true;
						}
					}

					nextState.acceptedSegmentIndices = newAcceptedIndices;
					nextState.acceptanceOrder = newAcceptanceOrder;
					nextState.hasStaleAccepted = anyStale || (nextState.hasStaleAccepted && newAcceptedIndices.size > 0);

					// Cancel ENHANCE streams for segments that no longer exist or shifted
					// downstream of the first divergence point.
					for (const [segId] of Array.from(nextState.activeEnhanceRequestIdsBySegmentId.entries())) {
						const newIdx = newIndexById.get(segId);
						if (newIdx === undefined || newIdx >= firstDivergenceIndex) {
							cancelEnhanceStreamForSegment(nextState, segId);
							nextState.enhancedTextBySegmentId.delete(segId);
						}
					}

					// BIND-UX-1: do NOT auto-focus a clause on (re)segmentation. Underlines
					// render passively; the user enters review mode explicitly with Tab. This
					// keeps plain Enter wired to the host's send/newline until the user opts in.
					nextState.focusedSegmentIndex = undefined;
					nextState.activeSegmentRequestId = bridgeMessage.requestId;

					activeInputState = nextState;

					if (!bridgeMessage.jwt || bridgeMessage.paused) {
						if (!bridgeMessage.jwt) {
							console.warn("[content] skipping SEGMENT dispatch because no JWT was available");
							clearDraftRendering(nextState);
							clearDraftRendering(renderedDraftOverlayState);
						} else if (bridgeMessage.paused) {
							// Paused: keep the existing overlay on screen but mark it stale so the
							// underlines grey out (DRAFT_STALE_OPACITY + dashed stale color), signalling
							// that enhancements are not live. Re-segmentation/dispatch stays suppressed.
							nextState.draftIsStale = true;
							if (nextState.draftOverlayElement) {
								applyDraftOverlayFreshness(nextState.draftOverlayElement, true);
							}
							restampAcceptedSegmentVisuals(nextState);
						}
						return;
					}
					// `paused` is a content-script-only gate; the background bridge schema
					// is `.strict()` and rejects unknown keys, so it must not go over the wire.
					const { paused: _paused, ...wireMessage } = bridgeMessage;
					postToBridge(wireMessage);
					renderDraftSegments(nextState, normalizedText, draftSegments, false);
					if (import.meta.env.DEV) {
						console.log("Debounced extracted text:\n", extractedText);
					}
					})().catch((error) => {
						console.warn("Failed to send debounced extraction to background", error);
					});
			}, DEBOUNCE_DELAY_MS);

			activeInputState = nextState;
		};

		const handleInputEvent = (event: Event): void => {
			if (!(event.currentTarget instanceof HTMLTextAreaElement) && !(event.currentTarget instanceof HTMLElement)) {
				return;
			}

			scheduleDebouncedExtraction(event.currentTarget);
		};

		const extractInputText = (element: HTMLTextAreaElement | HTMLElement): string => {
			if (isValidTextarea(element) || element instanceof HTMLInputElement) {
				return (element as HTMLTextAreaElement | HTMLInputElement).value;
			}

			return extractContenteditableText(element);
		};

		const isValidTextarea = (element: Element): element is HTMLTextAreaElement => {
			return element instanceof HTMLTextAreaElement;
		};

		const isValidContenteditable = (element: Element): element is HTMLElement => {
			return (
				element instanceof HTMLElement &&
				element.matches('[contenteditable]:not([contenteditable="false"])') &&
				element.isContentEditable
			);
		};

		const isValidTextInput = (element: Element): element is HTMLInputElement => {
			return (
				element instanceof HTMLInputElement &&
				(element.type === "text" || element.type === "search")
			);
		};

		const isValidInput = (element: Element): element is HTMLTextAreaElement | HTMLElement => {
			return isValidTextarea(element) || isValidContenteditable(element) || isValidTextInput(element);
		};

		const isInstrumented = (element: Element): boolean => {
			// WeakSet is the source of truth (see BUG-REACT note at declaration).
			return _instrumentedElements.has(element);
		};

		const markInstrumented = (element: HTMLTextAreaElement | HTMLElement): void => {
			if (isInstrumented(element)) {
				return;
			}

			_instrumentedElements.add(element);
			// Collect a disposer for every listener/observer attached below so the element
			// can be fully torn down on removal or unload (dom-memory-management Rule 1-3).
			const cleanups: Array<() => void> = [];

			element.addEventListener("input", handleInputEvent);
			cleanups.push(() => element.removeEventListener("input", handleInputEvent));

			// Search inputs: browser fires "search" when the X clear button is clicked
			if (element instanceof HTMLInputElement && element.type === "search") {
				element.addEventListener("search", handleInputEvent);
				cleanups.push(() => element.removeEventListener("search", handleInputEvent));
			}

			// Contenteditable: detect programmatic content changes (e.g. ChatGPT post-submit clear).
			// No empty-text guard — same as handleInputEvent; the debounce callback handles clearing.
			if (isValidContenteditable(element)) {
				const clearObserver = new MutationObserver(() => {
					scheduleDebouncedExtraction(element);
				});
				clearObserver.observe(element, { childList: true, subtree: true, characterData: true });
				// AUD-10: previously orphaned — this observer pinned a detached input in memory.
				cleanups.push(() => clearObserver.disconnect());
			}

			element.addEventListener("mousemove", handleSourceMouseMoveEvent);
			cleanups.push(() => element.removeEventListener("mousemove", handleSourceMouseMoveEvent));
			element.addEventListener("mouseleave", handleSourceMouseLeaveEvent);
			cleanups.push(() => element.removeEventListener("mouseleave", handleSourceMouseLeaveEvent));
			element.addEventListener("blur", handleSourceBlurEvent);
			cleanups.push(() => element.removeEventListener("blur", handleSourceBlurEvent));
			element.addEventListener("keydown", handleSourceKeyDownEvent);
			cleanups.push(() => element.removeEventListener("keydown", handleSourceKeyDownEvent));

			_instrumentCleanups.set(element, cleanups);
			// DevTools visibility only — NOT the idempotency source of truth (React strips it).
			element.setAttribute(INSTRUMENTED_ATTRIBUTE, INSTRUMENTED_VALUE);
			if (import.meta.env.DEV) {
				console.log("Found valid input:", element);
			}
		};

		// Run and clear every disposer registered for an instrumented element, then drop
		// it from both registries so a re-added node (React move) re-instruments cleanly.
		// Best-effort: one failing disposer never blocks the rest (dom-memory-management Rule 3/7).
		const teardownInstrument = (element: Element): void => {
			const cleanups = _instrumentCleanups.get(element);
			if (cleanups) {
				for (const dispose of cleanups) {
					try {
						dispose();
					} catch {
						// swallow — teardown must be total even if one disposer throws
					}
				}
				_instrumentCleanups.delete(element);
			}
			_instrumentedElements.delete(element);
		};

		const scanNodeForInputs = (node: Node): void => {
			if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
				return;
			}

			const root = node as ParentNode;

			if (node instanceof Element && isValidInput(node) && !isInstrumented(node)) {
				markInstrumented(node);
			}

			for (const element of root.querySelectorAll("textarea, [contenteditable]:not([contenteditable='false']), input[type='text'], input[type='search']")) {
				if (isValidInput(element) && !isInstrumented(element)) {
					markInstrumented(element);
				}
			}
		};

		const scanDocumentForInputs = (): void => {
			if (!document.body) {
				return;
			}

			scanNodeForInputs(document.body);
		};

		const observeForInputDiscovery = (): MutationObserver | undefined => {
			if (!document.body) {
				return undefined;
			}

			const observer = new MutationObserver((mutationList) => {
				if (activeInputState?.element && !activeInputState.element.isConnected) {
					if (activeInputState.bindPhase === "BINDING" || activeInputState.bindPhase === "COMPLETE") {
						const replacement = findReplacementInput(activeInputState, mutationList);
						if (replacement) {
							clearBindRecoveryTracking(activeInputState);
							reattachActiveInput(activeInputState, replacement);
						} else {
							scheduleBindRecoveryFallback(activeInputState);
						}
					} else {
						clearActiveInputWork(activeInputState);
						cancelActiveBindStream(activeInputState);
						removeGhostPanel(activeInputState);
						clearDraftRendering(activeInputState);
					}
				}

				if (renderedDraftOverlayState?.element && !renderedDraftOverlayState.element.isConnected) {
					clearDraftRendering(renderedDraftOverlayState);
				}

				for (const mutation of mutationList) {
					if (mutation.type === "attributes") {
						if (mutation.attributeName === INSTRUMENTED_ATTRIBUTE) {
							continue;
						}

						continue;
					}

					if (mutation.type !== "childList") {
						continue;
					}

					for (const addedNode of mutation.addedNodes) {
						if (addedNode.nodeType === Node.ELEMENT_NODE || addedNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
							scanNodeForInputs(addedNode);
						}
					}
				}

				// dom-memory-management Rule 6: tear down any instrumented input that left the
				// DOM (SPA churn) so its listeners + clear-observer don't leak. isConnected is
				// checked after the whole batch, so a same-batch detach→reattach (React move)
				// stays connected and is NOT torn down.
				if (_instrumentCleanups.size > 0) {
					for (const instrumented of [..._instrumentCleanups.keys()]) {
						if (!instrumented.isConnected) {
							teardownInstrument(instrumented);
						}
					}
				}
			});

			observer.observe(document.body, {
				attributes: true,
				attributeFilter: [INSTRUMENTED_ATTRIBUTE],
				childList: true,
				subtree: true,
			});

			return observer;
		};

		// Defined here so attachPortListeners (below) can reference it without a
		// forward-declaration problem — all helpers it calls are already in scope.
		const handleBridgeMessage = (message: unknown): void => {
			if (import.meta.env.DEV) {
				console.debug("PromptCompiler bridge message", message);
			}

			if (typeof message !== "object" || message === null) {
				return;
			}

			const record = message as Record<string, unknown>;
			const type = typeof record.type === "string" ? record.type : "";
			const requestId = typeof record.requestId === "string" ? record.requestId : "";
			if (type.length === 0 || requestId.length === 0) {
				return;
			}

			const state = activeInputState;
			if (!state) {
				return;
			}

			// ── BIND stream ──────────────────────────────────────────────────────────
			if (state.activeBindRequestId === requestId) {
				if (type === "token" && typeof record.data === "string") {
					handleBindStreamToken(state, record.data);
					return;
				}
				if (type === "done") {
					handleBindStreamDone(state);
					return;
				}
				if (type === "warning" && typeof record.message === "string") {
					handleBindStreamWarning(state, record.message);
					return;
				}
				if (type === "error") {
					handleBindStreamError(state, typeof record.message === "string" ? record.message : "Bind stream failed");
					return;
				}
				return;
			}

			// ── SEGMENT response ─────────────────────────────────────────────────────
			if (state.activeSegmentRequestId === requestId) {
				if (type === "segment") {
					state.activeSegmentRequestId = undefined;
					if (typeof record.data === "object" && record.data !== null) {
						handleSegmentResponse(state, record.data as Record<string, unknown>);
					}
					return;
				}
				if (type === "error") {
					state.activeSegmentRequestId = undefined;
					// Mark the overlay stale so the user sees the degraded (stale) visual state.
					if (state.draftOverlayElement) {
						applyDraftOverlayFreshness(state.draftOverlayElement, true);
					}
					console.warn("[content] SEGMENT request failed:", record.message);
					return;
				}
				return;
			}

			// ── ENHANCE streams (one per segment, routed by requestId) ────────────────
			let enhanceSegmentId: string | undefined;
			for (const [segId, reqId] of state.activeEnhanceRequestIdsBySegmentId.entries()) {
				if (reqId === requestId) {
					enhanceSegmentId = segId;
					break;
				}
			}

			if (enhanceSegmentId !== undefined) {
				if (type === "token" && typeof record.data === "string") {
					handleEnhanceStreamToken(state, enhanceSegmentId, record.data);
					return;
				}
				if (type === "done") {
					handleEnhanceStreamDone(state, enhanceSegmentId);
					return;
				}
				if (type === "error") {
					handleEnhanceStreamError(state, enhanceSegmentId, typeof record.message === "string" ? record.message : "Enhance failed");
					return;
				}
				return;
			}
		};

		// ── Lazy port factory ─────────────────────────────────────────────────────
		// The MV3 service worker can be killed after 30 s of inactivity.  We never
		// hold a permanent reference to the port; instead we reconnect on demand
		// and re-attach both listeners to the fresh port object each time.

		const attachPortListeners = (port: chrome.runtime.Port): void => {
			port.onMessage.addListener(handleBridgeMessage);
			port.onDisconnect.addListener(() => {
				if (import.meta.env.DEV) {
					console.debug("PromptCompiler bridge disconnected — port will reconnect on next use");
				}
				_bridgePort = null;
				// The SW was killed while ENHANCE streams were active. Clear all dead request IDs
				// so the 120ms hover-preview fallback timer is no longer suppressed by has(segment.id),
				// and transition any open hover preview to "stale" rather than leaving it in "loading".
				if (activeInputState) {
					activeInputState.activeEnhanceRequestIdsBySegmentId.clear();
					setDraftHoverPreviewStale(activeInputState.element);
				}
			});
		};

		const getBridgePort = (): chrome.runtime.Port => {
			if (_bridgePort === null) {
				_bridgePort = chrome.runtime.connect({ name: BRIDGE_PORT_NAME });
				attachPortListeners(_bridgePort);
			}
			return _bridgePort;
		};

		// Single postMessage wrapper used by every call site.  If the port was
		// killed between the previous message and this one, getBridgePort()
		// reconnects synchronously before the message is handed off — so no
		// message is ever dropped into a dead port.  If the freshly created port
		// is itself immediately closed (SW still cold-starting), the catch nulls
		// the slot so the next call tries again.
		const postToBridge = (message: unknown): void => {
			try {
				getBridgePort().postMessage(message);
			} catch {
				_bridgePort = null;
			}
		};

		scanDocumentForInputs();
		const discoveryObserver = observeForInputDiscovery();
		void refreshClauseOrderingPreference();

		// BUG-ZINDEX: our overlay hosts use the maximum CSS z-index so underlines sit
		// above the host input. The side effect is that they also render above the
		// site's own modal dialogs (e.g. ChatGPT Settings), bleeding through the panel.
		// Rather than guess a "safe" z-index, suppress every extension overlay while a
		// semantic modal dialog is open and restore it when the dialog closes. We key on
		// aria-modal / role=alertdialog (true modals) so non-modal popups — dropdowns,
		// tooltips, date pickers — do NOT hide the underlines.
		const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"], [aria-modal="true"]';
		const EXTENSION_OVERLAY_SELECTOR =
			"[data-insta-draft-overlay], [data-insta-draft-hover-popover], [data-insta-ghost-panel]";
		const syncOverlaySuppressionForModals = (): void => {
			const hasModal = document.querySelector(MODAL_SELECTOR) !== null;
			for (const node of document.querySelectorAll<HTMLElement>(EXTENSION_OVERLAY_SELECTOR)) {
				node.style.visibility = hasModal ? "hidden" : "";
			}
		};
		const modalObserver = new MutationObserver(syncOverlaySuppressionForModals);
		if (document.body) {
			modalObserver.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["role", "aria-modal"],
			});
		}

		// Toast on focus of writing-surface inputs we can't instrument
		document.addEventListener("focusin", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			const isWritingSurface = target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.matches('[contenteditable]:not([contenteditable="false"])'));
			if (!isWritingSurface) {
				return;
			}
			if (isInstrumented(target)) {
				return;
			}
			if (_unsupportedToastShownFor.has(target)) {
				return;
			}
			_unsupportedToastShownFor.add(target);
			showUnsupportedInputToast();
		}, true);

		chrome.storage.onChanged.addListener((changes, areaName) => {
			if (areaName === "sync") {
				const orderingChange = changes[CLAUSE_ORDERING_STORAGE_KEY];
				if (orderingChange !== undefined) {
					const next = orderingChange.newValue;
					clauseOrderingPreference = isClauseOrdering(next) ? next : "entry";
					// Re-render the open hover popover so its clause number reflects the new mode.
					if (activeDraftHoverPreviewState) {
						renderDraftHoverPreview(activeDraftHoverPreviewState);
					}
				}
				return;
			}

			if (areaName !== "local") return;
			const authChange = changes[AUTH_STORAGE_KEY];
			if (authChange !== undefined && authChange.newValue === undefined) {
				clearActiveInputWork(activeInputState);
				clearDraftRendering(activeInputState);
				clearDraftRendering(renderedDraftOverlayState);
				activeInputState = undefined;
			}
		});

		getBridgePort(); // establish initial connection eagerly

		// dom-memory-management Rule 8: on content-script invalidation (extension reload,
		// update, or disable) the host page may persist. Disconnect the page-lifetime
		// observers and tear down every instrumented input so no observer or listener
		// outlives this script context (AUD-10 / G-3).
		ctx.onInvalidated(() => {
			discoveryObserver?.disconnect();
			modalObserver.disconnect();
			for (const instrumented of [..._instrumentCleanups.keys()]) {
				teardownInstrument(instrumented);
			}
		});
	},
});
