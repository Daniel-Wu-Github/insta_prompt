export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main() {
		const BRIDGE_PORT_NAME = "insta_prompt_bridge";
		const INSTRUMENTED_ATTRIBUTE = "data-insta-instrumented";
		const INSTRUMENTED_VALUE = "true";
		const DEBOUNCE_DELAY_MS = 400;
		const DRAFT_HIGHLIGHT_NAME = "insta-prompt-draft-highlight";
		const DRAFT_HIGHLIGHT_STYLE_ID = "insta-prompt-draft-highlight-style";
		const DRAFT_OVERLAY_Z_INDEX = "2147483647";
		const DRAFT_UNDERLINE_COLOR = "rgb(37 99 235 / 0.95)";

		type InputLifecycleState = "IDLE" | "TYPING" | "SEGMENTING";
		type DraftRenderMode = "highlight" | "overlay";

		interface DraftSegment {
			start: number;
			end: number;
			text: string;
		}

		interface ActiveInputState {
			element: HTMLTextAreaElement | HTMLElement;
			status: InputLifecycleState;
			debounceTimerId: number | undefined;
			abortController: AbortController | undefined;
			draftOverlayElement: HTMLDivElement | undefined;
			draftOverlayContentElement: HTMLDivElement | undefined;
			draftRenderMode: DraftRenderMode | undefined;
			draftText: string;
			draftSegments: DraftSegment[];
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
		let draftOverlaySyncListenersInstalled = false;

		const isBlockLevelElement = (element: Element): boolean => {
			return BLOCK_LEVEL_TAGS.has(element.tagName);
		};

		const normalizeDraftText = (text: string): string => {
			return text.replace(/\r\n?/g, "\n");
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
			target.style.font = computedStyle.font;
			target.style.lineHeight = computedStyle.lineHeight;
			target.style.letterSpacing = computedStyle.letterSpacing;
			target.style.fontKerning = computedStyle.fontKerning;
			target.style.fontVariant = computedStyle.fontVariant;
			target.style.fontFeatureSettings = computedStyle.fontFeatureSettings;
			target.style.fontVariationSettings = computedStyle.fontVariationSettings;
			target.style.textAlign = computedStyle.textAlign;
			target.style.textIndent = computedStyle.textIndent;
			target.style.textTransform = computedStyle.textTransform;
			target.style.direction = computedStyle.direction;
			target.style.whiteSpace = "pre-wrap";
			target.style.wordBreak = "break-word";
			target.style.overflowWrap = "anywhere";
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

			const highlightRegistry = getDraftHighlightRegistry();
			highlightRegistry?.delete(DRAFT_HIGHLIGHT_NAME);

			if (state.draftOverlayElement) {
				state.draftOverlayElement.remove();
				state.draftOverlayElement = undefined;
			}

			state.draftOverlayContentElement = undefined;
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

			const contentElement = document.createElement("div");
			contentElement.style.position = "absolute";
			contentElement.style.inset = "0";
			contentElement.style.pointerEvents = "none";
			contentElement.style.color = "transparent";
			contentElement.style.caretColor = "transparent";
			contentElement.style.userSelect = "none";
			contentElement.style.setProperty("-webkit-user-select", "none");
			contentElement.style.setProperty("-webkit-text-fill-color", "transparent");
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
			contentElement.style.transform = `translate(${-sourceElement.scrollLeft}px, ${-sourceElement.scrollTop}px)`;
		};

		const syncActiveDraftOverlayPosition = (): void => {
			const state = activeInputState;

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

		const renderFallbackDraftOverlay = (
			contentElement: HTMLDivElement,
			extractedText: string,
			segments: DraftSegment[],
		): void => {
			contentElement.replaceChildren();

			const fragment = document.createDocumentFragment();
			let cursor = 0;

			for (const segment of segments) {
				if (cursor < segment.start) {
					fragment.appendChild(document.createTextNode(extractedText.slice(cursor, segment.start)));
				}

				const segmentSpan = document.createElement("span");
				segmentSpan.style.textDecorationLine = "underline";
				segmentSpan.style.textDecorationColor = DRAFT_UNDERLINE_COLOR;
				segmentSpan.style.textDecorationThickness = "2px";
				segmentSpan.style.textDecorationSkipInk = "none";
				segmentSpan.style.textUnderlineOffset = "2px";
				segmentSpan.style.color = "transparent";
				segmentSpan.style.setProperty("-webkit-text-fill-color", "transparent");
				segmentSpan.textContent = extractedText.slice(segment.start, segment.end);
				fragment.appendChild(segmentSpan);
				cursor = segment.end;
			}

			if (cursor < extractedText.length) {
				fragment.appendChild(document.createTextNode(extractedText.slice(cursor)));
			}

			contentElement.appendChild(fragment);
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
		): void => {
			if (!state.element.isConnected || extractedText.length === 0 || segments.length === 0) {
				clearDraftRendering(state);
				return;
			}

			ensureDraftOverlaySyncListenersInstalled();
			clearDraftRendering(state);

			const overlayShell = createDraftOverlayShell(state.element);
			updateDraftOverlayGeometry(state.element, overlayShell.hostElement, overlayShell.contentElement);

			let renderedWithHighlights = false;
			if (canUseCustomHighlights()) {
				renderedWithHighlights = renderHighlightedDraftOverlay(overlayShell.contentElement, extractedText, segments);
			}

			if (!renderedWithHighlights) {
				renderFallbackDraftOverlay(overlayShell.contentElement, extractedText, segments);
				state.draftRenderMode = "overlay";
			} else {
				state.draftRenderMode = "highlight";
			}

			state.draftOverlayElement = overlayShell.hostElement;
			state.draftOverlayContentElement = overlayShell.contentElement;
			state.draftText = extractedText;
			state.draftSegments = segments;
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

			if (activeInputState?.element === event.currentTarget) {
				syncActiveDraftOverlayPosition();
			}
		};

		const scheduleDebouncedExtraction = (element: HTMLTextAreaElement | HTMLElement): void => {
			if (activeInputState && activeInputState.element !== element) {
				clearActiveInputWork(activeInputState);
				clearDraftRendering(activeInputState);
			}

			const previousState = activeInputState;
			if (previousState?.element === element) {
				clearActiveInputWork(previousState);
				clearDraftRendering(previousState);
			}

			const abortController = new AbortController();
			const nextState: ActiveInputState = {
				element,
				status: "TYPING",
				debounceTimerId: undefined,
				abortController,
				draftOverlayElement: undefined,
				draftOverlayContentElement: undefined,
				draftRenderMode: undefined,
				draftText: "",
				draftSegments: [],
			};

			nextState.debounceTimerId = window.setTimeout(() => {
				if (abortController.signal.aborted) {
					return;
				}

				const extractedText = extractInputText(element);
				const normalizedText = normalizeDraftText(extractedText);
				const draftSegments = splitTextIntoDraftSegments(normalizedText);

				nextState.debounceTimerId = undefined;
				nextState.abortController = undefined;
				nextState.status = "SEGMENTING";
				activeInputState = nextState;

				renderDraftSegments(nextState, normalizedText, draftSegments);
				console.log("Debounced extracted text:\n", extractedText);
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

		const bridgePort = chrome.runtime.connect({ name: BRIDGE_PORT_NAME });

		bridgePort.onMessage.addListener((message) => {
			console.debug("PromptCompiler bridge message", message);
		});

		bridgePort.onDisconnect.addListener(() => {
			console.debug("PromptCompiler bridge disconnected");
		});
	},
});

