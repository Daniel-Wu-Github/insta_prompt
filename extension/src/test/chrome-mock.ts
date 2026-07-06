// Shared chrome.* test fixture (Track C3).
//
// The three test suites previously hand-rolled their own `chrome` stubs, and all
// of them predated the content script's `chrome.storage.onChanged.addListener`
// call in main() — so 12 of the 13 "known-stale" vitest failures were the same
// crash during setup, not application regressions. This module is the single
// source of truth for the chrome surface the extension actually touches in
// tests. Each suite still calls vi.stubGlobal itself (per-file isolation; the
// content and background suites need different chrome shapes layered on top).

import { vi } from "vitest";

export type StorageChangeListener = (
	changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
	areaName: string,
) => void;

export type BridgePortMock = {
	postMessage: ReturnType<typeof vi.fn>;
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

export const DEFAULT_TEST_AUTH = {
	access_token: "test-jwt",
	refresh_token: "test-refresh-token",
	expires_at: Date.now() + 3_600_000,
};

export type ContentChromeMock = {
	chromeStub: Record<string, unknown>;
	connectMock: ReturnType<typeof vi.fn>;
	storageLocalGet: ReturnType<typeof vi.fn>;
	storageLocalSet: ReturnType<typeof vi.fn>;
	storageSessionGet: ReturnType<typeof vi.fn>;
	storageSyncGet: ReturnType<typeof vi.fn>;
	storageSyncSet: ReturnType<typeof vi.fn>;
	storageChangeListeners: StorageChangeListener[];
	/** Fire a chrome.storage.onChanged event at every registered listener. */
	fireStorageChange: (
		changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
		areaName: "local" | "session" | "sync",
	) => void;
};

/**
 * Chrome surface used by the CONTENT script: runtime.connect bridge port,
 * runtime.getURL (bundled font), storage get/set, and storage.onChanged.
 */
export function createContentChromeMock(options?: {
	auth?: typeof DEFAULT_TEST_AUTH | undefined;
}): ContentChromeMock {
	const auth = options?.auth ?? DEFAULT_TEST_AUTH;

	const connectMock = vi.fn((): BridgePortMock => {
		return {
			postMessage: vi.fn(),
			onMessage: { addListener: vi.fn() },
			onDisconnect: { addListener: vi.fn() },
		};
	});

	const storageLocalGet = vi.fn(async () => ({ ["promptcompiler.auth"]: auth }));
	const storageLocalSet = vi.fn(async () => undefined);
	const storageSessionGet = vi.fn(async () => ({ ["promptcompiler.auth"]: auth }));
	const storageSyncGet = vi.fn(async () => ({}));
	const storageSyncSet = vi.fn(async () => undefined);

	const storageChangeListeners: StorageChangeListener[] = [];

	const chromeStub = {
		runtime: {
			connect: connectMock,
			id: "test-extension-id",
			getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
		},
		storage: {
			local: { get: storageLocalGet, set: storageLocalSet },
			session: { get: storageSessionGet },
			sync: { get: storageSyncGet, set: storageSyncSet },
			onChanged: {
				addListener: vi.fn((listener: StorageChangeListener) => {
					storageChangeListeners.push(listener);
				}),
				removeListener: vi.fn((listener: StorageChangeListener) => {
					const index = storageChangeListeners.indexOf(listener);
					if (index !== -1) {
						storageChangeListeners.splice(index, 1);
					}
				}),
			},
		},
	} satisfies Record<string, unknown>;

	return {
		chromeStub,
		connectMock,
		storageLocalGet,
		storageLocalSet,
		storageSessionGet,
		storageSyncGet,
		storageSyncSet,
		storageChangeListeners,
		fireStorageChange: (changes, areaName) => {
			for (const listener of [...storageChangeListeners]) {
				listener(changes, areaName);
			}
		},
	};
}

export type ContentScriptCtxMock = {
	onInvalidated: (callback: () => void) => void;
	/** Run every callback registered via ctx.onInvalidated (teardown drills). */
	invalidate: () => void;
};

/**
 * Minimal WXT ContentScriptContext stand-in — main(ctx) registers its global
 * teardown through ctx.onInvalidated, which the old tests never provided.
 */
export function createContentScriptCtx(): ContentScriptCtxMock {
	const callbacks: Array<() => void> = [];
	return {
		onInvalidated: vi.fn((callback: () => void) => {
			callbacks.push(callback);
		}),
		invalidate: () => {
			for (const callback of [...callbacks]) {
				callback();
			}
		},
	};
}

export type BackgroundChromeMock = {
	chromeStub: Record<string, unknown>;
	getOnMessageListener: () =>
		| ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean | void)
		| undefined;
	getOnConnectListener: () => ((port: unknown) => void) | undefined;
};

/**
 * Chrome surface used by the BACKGROUND service worker: onMessage/onConnect
 * registration capture, lifecycle events, alarms, and full storage get/set.
 */
export function createBackgroundChromeMock(): BackgroundChromeMock {
	let onMessageListener:
		| ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean | void)
		| undefined;
	let onConnectListener: ((port: unknown) => void) | undefined;

	const chromeStub = {
		runtime: {
			id: "test-extension-id",
			onMessage: {
				addListener: vi.fn((listener: typeof onMessageListener) => {
					onMessageListener = listener;
				}),
			},
			onConnect: {
				addListener: vi.fn((listener: typeof onConnectListener) => {
					onConnectListener = listener;
				}),
			},
			onStartup: { addListener: vi.fn() },
			onInstalled: { addListener: vi.fn() },
		},
		alarms: {
			get: vi.fn(async () => undefined),
			create: vi.fn(async () => undefined),
			onAlarm: { addListener: vi.fn() },
		},
		storage: {
			local: {
				get: vi.fn(async () => ({})),
				set: vi.fn(async () => undefined),
				remove: vi.fn(async () => undefined),
			},
			session: {
				get: vi.fn(async () => ({})),
				set: vi.fn(async () => undefined),
				remove: vi.fn(async () => undefined),
			},
			onChanged: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
		},
	} satisfies Record<string, unknown>;

	return {
		chromeStub,
		getOnMessageListener: () => onMessageListener,
		getOnConnectListener: () => onConnectListener,
	};
}
