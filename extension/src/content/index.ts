import { GOAL_TYPE_VALUES, MODE_VALUES, type GoalType, type Mode, type SegmentRequest } from "../../../shared/contracts";

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main() {
		const BRIDGE_PORT_NAME = "insta_prompt_bridge";
		const SETTINGS_STORAGE_KEY = "promptcompiler.settings";
		const INSTRUMENTED_ATTRIBUTE = "data-insta-instrumented";
		const INSTRUMENTED_VALUE = "true";
		const DEBOUNCE_DELAY_MS = 400;
		const DEFAULT_BRIDGE_MODE: Mode = "balanced";
		const BRIDGE_FALLBACK_JWT = "promptcompiler-dev-jwt";
		const SESSION_EXPIRED_NOTICE = "Session expired — please reopen the extension";
		const DRAFT_HIGHLIGHT_NAME = "insta-prompt-draft-highlight";
		const DRAFT_HIGHLIGHT_STYLE_ID = "insta-prompt-draft-highlight-style";
		const DRAFT_OVERLAY_Z_INDEX = "2147483647";
		const DRAFT_HIGH_CONFIDENCE_THRESHOLD = 0.85;
		const DRAFT_LOW_CONFIDENCE_THRESHOLD = 0.55;
		const DRAFT_STALE_OPACITY = "0.45";
		const DRAFT_ACCEPTED_OPACITY = "0.4";
		const DRAFT_ACCEPTED_STALE_OPACITY = "0.3";
		const DRAFT_UNDERLINE_COLOR = "rgb(37 99 235 / 0.95)";
		const CANONICAL_ORDER_BY_GOAL_TYPE: Record<GoalType, number> = {
			// 1-indexed: matches backend canonical_order schema
			context: 1,
			tech_stack: 2,
			constraint: 3,
			action: 4,
			output_format: 5,
			edge_case: 6,
		};

		const GOAL_TYPE_PALETTE = {
			// Purple
			action: {
				cssVariable: "--insta-goal-type-action-color",
				color: "rgb(124 58 237)",
			},
			// Teal
			tech_stack: {
				cssVariable: "--insta-goal-type-tech-stack-color",
				color: "rgb(15 118 110)",
			},
			// Coral
			constraint: {
				cssVariable: "--insta-goal-type-constraint-color",
				color: "rgb(244 63 94)",
			},
			// Blue
			output_format: {
				cssVariable: "--insta-goal-type-output-format-color",
				color: "rgb(29 78 216)",
			},
			// Amber
			context: {
				cssVariable: "--insta-goal-type-context-color",
				color: "rgb(217 119 6)",
			},
			// Gray
			edge_case: {
				cssVariable: "--insta-goal-type-edge-case-color",
				color: "rgb(107 114 128)",
			},
		} as const satisfies Record<GoalType, { cssVariable: string; color: string }>;


		type InputLifecycleState = "IDLE" | "TYPING" | "SEGMENTING";
		type DraftRenderMode = "highlight" | "overlay";
		type DraftHoverPreviewStatus = "loading" | "ready" | "stale";

		interface DraftSegment {
			id: string;
			depends_on: string[];
			start: number;
			end: number;
			text: string;
			goalType: GoalType;
			confidence: number;
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
			status: DraftHoverPreviewStatus;
			containerElement: HTMLDivElement;
			shadowRoot: ShadowRoot;
			panelElement: HTMLDivElement;
			statusElement: HTMLDivElement;
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
			if (error instanceof Error) {
				return error.message.includes("Access to storage is not allowed");
			}

			if (typeof error === "string") {
				return error.includes("Access to storage is not allowed");
			}

			return false;
		};

		const readSessionStorageSnapshot = async (): Promise<Record<string, unknown>> => {
			try {
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

		const resolveBridgeContext = async (): Promise<{ mode: Mode; jwt: string | null }> => {
			const syncSnapshot = await readSyncStorageSnapshot();
			const localSnapshot = await chrome.storage.local.get(null);
			const sessionSnapshot = await readSessionStorageSnapshot();

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
					return { mode, jwt: accessToken.trim() };
				}
			}

			// Fall back to broad storage scan for dev/legacy tokens.
			for (const snapshot of [sessionSnapshot, localSnapshot]) {
				for (const candidate of Object.values(snapshot)) {
					const jwt = extractBridgeJwtCandidate(candidate);
					if (jwt) {
						return { mode, jwt };
					}
				}
			}

			return { mode, jwt: null };
		};

		const buildSegmentBridgeMessage = async (normalizedText: string): Promise<{
			verb: "SEGMENT";
			jwt: string | null;
			requestId: string;
			payload: SegmentRequest;
		}> => {
			const { mode, jwt } = await resolveBridgeContext();

			return {
				verb: "SEGMENT",
				jwt,
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
			return left.start === right.start && left.end === right.end && left.text === right.text && left.goalType === right.goalType && left.confidence === right.confidence;
		};

		const createDraftHoverPopoverShell = (): {
			containerElement: HTMLDivElement;
			panelElement: HTMLDivElement;
			statusElement: HTMLDivElement;
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
			styleElement.textContent = `
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
`;

			const panelElement = document.createElement("div");
			panelElement.dataset.draftHoverPanel = "true";
			panelElement.dataset.state = "loading";
			panelElement.setAttribute("role", "tooltip");

			const statusElement = document.createElement("div");
			statusElement.dataset.draftHoverStatus = "true";

			const bodyElement = document.createElement("div");
			bodyElement.dataset.draftHoverBody = "true";

			panelElement.append(statusElement, bodyElement);
			shadowRoot.append(styleElement, panelElement);
			getOverlayContainer().appendChild(containerElement);

			return { containerElement, panelElement, statusElement, bodyElement };
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

		const renderDraftHoverPreview = (hoverState: DraftHoverPreviewState): void => {
			const { statusElement, bodyElement, panelElement, segment, status } = hoverState;

			panelElement.dataset.state = status;

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
			const viewportPadding = 12;
			const anchorRect = hoverState.anchorRect;
			const estimatedWidth = 320;
			const estimatedHeight = hoverState.panelElement.getBoundingClientRect().height || 96;
			const clampedLeft = Math.max(viewportPadding, Math.min(anchorRect.left, window.innerWidth - estimatedWidth - viewportPadding));
			const belowTop = anchorRect.bottom + 10;
			const aboveTop = anchorRect.top - estimatedHeight - 10;
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
		): { segment: DraftSegment; rect: DOMRect } | undefined => {
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

				return { segment, rect };
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
				status: isStale ? "stale" : "loading",
				containerElement: undefined as unknown as HTMLDivElement,
				shadowRoot: undefined as unknown as ShadowRoot,
				panelElement: undefined as unknown as HTMLDivElement,
				statusElement: undefined as unknown as HTMLDivElement,
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
					confidence: 0,
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

		const updateDraftOverlayGeometry = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			hostElement: HTMLDivElement,
			contentElement: HTMLDivElement,
			segmentRootElement: HTMLDivElement | undefined,
		): void => {
			const rect = sourceElement.getBoundingClientRect();
			hostElement.style.left = `${rect.left}px`;
			hostElement.style.top = `${rect.top}px`;
			hostElement.style.width = `${rect.width}px`;
			hostElement.style.height = `${rect.height}px`;
			if (segmentRootElement) {
				segmentRootElement.style.width = `${sourceElement.clientWidth}px`;
			}
			syncDraftOverlayScrollPosition(sourceElement, contentElement);
		};

		const syncDraftOverlayScrollPosition = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			layer2Element: HTMLDivElement,
		): void => {
			layer2Element.style.transform = `translate(-${sourceElement.scrollLeft}px, -${sourceElement.scrollTop}px)`;
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
			const isHighConfidence = segment.confidence >= DRAFT_HIGH_CONFIDENCE_THRESHOLD;

			segmentSpan.dataset.accepted = isAccepted ? "true" : "false";
			segmentSpan.dataset.focused = isFocused ? "true" : "false";
			segmentSpan.dataset.acceptedStale = isStaleAccepted ? "true" : "false";

			if (isAccepted) {
				segmentSpan.style.opacity = isStaleAccepted ? DRAFT_ACCEPTED_STALE_OPACITY : DRAFT_ACCEPTED_OPACITY;
				segmentSpan.style.textDecorationLine = "underline";
				segmentSpan.style.textDecorationColor = isStaleAccepted ? "rgb(217 119 6)" : `var(${paletteEntry.cssVariable})`;
				segmentSpan.style.textDecorationStyle = isStaleAccepted ? "dashed" : "solid";
				segmentSpan.style.textDecorationThickness = "2px";
				segmentSpan.style.outline = "none";
			} else {
				segmentSpan.style.opacity = "1";
				segmentSpan.style.textDecorationColor = `var(${paletteEntry.cssVariable})`;
				segmentSpan.style.textDecorationStyle = isHighConfidence ? "solid" : "dashed";
				segmentSpan.style.textDecorationThickness = isHighConfidence ? "2px" : "1.5px";
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
				}

				const segmentSpan = document.createElement("span");
				const paletteEntry = GOAL_TYPE_PALETTE[segment.goalType];
				const isHighConfidence = segment.confidence >= DRAFT_HIGH_CONFIDENCE_THRESHOLD;
				const isAccepted = acceptedSegmentIndices.has(segmentIndex);
				const isFocused = focusedSegmentIndex === segmentIndex;
				const isStaleAccepted = isAccepted && hasStaleAccepted;

				segmentSpan.dataset.goalType = segment.goalType;
				segmentSpan.dataset.segmentIndex = String(segmentIndex);
				segmentSpan.dataset.confidence = segment.confidence.toFixed(2);
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
				segmentSpan.style.textDecorationStyle = isHighConfidence ? "solid" : "dashed";
				segmentSpan.style.textDecorationThickness = isHighConfidence ? "2px" : "1.5px";
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
			style.textContent = `
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

		const acceptNextSegment = (state: ActiveInputState): boolean => {
			if (state.draftSegments.length === 0) {
				return false;
			}

			const nextIndex = findNextUnacceptedIndex(state, state.focusedSegmentIndex);
			if (nextIndex === undefined) {
				return false;
			}

			state.acceptedSegmentIndices.add(nextIndex);
			state.acceptanceOrder.push(nextIndex);
			state.focusedSegmentIndex = findNextUnacceptedIndex(state, nextIndex + 1) ?? nextIndex;
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

		const skipFocusedSegment = (state: ActiveInputState): boolean => {
			if (state.draftSegments.length === 0 || state.focusedSegmentIndex === undefined) {
				return false;
			}
			// Find the next unaccepted segment after the current focus, wrapping around.
			// findNextUnacceptedIndex wraps back through indices < start, which would re-hit
			// focusedSegmentIndex itself if it is the only unaccepted segment — treat that
			// as a no-op so focus does not appear to move.
			const next = findNextUnacceptedIndex(state, state.focusedSegmentIndex + 1);
			if (next === undefined || next === state.focusedSegmentIndex) {
				return false;
			}
			state.focusedSegmentIndex = next;
			restampAcceptedSegmentVisuals(state);
			return true;
		};

		const isBindGateOpen = (state: ActiveInputState): boolean => {
			return state.acceptedSegmentIndices.size > 0 && !state.hasStaleAccepted;
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
				console.warn("[content] bind blocked", {
					accepted: state.acceptedSegmentIndices.size,
					hasStaleAccepted: state.hasStaleAccepted,
				});
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
				const confidence = typeof section.confidence === "number" ? section.confidence : 0.5;

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
					confidence,
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
				}
				clearDraftHoverPreview();
				return;
			}

			if (!isOwnedState || !state) {
				return;
			}

			if (event.key === "Tab") {
				event.preventDefault();
				event.stopPropagation();

				if (event.shiftKey) {
					skipFocusedSegment(state);
				} else {
					acceptNextSegment(state);
				}
				return;
			}

			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				event.stopPropagation();
				dispatchBindRequest(state);
				return;
			}

			if (event.key === "Enter" && state.ghostStreamComplete && state.pendingGhostText.length > 0) {
				event.preventDefault();
				event.stopPropagation();
				commitGhostTextToInput(state);
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

					// Focus: advance to the first unaccepted segment after re-segmentation
					let nextFocused: number | undefined;
					if (draftSegments.length > 0) {
						for (let i = 0; i < draftSegments.length; i++) {
							if (!newAcceptedIndices.has(i)) {
								nextFocused = i;
								break;
							}
						}
						if (nextFocused === undefined) {
							nextFocused = 0;
						}
					}
					nextState.focusedSegmentIndex = nextFocused;
					nextState.activeSegmentRequestId = bridgeMessage.requestId;

					activeInputState = nextState;

					if (!bridgeMessage.jwt) {
						console.warn("[content] skipping SEGMENT dispatch because no JWT was available");
					} else {
						postToBridge(bridgeMessage);
					}
					renderDraftSegments(nextState, normalizedText, draftSegments, false);
					console.log("Debounced extracted text:\n", extractedText);
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
			if (isValidTextarea(element)) {
				return element.value;
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

		const isValidInput = (element: Element): element is HTMLTextAreaElement | HTMLElement => {
			return isValidTextarea(element) || isValidContenteditable(element);
		};

		const isInstrumented = (element: Element): boolean => {
			return element.getAttribute(INSTRUMENTED_ATTRIBUTE) === INSTRUMENTED_VALUE;
		};

		const markInstrumented = (element: HTMLTextAreaElement | HTMLElement): void => {
			if (isInstrumented(element)) {
				return;
			}

			element.addEventListener("input", handleInputEvent);
			element.addEventListener("mousemove", handleSourceMouseMoveEvent);
			element.addEventListener("mouseleave", handleSourceMouseLeaveEvent);
			element.addEventListener("blur", handleSourceBlurEvent);
			element.addEventListener("keydown", handleSourceKeyDownEvent);
			element.setAttribute(INSTRUMENTED_ATTRIBUTE, INSTRUMENTED_VALUE);
			console.log("Found valid input:", element);
		};

		const scanNodeForInputs = (node: Node): void => {
			if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
				return;
			}

			const root = node as ParentNode;

			if (node instanceof Element && isValidInput(node) && !isInstrumented(node)) {
				markInstrumented(node);
			}

			for (const element of root.querySelectorAll("textarea, [contenteditable]:not([contenteditable='false'])")) {
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
			console.debug("PromptCompiler bridge message", message);

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
					// Mark the overlay stale so the user sees degraded confidence indicators.
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
				console.debug("PromptCompiler bridge disconnected — port will reconnect on next use");
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
		observeForInputDiscovery();
		getBridgePort(); // establish initial connection eagerly
	},
});
