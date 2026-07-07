import { z } from "zod";

export default defineBackground(() => {
	const IS_DEV = import.meta.env.DEV;
	const BACKEND_BASE_URL = typeof import.meta.env.VITE_API_BASE_URL === "string"
		? import.meta.env.VITE_API_BASE_URL.trim()
		: "";
	if (import.meta.env.PROD && (!BACKEND_BASE_URL || BACKEND_BASE_URL.includes("localhost"))) {
		console.error("[PromptCompiler] FATAL: BACKEND_BASE_URL is missing or points to localhost in a production build.");
	}
	const KEEPALIVE_ALARM_NAME = "keepalive";
	const KEEPALIVE_PERIOD_MINUTES = 1;
	const TAB_STATE_STORAGE_PREFIX = "promptcompiler.tabState.";
	const AUTH_STORAGE_KEY = "promptcompiler.auth";
	const REFRESH_LOCK_STORAGE_KEY = "promptcompiler.refresh_lock";
	const REFRESH_LOCK_MAX_AGE_MS = 10_000;
	const REFRESH_LOCK_POLL_INTERVAL_MS = 250;
	const BRIDGE_PORT_NAME = "insta_prompt_bridge";
	const BRIDGE_VERBS = ["SEGMENT", "ENHANCE", "BIND", "CANCEL"] as const;

	type BridgeVerb = (typeof BRIDGE_VERBS)[number];
	type DataBridgeVerb = Exclude<BridgeVerb, "CANCEL">;
	type BridgeRequestId = string;
	type StreamTokenEvent = { type: "token"; data: string };
	type StreamDoneEvent = { type: "done" };
	type StreamErrorEvent = { type: "error"; message: string };
	type StreamWarningEvent = { type: "warning"; message: string };
	type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent | StreamWarningEvent;
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

	type StoredAuth = {
		access_token: string;
		refresh_token: string | null;
		expires_at: number;
	};

	type RefreshLock = {
		refreshing: boolean;
		startedAt: number;
	};

	const bridgePayloadBaseSchema = z.object({
		jwt: z.string().trim().min(1),
		requestId: z.string().trim().min(1).optional(),
	});

	const segmentBridgeMessageSchema = bridgePayloadBaseSchema.extend({
		verb: z.literal("SEGMENT"),
		payload: z.object({
			segments: z.array(z.string().trim().min(1)).min(1),
			mode: z.string().trim().min(1),
		}).strict(),
	}).strict();

	const enhanceBridgeMessageSchema = bridgePayloadBaseSchema.extend({
		verb: z.literal("ENHANCE"),
		payload: z.object({
			section: z.object({
				id: z.string().trim().min(1),
				text: z.string().trim().min(1),
				goal_type: z.string().trim().min(1),
			}).strict(),
			siblings: z.array(z.object({
				id: z.string().trim().min(1),
				text: z.string().trim().min(1),
				goal_type: z.string().trim().min(1),
			}).strict()),
			mode: z.string().trim().min(1),
			project_id: z.string().trim().min(1).nullable(),
		}).strict(),
	}).strict();

	const bindBridgeMessageSchema = bridgePayloadBaseSchema.extend({
		verb: z.literal("BIND"),
		payload: z.object({
			sections: z.array(z.object({
				canonical_order: z.number().int().min(1).max(6),
				goal_type: z.string().trim().min(1),
				expansion: z.string().trim().min(1),
				// Option E: unaccepted clauses ride along for verbatim pass-through.
				accepted: z.boolean().optional(),
			}).strict()).min(1),
			mode: z.string().trim().min(1),
		}).strict(),
	}).strict();

	const cancelBridgeMessageSchema = bridgePayloadBaseSchema.extend({
		verb: z.literal("CANCEL"),
	}).strict();

	const bridgeMessageSchema = z.discriminatedUnion("verb", [
		segmentBridgeMessageSchema,
		enhanceBridgeMessageSchema,
		bindBridgeMessageSchema,
		cancelBridgeMessageSchema,
	]);

	const refreshTokenMessageSchema = z.object({
		type: z.literal("REFRESH_TOKEN"),
	}).strict();

	const accountStatusRequestSchema = z.object({
		type: z.literal("ACCOUNT_STATUS_REQUEST"),
		jwt: z.string().trim().min(1),
	}).strict();

	function isStoredAuth(value: unknown): value is StoredAuth {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return false;
		}
		const record = value as Record<string, unknown>;
		return typeof record.access_token === "string" && record.access_token.trim().length > 0 && typeof record.expires_at === "number";
	}

	function isRefreshLock(value: unknown): value is RefreshLock {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return false;
		}

		const record = value as Record<string, unknown>;
		return record.refreshing === true && typeof record.startedAt === "number" && Number.isFinite(record.startedAt);
	}

	// Singleton promise: serialises concurrent token refresh attempts so a single-use
	// refresh_token is never sent twice in parallel by two simultaneous 401 responses.
	let tokenRefreshPromise: Promise<string | null> | null = null;

	async function readStoredAuth(): Promise<StoredAuth | undefined> {
		const [localSnapshot, sessionSnapshot] = await Promise.all([
			chrome.storage.local.get(AUTH_STORAGE_KEY),
			chrome.storage.session.get(AUTH_STORAGE_KEY),
		]);

		for (const snapshot of [localSnapshot, sessionSnapshot]) {
			const auth = snapshot[AUTH_STORAGE_KEY];
			if (isStoredAuth(auth)) {
				return auth;
			}
		}

		return undefined;
	}

	async function writeStoredAuth(auth: StoredAuth): Promise<void> {
		await Promise.all([
			chrome.storage.local.set({ [AUTH_STORAGE_KEY]: auth }),
			chrome.storage.session.set({ [AUTH_STORAGE_KEY]: auth }),
		]);
	}

	async function clearStoredAuth(): Promise<void> {
		await Promise.all([
			chrome.storage.local.remove(AUTH_STORAGE_KEY),
			chrome.storage.session.remove(AUTH_STORAGE_KEY),
		]);
	}

	async function readRefreshLock(): Promise<RefreshLock | undefined> {
		const snapshot = await chrome.storage.session.get(REFRESH_LOCK_STORAGE_KEY);
		const lock = snapshot[REFRESH_LOCK_STORAGE_KEY];
		return isRefreshLock(lock) ? lock : undefined;
	}

	async function writeRefreshLock(): Promise<void> {
		await chrome.storage.session.set({
			[REFRESH_LOCK_STORAGE_KEY]: {
				refreshing: true,
				startedAt: Date.now(),
			},
		});
	}

	async function clearRefreshLock(): Promise<void> {
		await chrome.storage.session.remove(REFRESH_LOCK_STORAGE_KEY);
	}

	async function waitForUpdatedAuth(previousAccessToken: string | null): Promise<string | null> {
		const deadline = Date.now() + REFRESH_LOCK_MAX_AGE_MS;

		while (Date.now() < deadline) {
			const stored = await readStoredAuth();
			if (stored && (!previousAccessToken || stored.access_token !== previousAccessToken)) {
				return stored.access_token;
			}

			await new Promise((resolve) => {
				setTimeout(resolve, REFRESH_LOCK_POLL_INTERVAL_MS);
			});
		}

		return null;
	}

	async function doRefreshAccessToken(): Promise<string | null> {
		let lockWasWritten = false;

		try {
			const auth = await readStoredAuth();
			const lock = await readRefreshLock();

			if (lock && lock.refreshing) {
				if (Date.now() - lock.startedAt <= REFRESH_LOCK_MAX_AGE_MS) {
					return await waitForUpdatedAuth(auth?.access_token ?? null);
				}

				await clearRefreshLock();
			}

			if (!auth || !auth.refresh_token) {
				return null;
			}

			await writeRefreshLock();
			lockWasWritten = true;

			const authTokenUrl = getBackendUrl("/auth/token");
			if (!authTokenUrl) {
				return null;
			}

			const response = await fetch(authTokenUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
				},
				body: JSON.stringify({ refresh_token: auth.refresh_token }),
			});

			if (!response.ok) {
				await clearStoredAuth();
				return null;
			}

			const data = (await response.json()) as Record<string, unknown>;
			const newAccessToken = typeof data.token === "string" ? data.token.trim() : "";
			if (!newAccessToken) {
				await clearStoredAuth();
				return null;
			}

			const newRefreshToken =
				typeof data.refresh_token === "string" && data.refresh_token.trim().length > 0
					? data.refresh_token.trim()
					: auth.refresh_token;
			const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
			const newAuth: StoredAuth = {
				access_token: newAccessToken,
				refresh_token: newRefreshToken,
				expires_at: Date.now() + expiresIn * 1000,
			};
			await writeStoredAuth(newAuth);
			return newAccessToken;
		} catch {
			return null;
		} finally {
			if (lockWasWritten) {
				await clearRefreshLock();
			}
		}
	}

	function refreshAccessToken(): Promise<string | null> {
		if (tokenRefreshPromise) {
			return tokenRefreshPromise;
		}
		tokenRefreshPromise = doRefreshAccessToken().finally(() => {
			tokenRefreshPromise = null;
		});
		return tokenRefreshPromise;
	}

	// Fires the request once; on 401 attempts a token refresh and retries exactly once.
	// Returns the final Response (which may still be non-ok if retry also failed).
	async function fetchWithTokenRefresh(
		url: URL,
		jwt: string,
		accept: string,
		bodyJson: string,
		requestId: string,
		signal: AbortSignal,
		forceGroq?: boolean,
	): Promise<Response> {
		const firstResponse = await fetch(url, {
			method: "POST",
			headers: buildRequestHeaders(jwt, accept, requestId, forceGroq),
			body: bodyJson,
			signal,
		});

		if (firstResponse.status !== 401) {
			return firstResponse;
		}

		const newToken = await refreshAccessToken();
		if (!newToken) {
			return firstResponse;
		}

		return fetch(url, {
			method: "POST",
			headers: buildRequestHeaders(newToken, accept, requestId, forceGroq),
			body: bodyJson,
			signal,
		});
	}

	async function fetchAccountStatus(jwt: string): Promise<Record<string, unknown> | null> {
		const accountStatusUrl = getBackendUrl("/account/status");
		if (!accountStatusUrl) {
			return null;
		}

		const response = await fetch(accountStatusUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as Record<string, unknown>;
	}

	function isTrustedInternalSender(sender: chrome.runtime.MessageSender): boolean {
		return sender.id === chrome.runtime.id
			&& sender.tab === undefined
			&& typeof sender.url === "string"
			&& sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
			&& sender.url.endsWith("/popup.html");
	}

	function isTrustedBridgePortSender(sender: chrome.runtime.MessageSender | undefined): boolean {
		return sender?.id === chrome.runtime.id && typeof sender.tab?.id === "number";
	}

	function getBackendUrl(pathname: string): URL | null {
		if (!BACKEND_BASE_URL) {
			return null;
		}

		try {
			return new URL(pathname, BACKEND_BASE_URL);
		} catch {
			return null;
		}
	}

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (!isTrustedInternalSender(sender) || !isPlainObject(message) || typeof message.type !== "string") {
			return false;
		}

		const refreshTokenMessage = refreshTokenMessageSchema.safeParse(message);
		if (refreshTokenMessage.success) {
			void (async () => {
				const accessToken = await refreshAccessToken();
				sendResponse({ accessToken });
			})().catch((error) => {
				console.warn("Failed to refresh access token from popup", error);
				sendResponse({ accessToken: null });
			});
			return true;
		}

		const accountStatusMessage = accountStatusRequestSchema.safeParse(message);
		if (accountStatusMessage.success) {
			void (async () => {
				const payload = await fetchAccountStatus(accountStatusMessage.data.jwt);
				sendResponse(payload);
			})().catch((error) => {
				console.warn("Failed to fetch account status from popup", error);
				sendResponse(null);
			});
			return true;
		}

		return false;
	});

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
			case "warning":
				return typeof value.message === "string";
			case "done":
				return true;
			default:
				return false;
		}
	}

	type ValidationFailure = { ok: false; reason: string };
	type ValidationSuccess = { ok: true; message: BridgeMessage };

	function validateBridgeMessage(raw: unknown): ValidationFailure | ValidationSuccess {
		const parsed = bridgeMessageSchema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, reason: "invalid bridge message shape" };
		}

		return { ok: true, message: parsed.data };
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

	const FORCE_GROQ_STORAGE_KEY = "promptcompiler.forceGroq";

	function buildRequestHeaders(jwt: string, accept: string, requestId?: string, forceGroq?: boolean): Headers {
		const headers = new Headers();
		headers.set("Authorization", `Bearer ${jwt}`);
		headers.set("Content-Type", "application/json");
		headers.set("Accept", accept);
		if (requestId && requestId.length > 0) {
			headers.set("X-Request-ID", requestId);
		}
		if (forceGroq) {
			headers.set("X-Force-Groq", "1");
		}
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
			const segmentUrl = getBackendUrl(getEndpointPath("SEGMENT"));
			if (!segmentUrl) {
				setTerminalState(requestId, true);
				safePostMessage(port, {
					type: "error",
					requestId,
					message: "Backend URL is not configured.",
				}, portClosed);
				return;
			}
			const segmentBody = JSON.stringify(getRequestBody(message));
			const { [FORCE_GROQ_STORAGE_KEY]: forceGroqRaw } = await chrome.storage.sync.get(FORCE_GROQ_STORAGE_KEY);
			const response = await fetchWithTokenRefresh(
				segmentUrl,
				message.jwt,
				"application/json",
				segmentBody,
				requestId,
				requestState.controller.signal,
				forceGroqRaw === true,
			);

			if (!response.ok) {
				const errorMessage = response.status === 401
					? "Session expired. Please sign in again."
					: await readErrorMessage(response);
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
			const streamUrl = getBackendUrl(getEndpointPath(message.verb));
			if (!streamUrl) {
				setTerminalState(requestId, true);
				safePostMessage(port, {
					type: "error",
					requestId,
					message: "Backend URL is not configured.",
				}, portClosed);
				return;
			}
			const streamBody = JSON.stringify(getRequestBody(message));
			const { [FORCE_GROQ_STORAGE_KEY]: forceGroqRaw } = await chrome.storage.sync.get(FORCE_GROQ_STORAGE_KEY);
			const response = await fetchWithTokenRefresh(
				streamUrl,
				message.jwt,
				"text/event-stream",
				streamBody,
				requestId,
				requestState.controller.signal,
				forceGroqRaw === true,
			);

			if (!response.ok) {
				const errorMessage = response.status === 401
					? "Session expired. Please sign in again."
					: await readErrorMessage(response);
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
			if (IS_DEV) {
				console.debug("Keepalive alarm tick");
			}
		}
	});

	chrome.runtime.onConnect.addListener((port) => {
		if (port.name !== BRIDGE_PORT_NAME) {
			return;
		}

		if (!isTrustedBridgePortSender(port.sender)) {
			console.warn("[SW] rejecting port from unknown sender", { senderId: port.sender?.id });
			port.disconnect();
			return;
		}

		const tabId = port.sender?.tab?.id;
		let portClosed = false;
		const isPortClosed = () => portClosed;

		if (IS_DEV) {
			console.log("Accepted bridge port connection", { tabId });
		}

		// The connect-time orphan signal with a synthetic "recovery-<tabId>" requestId was
		// silently dropped by the content script (no handler matched it). Orphan detection
		// is handled correctly by the message-time path below: the first real message after
		// a SW restart hits orphanedTabIds.has(currentTabId) and returns a matched error.

		port.onMessage.addListener((rawMessage) => {
			const validation = validateBridgeMessage(rawMessage);
			if (!validation.ok) {
				console.warn(`[SW] rejected message: ${validation.reason}`, { tabId });
				return;
			}

			const message = validation.message;

			void (async () => {
				await sessionRecoveryPromise;

				if (portClosed) {
					return;
				}

				const requestId = getRequestId(message);
				const currentTabId = typeof tabId === "number" && Number.isFinite(tabId) ? tabId : null;

				if (IS_DEV) {
					console.log(`[SW] dispatching ${message.verb} requestId=${requestId}`, { tabId: currentTabId });
				}

				if (currentTabId !== null && orphanedTabIds.has(currentTabId)) {
					sendOrphanedTabSignal(port, currentTabId, requestId, isPortClosed);
					return;
				}

				if (message.verb === "CANCEL") {
					if (IS_DEV) {
						console.log("Received bridge verb", { tabId, verb: message.verb, requestId });
					}
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

				if (IS_DEV) {
					console.log("Received bridge verb", { tabId, verb: message.verb, requestId });
				}

				if (message.verb === "SEGMENT") {
					void dispatchSegmentRequest(port, message, requestId, isPortClosed);
					return;
				}

				void dispatchStreamingRequest(port, message as EnhanceBridgeMessage | BindBridgeMessage, requestId, isPortClosed);
			})().catch((error) => {
				console.warn("Bridge message handling failed", { tabId, message, error });
				const requestId = getRequestId(message);
				if (!portClosed && !hasTerminalBeenSent(requestId)) {
					setTerminalState(requestId, true);
					safePostMessage(port, {
						type: "error",
						requestId,
						message: "Bridge request failed unexpectedly.",
					}, isPortClosed);
				}
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
			if (IS_DEV) {
				console.log("Bridge port disconnected", { tabId });
			}
		});
	});
});
