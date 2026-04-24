export default defineBackground(() => {
	const BACKEND_BASE_URL = "http://localhost:3000";
	const KEEPALIVE_ALARM_NAME = "keepalive";
	const KEEPALIVE_PERIOD_MINUTES = 1;
	const TAB_STATE_STORAGE_PREFIX = "promptcompiler.tabState.";
	const BRIDGE_PORT_NAME = "insta_prompt_bridge";
	const BRIDGE_VERBS = ["SEGMENT", "ENHANCE", "BIND", "CANCEL"] as const;

	type BridgeVerb = (typeof BRIDGE_VERBS)[number];
	type DataBridgeVerb = Exclude<BridgeVerb, "CANCEL">;
	type BridgeRequestId = string;
	type StreamTokenEvent = { type: "token"; data: string };
	type StreamDoneEvent = { type: "done" };
	type StreamErrorEvent = { type: "error"; message: string };
	type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;
	type SegmentResponse = { sections: Array<Record<string, unknown>> };
	type PersistedTabState = {
		tabId: number;
		requestId: string;
		verb: DataBridgeVerb;
		startedAt: number;
	};
	type BridgeMessageBase = {
		jwt: string;
		requestId?: string;
		payload?: unknown;
		request?: unknown;
	} & Record<string, unknown>;
	type SegmentBridgeMessage = BridgeMessageBase & {
		verb: "SEGMENT";
	};
	type EnhanceBridgeMessage = BridgeMessageBase & {
		verb: "ENHANCE";
	};
	type BindBridgeMessage = BridgeMessageBase & {
		verb: "BIND";
	};
	type CancelBridgeMessage = BridgeMessageBase & {
		verb: "CANCEL";
	};
	type DataBridgeMessage = SegmentBridgeMessage | EnhanceBridgeMessage | BindBridgeMessage;
	type BridgeMessage = DataBridgeMessage | CancelBridgeMessage;
	type ActiveRequest = {
		tabId: number | null;
		controller: AbortController;
		terminalSent: boolean;
		verb: DataBridgeVerb;
	};

	const activeRequestsById = new Map<BridgeRequestId, ActiveRequest>();
	const orphanedTabIds = new Set<number>();
	let sessionRecoveryPromise: Promise<void> | null = null;

	function getTabStateStorageKey(tabId: number): string {
		return `${TAB_STATE_STORAGE_PREFIX}${tabId}`;
	}

	function isPersistedTabState(value: unknown): value is PersistedTabState {
		return isPlainObject(value)
			&& typeof value.tabId === "number"
			&& Number.isFinite(value.tabId)
			&& typeof value.requestId === "string"
			&& value.requestId.trim().length > 0
			&& isBridgeVerb(value.verb)
			&& typeof value.startedAt === "number"
			&& Number.isFinite(value.startedAt);
	}

	async function persistTabState(state: PersistedTabState): Promise<void> {
		await chrome.storage.session.set({ [getTabStateStorageKey(state.tabId)]: state });
	}

	async function clearTabState(tabId: number): Promise<void> {
		await chrome.storage.session.remove(getTabStateStorageKey(tabId));
	}

	async function clearTabStateIfCurrent(tabId: number, requestId: string): Promise<void> {
		const storageKey = getTabStateStorageKey(tabId);
		const storedState = await chrome.storage.session.get(storageKey);
		const currentState = storedState[storageKey];

		if (!isPersistedTabState(currentState) || currentState.requestId !== requestId) {
			return;
		}

		await chrome.storage.session.remove(storageKey);
	}

	async function recoverOrphanedTabState(): Promise<void> {
		const sessionSnapshot = await chrome.storage.session.get(null);
		const keysToRemove: string[] = [];

		for (const [key, value] of Object.entries(sessionSnapshot)) {
			if (!key.startsWith(TAB_STATE_STORAGE_PREFIX)) {
				continue;
			}

			keysToRemove.push(key);

			if (isPersistedTabState(value)) {
				orphanedTabIds.add(value.tabId);
			}
		}

		if (keysToRemove.length > 0) {
			await chrome.storage.session.remove(keysToRemove);
		}
	}

	sessionRecoveryPromise = recoverOrphanedTabState().catch((error) => {
		console.warn("Failed to recover background tab state", error);
	});

	function isBridgeVerb(value: unknown): value is BridgeVerb {
		return typeof value === "string" && BRIDGE_VERBS.includes(value as BridgeVerb);
	}

	function isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	function isStreamEvent(value: unknown): value is StreamEvent {
		if (!isPlainObject(value) || typeof value.type !== "string") {
			return false;
		}

		switch (value.type) {
			case "token":
				return typeof value.data === "string";
			case "error":
				return typeof value.message === "string";
			case "done":
				return true;
			default:
				return false;
		}
	}

	function isBridgeMessage(message: unknown): message is BridgeMessage {
		if (!isPlainObject(message) || !isBridgeVerb(message.verb) || typeof message.jwt !== "string" || message.jwt.trim().length === 0) {
			return false;
		}

		if (message.verb === "CANCEL") {
			return true;
		}

		return isPlainObject(message.payload) || isPlainObject(message.request) || Object.keys(message).some((key) => !["verb", "jwt", "requestId", "payload", "request"].includes(key));
	}

	function getRequestId(message: BridgeMessage): BridgeRequestId {
		const explicitRequestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
		return explicitRequestId.length > 0 ? explicitRequestId : crypto.randomUUID();
	}

	function getRequestBody(message: BridgeMessage): Record<string, unknown> {
		if (isPlainObject(message.payload)) {
			return message.payload;
		}

		if (isPlainObject(message.request)) {
			return message.request;
		}

		const requestBody: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(message)) {
			if (key === "verb" || key === "jwt" || key === "requestId" || key === "payload" || key === "request") {
				continue;
			}

			requestBody[key] = value;
		}

		return requestBody;
	}

	function getEndpointPath(verb: DataBridgeVerb): string {
		switch (verb) {
			case "SEGMENT":
				return "/segment";
			case "ENHANCE":
				return "/enhance";
			case "BIND":
				return "/bind";
		}
	}

	function buildRequestHeaders(jwt: string, accept: string): Headers {
		const headers = new Headers();
		headers.set("Authorization", `Bearer ${jwt}`);
		headers.set("Content-Type", "application/json");
		headers.set("Accept", accept);
		return headers;
	}

	function safePostMessage(port: chrome.runtime.Port, message: Record<string, unknown>, portClosed: () => boolean): void {
		if (portClosed()) {
			return;
		}

		try {
			port.postMessage(message);
		} catch (error) {
			console.warn("Failed to post bridge message", error);
		}
	}

	function readBridgeErrorMessage(errorBody: unknown, fallbackStatus: number): string {
		if (isPlainObject(errorBody)) {
			const nestedError = errorBody.error;
			if (isPlainObject(nestedError) && typeof nestedError.message === "string" && nestedError.message.trim().length > 0) {
				return nestedError.message;
			}

			if (typeof errorBody.message === "string" && errorBody.message.trim().length > 0) {
				return errorBody.message;
			}
		}

		return `HTTP ${fallbackStatus}`;
	}

	async function readErrorMessage(response: Response): Promise<string> {
		const jsonResponse = response.clone();
		const textResponse = response.clone();
		const contentType = jsonResponse.headers.get("content-type") ?? "";

		if (contentType.includes("application/json")) {
			try {
				return readBridgeErrorMessage(await jsonResponse.json(), jsonResponse.status);
			} catch {
				// Fall through to text parsing below.
			}
		}

		try {
			const text = (await textResponse.text()).trim();
			if (text.length > 0) {
				return text;
			}
		} catch {
			// Fall through to the status-based fallback.
		}

		return `HTTP ${jsonResponse.status}`;
	}

	function parseSseBlock(block: string): StreamEvent | null {
		const dataLines: string[] = [];

		for (const line of block.split("\n")) {
			if (line.length === 0 || line.startsWith(":")) {
				continue;
			}

			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}

		if (dataLines.length === 0) {
			return null;
		}

		const parsed = JSON.parse(dataLines.join("\n")) as unknown;
		if (!isStreamEvent(parsed)) {
			throw new Error("Received malformed SSE frame from backend");
		}

		return parsed;
	}

	function postStreamEvent(port: chrome.runtime.Port, requestId: BridgeRequestId, event: StreamEvent, portClosed: () => boolean): void {
		safePostMessage(port, { ...event, requestId }, portClosed);
	}

	function setTerminalState(requestId: BridgeRequestId, terminalSent: boolean): void {
		const request = activeRequestsById.get(requestId);
		if (!request) {
			return;
		}

		request.terminalSent = terminalSent;
	}

	function hasTerminalBeenSent(requestId: BridgeRequestId): boolean {
		return activeRequestsById.get(requestId)?.terminalSent ?? false;
	}

	function clearRequest(requestId: BridgeRequestId): void {
		activeRequestsById.delete(requestId);
	}

	function getRequestsForTab(tabId: number | null | undefined): Array<[BridgeRequestId, ActiveRequest]> {
		if (typeof tabId !== "number" || !Number.isFinite(tabId)) {
			return [];
		}

		return Array.from(activeRequestsById.entries()).filter(([, request]) => request.tabId === tabId);
	}

	async function persistRequestState(tabId: number | null | undefined, requestId: string, verb: DataBridgeVerb): Promise<void> {
		if (typeof tabId !== "number" || !Number.isFinite(tabId)) {
			return;
		}

		await persistTabState({
			tabId,
			requestId,
			verb,
			startedAt: Date.now(),
		});
	}

	async function clearRequestState(tabId: number | null | undefined, requestId: string): Promise<void> {
		if (typeof tabId !== "number" || !Number.isFinite(tabId)) {
			return;
		}

		try {
			await clearTabStateIfCurrent(tabId, requestId);
		} catch (error) {
			console.warn("Failed to clear tab session state", { tabId, requestId, error });
		}
	}

	function sendOrphanedTabSignal(port: chrome.runtime.Port, tabId: number, requestId: BridgeRequestId, portClosed: () => boolean): void {
		if (!orphanedTabIds.has(tabId)) {
			return;
		}

		orphanedTabIds.delete(tabId);
		safePostMessage(
			port,
			{
				type: "error",
				requestId,
				message: "Recovered tab state was cleared after a worker restart.",
				recovery: "orphaned_tab",
			},
			portClosed,
		);
	}

	async function dispatchSegmentRequest(port: chrome.runtime.Port, message: SegmentBridgeMessage, requestId: BridgeRequestId, portClosed: () => boolean): Promise<void> {
		const requestState: ActiveRequest = {
			tabId: port.sender?.tab?.id ?? null,
			controller: new AbortController(),
			terminalSent: false,
			verb: "SEGMENT",
		};
		activeRequestsById.set(requestId, requestState);

		try {
			await persistRequestState(requestState.tabId, requestId, requestState.verb);
		} catch (error) {
			console.warn("Failed to persist segment tab state", { tabId: requestState.tabId, requestId, error });
			setTerminalState(requestId, true);
			safePostMessage(port, {
				type: "error",
				requestId,
				message: "Unable to persist tab session state.",
			}, portClosed);
			clearRequest(requestId);
			return;
		}

		try {
			const response = await fetch(new URL(getEndpointPath("SEGMENT"), BACKEND_BASE_URL), {
				method: "POST",
				headers: buildRequestHeaders(message.jwt, "application/json"),
				body: JSON.stringify(getRequestBody(message)),
				signal: requestState.controller.signal,
			});

			if (!response.ok) {
				const errorMessage = await readErrorMessage(response);
				setTerminalState(requestId, true);
				safePostMessage(port, { type: "error", requestId, message: errorMessage }, portClosed);
				return;
			}

			const responseBody = (await response.json()) as SegmentResponse;
			setTerminalState(requestId, true);
			safePostMessage(port, { type: "segment", requestId, data: responseBody }, portClosed);
		} catch (error) {
			if (requestState.controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") {
				if (!hasTerminalBeenSent(requestId)) {
					setTerminalState(requestId, true);
					safePostMessage(port, { type: "done", requestId }, portClosed);
				}
				return;
			}

			if (!hasTerminalBeenSent(requestId)) {
				setTerminalState(requestId, true);
				safePostMessage(port, {
					type: "error",
					requestId,
					message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Segment request failed.",
				}, portClosed);
			}
		} finally {
			await clearRequestState(requestState.tabId, requestId);
			clearRequest(requestId);
		}
	}

	async function dispatchStreamingRequest(port: chrome.runtime.Port, message: EnhanceBridgeMessage | BindBridgeMessage, requestId: BridgeRequestId, portClosed: () => boolean): Promise<void> {
		const requestState: ActiveRequest = {
			tabId: port.sender?.tab?.id ?? null,
			controller: new AbortController(),
			terminalSent: false,
			verb: message.verb,
		};
		activeRequestsById.set(requestId, requestState);

		try {
			await persistRequestState(requestState.tabId, requestId, requestState.verb);
		} catch (error) {
			console.warn("Failed to persist streaming tab state", { tabId: requestState.tabId, requestId, error });
			setTerminalState(requestId, true);
			safePostMessage(port, {
				type: "error",
				requestId,
				message: "Unable to persist tab session state.",
			}, portClosed);
			clearRequest(requestId);
			return;
		}

		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		let buffer = "";
		const decoder = new TextDecoder();

		try {
			const response = await fetch(new URL(getEndpointPath(message.verb), BACKEND_BASE_URL), {
				method: "POST",
				headers: buildRequestHeaders(message.jwt, "text/event-stream"),
				body: JSON.stringify(getRequestBody(message)),
				signal: requestState.controller.signal,
			});

			if (!response.ok) {
				const errorMessage = await readErrorMessage(response);
				setTerminalState(requestId, true);
				safePostMessage(port, { type: "error", requestId, message: errorMessage }, portClosed);
				return;
			}

			if (!response.body) {
				setTerminalState(requestId, true);
				safePostMessage(port, { type: "error", requestId, message: "Streaming response body is missing." }, portClosed);
				return;
			}

			reader = response.body.getReader();

			for (;;) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

				for (;;) {
					const separatorIndex = buffer.indexOf("\n\n");
					if (separatorIndex === -1) {
						break;
					}

					const frame = buffer.slice(0, separatorIndex);
					buffer = buffer.slice(separatorIndex + 2);

					const parsedEvent = parseSseBlock(frame);
					if (!parsedEvent) {
						continue;
					}

					postStreamEvent(port, requestId, parsedEvent, portClosed);

					if (parsedEvent.type === "done" || parsedEvent.type === "error") {
						setTerminalState(requestId, true);
						return;
					}
				}
			}

			buffer += decoder.decode();
			for (;;) {
				const separatorIndex = buffer.indexOf("\n\n");
				if (separatorIndex === -1) {
					break;
				}

				const frame = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);

				const parsedEvent = parseSseBlock(frame);
				if (!parsedEvent) {
					continue;
				}

				postStreamEvent(port, requestId, parsedEvent, portClosed);

				if (parsedEvent.type === "done" || parsedEvent.type === "error") {
					setTerminalState(requestId, true);
					return;
				}
			}

			if (!hasTerminalBeenSent(requestId)) {
				setTerminalState(requestId, true);
				safePostMessage(port, { type: "done", requestId }, portClosed);
			}
		} catch (error) {
			if (requestState.controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") {
				if (!hasTerminalBeenSent(requestId)) {
					setTerminalState(requestId, true);
					safePostMessage(port, { type: "done", requestId }, portClosed);
				}
				return;
			}

			if (!hasTerminalBeenSent(requestId)) {
				setTerminalState(requestId, true);
				safePostMessage(port, {
					type: "error",
					requestId,
					message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Streaming request failed.",
				}, portClosed);
			}
		} finally {
			await clearRequestState(requestState.tabId, requestId);
			reader?.releaseLock();
			clearRequest(requestId);
		}
	}

	async function ensureKeepaliveAlarm(): Promise<void> {
		const alarm = await chrome.alarms.get(KEEPALIVE_ALARM_NAME);

		if (!alarm || alarm.periodInMinutes !== KEEPALIVE_PERIOD_MINUTES) {
			await chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: KEEPALIVE_PERIOD_MINUTES });
		}
	}

	void ensureKeepaliveAlarm();

	chrome.runtime.onStartup.addListener(() => {
		void ensureKeepaliveAlarm();
	});

	chrome.runtime.onInstalled.addListener(() => {
		void ensureKeepaliveAlarm();
	});

	chrome.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === KEEPALIVE_ALARM_NAME) {
			console.debug("Keepalive alarm tick");
		}
	});

	chrome.runtime.onConnect.addListener((port) => {
		if (port.name !== BRIDGE_PORT_NAME) {
			return;
		}

		const tabId = port.sender?.tab?.id;
		let portClosed = false;
		const isPortClosed = () => portClosed;

		console.log("Accepted bridge port connection", { tabId });

		if (typeof tabId === "number" && Number.isFinite(tabId) && sessionRecoveryPromise) {
			void sessionRecoveryPromise.then(() => {
				if (!portClosed) {
					sendOrphanedTabSignal(port, tabId, `recovery-${tabId}`, isPortClosed);
				}
			});
		}

		port.onMessage.addListener((message) => {
			if (!isBridgeMessage(message)) {
				console.warn("Ignoring malformed bridge message", { tabId, message });
				return;
			}

			void (async () => {
				await sessionRecoveryPromise;

				if (portClosed) {
					return;
				}

				const requestId = getRequestId(message);
				const currentTabId = typeof tabId === "number" && Number.isFinite(tabId) ? tabId : null;

				if (currentTabId !== null && orphanedTabIds.has(currentTabId)) {
					sendOrphanedTabSignal(port, currentTabId, requestId, isPortClosed);
					return;
				}

				if (message.verb === "CANCEL") {
					console.log("Received bridge verb", { tabId, verb: message.verb, requestId });
					const requestIdsToAbort = message.requestId && message.requestId.trim().length > 0
						? [message.requestId.trim()]
						: (currentTabId !== null ? getRequestsForTab(currentTabId).map(([targetRequestId]) => targetRequestId) : Array.from(activeRequestsById.keys()));

					for (const targetRequestId of requestIdsToAbort) {
						const request = activeRequestsById.get(targetRequestId);
						if (!request) {
							continue;
						}

						if (!request.terminalSent) {
							request.terminalSent = true;
							safePostMessage(port, { type: "done", requestId: targetRequestId }, isPortClosed);
						}

						request.controller.abort();
						await clearRequestState(request.tabId, targetRequestId);
					}

					if (currentTabId !== null) {
						await clearTabState(currentTabId);
					}

					return;
				}

				console.log("Received bridge verb", { tabId, verb: message.verb, requestId });

				if (message.verb === "SEGMENT") {
					void dispatchSegmentRequest(port, message, requestId, isPortClosed);
					return;
				}

				void dispatchStreamingRequest(port, message as EnhanceBridgeMessage | BindBridgeMessage, requestId, isPortClosed);
			})().catch((error) => {
				console.warn("Bridge message handling failed", { tabId, message, error });
			});
		});

		port.onDisconnect.addListener(() => {
			portClosed = true;
			const requestsToAbort = typeof tabId === "number" && Number.isFinite(tabId)
				? getRequestsForTab(tabId)
				: Array.from(activeRequestsById.entries());

			for (const [requestId, request] of requestsToAbort) {
				request.controller.abort();
				clearRequest(requestId);
				void clearRequestState(request.tabId, requestId);
			}

			if (typeof tabId === "number" && Number.isFinite(tabId)) {
				void clearTabState(tabId);
			}
			console.log("Bridge port disconnected", { tabId });
		});
	});
});

