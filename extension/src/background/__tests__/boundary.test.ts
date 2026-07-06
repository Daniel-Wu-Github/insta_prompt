// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PortMock = {
	name: string;
	sender?: chrome.runtime.MessageSender;
	disconnect: ReturnType<typeof vi.fn>;
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

let onMessageListener: ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean | void) | undefined;
let onConnectListener: ((port: PortMock) => void) | undefined;

function installChromeMocks(fetchImpl: ReturnType<typeof vi.fn> = vi.fn()): void {
	onMessageListener = undefined;
	onConnectListener = undefined;

	const chromeStub = {
		runtime: {
			id: "test-extension-id",
			onMessage: { addListener: vi.fn((listener) => { onMessageListener = listener; }) },
			onConnect: { addListener: vi.fn((listener) => { onConnectListener = listener; }) },
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
		},
	} satisfies Record<string, unknown>;

	vi.stubGlobal("chrome", chromeStub);
	vi.stubGlobal("defineBackground", (callback: () => void) => callback());
	vi.stubGlobal("fetch", fetchImpl);
	vi.stubGlobal("crypto", {
		randomUUID: () => "request-id",
	});
}

async function loadBackground(fetchImpl?: ReturnType<typeof vi.fn>): Promise<void> {
	vi.resetModules();
	installChromeMocks(fetchImpl);
	await import("../index.ts");
}

beforeEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("background boundary validation", () => {
	it("rejects runtime messages from non-popup extension pages", async () => {
		await loadBackground();
		expect(onMessageListener).toBeDefined();

		const sendResponse = vi.fn();
		const accepted = onMessageListener?.(
			{ type: "REFRESH_TOKEN" },
			{ id: "test-extension-id", url: "chrome-extension://test-extension-id/content.html", tab: undefined } as chrome.runtime.MessageSender,
			sendResponse,
		);

		expect(accepted).toBe(false);
		expect(sendResponse).not.toHaveBeenCalled();
	});

	it("accepts popup refresh requests and returns refreshed tokens", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				token: "new-access-token",
				token_type: "bearer",
				expires_in: 3600,
				refresh_token: "new-refresh-token",
				user_id: "user-123",
				tier: "free",
			}),
		}));

		vi.resetModules();
		installChromeMocks(fetchMock);

		const chromeStub = chrome as typeof chrome & {
			storage: {
				local: { get: ReturnType<typeof vi.fn> };
				session: { get: ReturnType<typeof vi.fn> };
			};
		};
		chromeStub.storage.local.get.mockResolvedValueOnce({
			"promptcompiler.auth": {
				access_token: "old-access-token",
				refresh_token: "refresh-token",
				expires_at: Date.now() + 1000,
			},
		});
		chromeStub.storage.session.get.mockResolvedValueOnce({});
		chromeStub.storage.session.get.mockResolvedValueOnce({});
		chromeStub.storage.session.get.mockResolvedValueOnce({});

		await import("../index.ts");
		expect(onMessageListener).toBeDefined();

		const sendResponse = vi.fn();
		const accepted = onMessageListener?.(
			{ type: "REFRESH_TOKEN" },
			{ id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html", tab: undefined } as chrome.runtime.MessageSender,
			sendResponse,
		);

		expect(accepted).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		// The mocked refresh endpoint succeeds with token "new-access-token", and the
		// handler responds { accessToken } on success ({ accessToken: null } is the
		// CATCH path only). The previous assertion had these two cases inverted.
		expect(sendResponse).toHaveBeenCalledWith({ accessToken: "new-access-token" });
	});

	it("rejects bridge ports that are not attached to a tab", async () => {
		await loadBackground();
		expect(onConnectListener).toBeDefined();

		const port: PortMock = {
			name: "insta_prompt_bridge",
			sender: { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" } as chrome.runtime.MessageSender,
			disconnect: vi.fn(),
			onMessage: { addListener: vi.fn() },
			onDisconnect: { addListener: vi.fn() },
		};

		onConnectListener?.(port);
		expect(port.disconnect).toHaveBeenCalled();
	});
});
