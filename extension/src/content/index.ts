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
		const DRAFT_HIGHLIGHT_NAME = "insta-prompt-draft-highlight";
		const DRAFT_HIGHLIGHT_STYLE_ID = "insta-prompt-draft-highlight-style";
		const DRAFT_OVERLAY_Z_INDEX = "2147483647";
		const DRAFT_HIGH_CONFIDENCE_THRESHOLD = 0.7;
		const DRAFT_LOW_CONFIDENCE_THRESHOLD = 0.55;
		const DRAFT_STALE_OPACITY = "0.45";
		const DRAFT_UNDERLINE_COLOR = "rgb(37 99 235 / 0.95)";

		const GOAL_TYPE_PALETTE = {
			context: {
				cssVariable: "--insta-goal-type-context-color",
				color: "rgb(15 118 110)",
			},
			tech_stack: {
				cssVariable: "--insta-goal-type-tech-stack-color",
				color: "rgb(29 78 216)",
			},
			constraint: {
				cssVariable: "--insta-goal-type-constraint-color",
				color: "rgb(180 83 9)",
			},
			action: {
				cssVariable: "--insta-goal-type-action-color",
				color: "rgb(21 128 61)",
			},
			output_format: {
				cssVariable: "--insta-goal-type-output-format-color",
				color: "rgb(109 40 217)",
			},
			edge_case: {
				cssVariable: "--insta-goal-type-edge-case-color",
				color: "rgb(185 28 28)",
			},
		} as const satisfies Record<GoalType, { cssVariable: string; color: string }>;

		const GOAL_TYPE_KEYWORDS: Record<GoalType, readonly string[]> = {
			context: ["context", "background", "overview", "summary", "this is", "these", "here", "project", "page", "system"],
			tech_stack: ["react", "typescript", "javascript", "css", "html", "dom", "textarea", "contenteditable", "extension", "observer", "shadow dom", "resizeobserver"],
			constraint: ["must not", "must", "should not", "should", "never", "only", "without", "require", "cannot", "do not"],
			action: ["add", "build", "create", "implement", "make", "fix", "render", "show", "paint", "display", "track", "keep", "attach", "apply", "update", "copy", "recompute", "derive", "write", "map", "set", "sync"],
			output_format: ["json", "markdown", "table", "list", "bullet", "code", "output", "format", "response"],
			edge_case: ["edge case", "fallback", "error", "stale", "empty", "missing", "invalid", "null", "zero", "unexpected"],
		};

		type InputLifecycleState = "IDLE" | "TYPING" | "SEGMENTING";
		type DraftRenderMode = "highlight" | "overlay";
		type DraftHoverPreviewStatus = "loading" | "ready" | "stale";

		interface DraftSegment {
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
			draftOverlayElement: HTMLDivElement | undefined;
			draftOverlayContentElement: HTMLDivElement | undefined;
			draftOverlayResizeObserver: ResizeObserver | undefined;
			draftIsStale: boolean;
			draftRenderMode: DraftRenderMode | undefined;
			draftText: string;
			draftSegments: DraftSegment[];
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
		const bridgePort = chrome.runtime.connect({ name: BRIDGE_PORT_NAME });

		const isBlockLevelElement = (element: Element): boolean => {
			return BLOCK_LEVEL_TAGS.has(element.tagName);
		};

		const normalizeDraftText = (text: string): string => {
			return text.replace(/\r\n?/g, "\n");
		};

		const isModeValue = (value: unknown): value is Mode => {
			return typeof value === "string" && MODE_VALUES.includes(value as Mode);
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

		const resolveBridgeContext = async (): Promise<{ mode: Mode; jwt: string }> => {
			const localSnapshot = await chrome.storage.local.get(null);
			const sessionSnapshot = await readSessionStorageSnapshot();

			let mode: Mode = DEFAULT_BRIDGE_MODE;
			const storedSettings = localSnapshot[SETTINGS_STORAGE_KEY];
			if (typeof storedSettings === "object" && storedSettings !== null && !Array.isArray(storedSettings)) {
				const storedMode = (storedSettings as { mode?: unknown }).mode;
				if (isModeValue(storedMode)) {
					mode = storedMode;
				}
			}

			for (const snapshot of [sessionSnapshot, localSnapshot]) {
				for (const candidate of Object.values(snapshot)) {
					const jwt = extractBridgeJwtCandidate(candidate);
					if (jwt) {
						return { mode, jwt };
					}
				}
			}

			return { mode, jwt: BRIDGE_FALLBACK_JWT };
		};

		const buildSegmentBridgeMessage = async (normalizedText: string): Promise<{
			verb: "SEGMENT";
			jwt: string;
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
				case "ready":
					statusElement.textContent = "Ready";
					bodyElement.textContent = getDraftHoverPreviewBodyText(segment);
					break;
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
				scheduleDraftHoverPreviewReady(hoverState);
			}
		};

		const restoreDraftHoverPreviewFromLastPointer = (sourceElement: HTMLTextAreaElement | HTMLElement): void => {
			if (!lastDraftHoverPoint) {
				return;
			}

			syncDraftHoverPreviewFromPoint(sourceElement, lastDraftHoverPoint.clientX, lastDraftHoverPoint.clientY);
		};

		const classifyDraftSegment = (segmentText: string): { goalType: GoalType; confidence: number } => {
			const normalizedText = segmentText.trim().toLowerCase();
			const goalTypeScores = new Map<GoalType, number>();

			for (const goalType of GOAL_TYPE_VALUES) {
				goalTypeScores.set(goalType, 0);
			}

			for (const goalType of GOAL_TYPE_VALUES) {
				const keywords = GOAL_TYPE_KEYWORDS[goalType];
				let score = goalTypeScores.get(goalType) ?? 0;

				for (const keyword of keywords) {
					if (!normalizedText.includes(keyword)) {
						continue;
					}

					score += keyword.includes(" ") ? 2 : 1;
				}

				if (goalType === "action" && /^(add|build|create|implement|make|fix|render|show|paint|display|track|keep|attach|apply|update|copy|recompute|derive|write|map|set|sync)\b/.test(normalizedText)) {
					score += 2;
				}

				if (goalType === "constraint" && /\b(must|should|never|only|without|require|cannot|do not)\b/.test(normalizedText)) {
					score += 2;
				}

				goalTypeScores.set(goalType, score);
			}

			let winningGoalType: GoalType = GOAL_TYPE_VALUES[0];
			let winningScore = -1;
			let runnerUpScore = -1;

			for (const goalType of GOAL_TYPE_VALUES) {
				const score = goalTypeScores.get(goalType) ?? 0;

				if (score > winningScore) {
					runnerUpScore = winningScore;
					winningGoalType = goalType;
					winningScore = score;
					continue;
				}

				if (score > runnerUpScore) {
					runnerUpScore = score;
				}
			}

			if (winningScore <= 0) {
				return {
					goalType: winningGoalType,
					confidence: 0.42,
				};
			}

			const conflictPenalty = runnerUpScore > 0 ? Math.min(0.16, runnerUpScore * 0.08) : 0;
			const confidence = Math.max(0.35, Math.min(0.97, 0.62 + winningScore * 0.12 - conflictPenalty));

			return {
				goalType: winningGoalType,
				confidence,
			};
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
					start,
					end,
					text: normalizedText.slice(start, end),
					...classifyDraftSegment(normalizedText.slice(start, end)),
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

			target.style.boxSizing = computedStyle.boxSizing;
			target.style.font = computedStyle.font;
			target.style.fontFamily = computedStyle.fontFamily;
			target.style.fontSize = computedStyle.fontSize;
			target.style.fontStyle = computedStyle.fontStyle;
			target.style.fontWeight = computedStyle.fontWeight;
			target.style.fontStretch = computedStyle.fontStretch;
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
			target.style.fontKerning = computedStyle.fontKerning;
			target.style.fontVariant = computedStyle.fontVariant;
			target.style.fontFeatureSettings = computedStyle.fontFeatureSettings;
			target.style.fontVariationSettings = computedStyle.fontVariationSettings;
			target.style.lineHeight = computedStyle.lineHeight;
			target.style.letterSpacing = computedStyle.letterSpacing;
			target.style.textAlign = computedStyle.textAlign;
			target.style.textIndent = computedStyle.textIndent;
			target.style.textTransform = computedStyle.textTransform;
			target.style.direction = computedStyle.direction;
			target.style.whiteSpace = computedStyle.whiteSpace;
			target.style.wordBreak = computedStyle.wordBreak;
			target.style.overflowWrap = computedStyle.overflowWrap;
			target.style.paddingTop = computedStyle.paddingTop;
			target.style.paddingRight = computedStyle.paddingRight;
			target.style.paddingBottom = computedStyle.paddingBottom;
			target.style.paddingLeft = computedStyle.paddingLeft;
			target.style.background = "transparent";
			target.style.color = "transparent";
			target.style.caretColor = "transparent";
			target.style.overflow = "hidden";
			target.style.pointerEvents = "none";
			target.style.userSelect = "none";
			target.style.setProperty("-webkit-user-select", "none");
			target.style.setProperty("-webkit-text-fill-color", "transparent");
		};

		const clearDraftRendering = (state: ActiveInputState | undefined): void => {
			if (!state) {
				return;
			}

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

			state.draftOverlayContentElement = undefined;
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
			contentElement.style.whiteSpace = "inherit";
			contentElement.style.transformOrigin = "top left";

			hostElement.appendChild(contentElement);
			getOverlayContainer().appendChild(hostElement);

			return { hostElement, contentElement };
		};

		const updateDraftOverlayGeometry = (
			sourceElement: HTMLTextAreaElement | HTMLElement,
			hostElement: HTMLDivElement,
			contentElement: HTMLDivElement,
		): void => {
			const rect = sourceElement.getBoundingClientRect();
			hostElement.style.left = `${rect.left}px`;
			hostElement.style.top = `${rect.top}px`;
			hostElement.style.width = `${rect.width}px`;
			hostElement.style.height = `${rect.height}px`;
			hostElement.scrollTop = sourceElement.scrollTop;
			hostElement.scrollLeft = sourceElement.scrollLeft;
			contentElement.scrollTop = sourceElement.scrollTop;
			contentElement.scrollLeft = sourceElement.scrollLeft;
			contentElement.style.transform = `translate(${-sourceElement.scrollLeft}px, ${-sourceElement.scrollTop}px)`;
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

			updateDraftOverlayGeometry(state.element, state.draftOverlayElement, state.draftOverlayContentElement);
		};

		const ensureDraftOverlaySyncListenersInstalled = (): void => {
			if (draftOverlaySyncListenersInstalled) {
				return;
			}

			draftOverlaySyncListenersInstalled = true;
			window.addEventListener("scroll", syncActiveDraftOverlayPosition, true);
			window.addEventListener("resize", syncActiveDraftOverlayPosition);
		};

		const renderDraftOverlaySegments = (
			contentElement: HTMLDivElement,
			extractedText: string,
			segments: DraftSegment[],
			isStale: boolean,
		): void => {
			contentElement.replaceChildren();

			const segmentRoot = document.createElement("div");
			segmentRoot.dataset.instaDraftSegmentRoot = "true";
			segmentRoot.dataset.instaDraftSegments = String(segments.length);
			segmentRoot.style.position = "relative";
			segmentRoot.style.width = "100%";
			segmentRoot.style.minHeight = "100%";
			segmentRoot.style.boxSizing = "border-box";
			segmentRoot.style.border = "0";
			segmentRoot.style.borderRadius = "inherit";
			segmentRoot.style.background = "transparent";
			segmentRoot.style.color = "transparent";
			segmentRoot.style.caretColor = "transparent";
			segmentRoot.style.font = "inherit";
			segmentRoot.style.lineHeight = "inherit";
			segmentRoot.style.letterSpacing = "inherit";
			segmentRoot.style.whiteSpace = "inherit";
			segmentRoot.style.wordBreak = "inherit";
			segmentRoot.style.overflowWrap = "inherit";
			segmentRoot.style.margin = "0";
			segmentRoot.style.padding = "0";
			segmentRoot.style.pointerEvents = "none";
			segmentRoot.style.userSelect = "none";
			segmentRoot.style.setProperty("-webkit-user-select", "none");
			segmentRoot.style.setProperty("-webkit-text-fill-color", "transparent");
			segmentRoot.style.opacity = isStale ? DRAFT_STALE_OPACITY : "1";

			const fragment = document.createDocumentFragment();
			let cursor = 0;

			for (const [segmentIndex, segment] of segments.entries()) {
				if (cursor < segment.start) {
					fragment.appendChild(document.createTextNode(extractedText.slice(cursor, segment.start)));
				}

				const segmentSpan = document.createElement("span");
				const paletteEntry = GOAL_TYPE_PALETTE[segment.goalType];
				const isHighConfidence = segment.confidence >= DRAFT_HIGH_CONFIDENCE_THRESHOLD;

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
				segmentSpan.textContent = segment.text;
				fragment.appendChild(segmentSpan);
				cursor = segment.end;
			}

			if (cursor < extractedText.length) {
				fragment.appendChild(document.createTextNode(extractedText.slice(cursor)));
			}

			segmentRoot.appendChild(fragment);
			contentElement.appendChild(segmentRoot);
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
			clearDraftRendering(state);

			const overlayShell = createDraftOverlayShell(state.element);
			installDraftOverlayResizeObserver(state);
			updateDraftOverlayGeometry(state.element, overlayShell.hostElement, overlayShell.contentElement);
			renderDraftOverlaySegments(overlayShell.contentElement, extractedText, segments, isStale);
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

			state.status = "IDLE";
		};

		const handleSourceScrollEvent = (event: Event): void => {
			if (!(event.currentTarget instanceof HTMLElement)) {
				return;
			}

			clearDraftHoverPreview();

			if (activeInputState?.element === event.currentTarget) {
				syncActiveDraftOverlayPosition();
			}
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

		const handleSourceKeyDownEvent = (event: Event): void => {
			if (!(event instanceof KeyboardEvent) || event.key !== "Escape") {
				return;
			}

			clearDraftHoverPreview();
		};

		const scheduleDebouncedExtraction = (element: HTMLTextAreaElement | HTMLElement): void => {
			if (activeInputState && activeInputState.element !== element) {
				clearActiveInputWork(activeInputState);
				clearDraftRendering(activeInputState);
			}

			const previousState = activeInputState;
			if (previousState?.element === element) {
				clearActiveInputWork(previousState);
				previousState.draftIsStale = true;
				if (previousState.draftOverlayElement) {
					applyDraftOverlayFreshness(previousState.draftOverlayElement, true);
				}
				setDraftHoverPreviewStale(element);
			}

			const abortController = new AbortController();
			const nextState: ActiveInputState = {
				element,
				status: "TYPING",
				debounceTimerId: undefined,
				abortController,
				draftOverlayElement: undefined,
				draftOverlayContentElement: undefined,
				draftOverlayResizeObserver: undefined,
				draftIsStale: false,
				draftRenderMode: undefined,
				draftText: "",
				draftSegments: [],
			};

			nextState.debounceTimerId = window.setTimeout(() => {
				void (async () => {
					if (abortController.signal.aborted) {
						return;
					}

					if (previousState?.draftOverlayElement) {
						clearDraftRendering(previousState);
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
					activeInputState = nextState;

					bridgePort.postMessage(bridgeMessage);
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
			element.addEventListener("scroll", handleSourceScrollEvent, { passive: true });
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
					clearActiveInputWork(activeInputState);
					clearDraftRendering(activeInputState);
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

		scanDocumentForInputs();
		observeForInputDiscovery();

		bridgePort.onMessage.addListener((message) => {
			console.debug("PromptCompiler bridge message", message);
		});

		bridgePort.onDisconnect.addListener(() => {
			console.debug("PromptCompiler bridge disconnected");
		});
	},
});

