export default defineBackground(() => {
	const KEEPALIVE_ALARM_NAME = "keepalive";
	const KEEPALIVE_PERIOD_MINUTES = 1;
	const BRIDGE_PORT_NAME = "insta_prompt_bridge";
	const BRIDGE_VERBS = ["SEGMENT", "ENHANCE", "BIND", "CANCEL"] as const;

	type BridgeVerb = (typeof BRIDGE_VERBS)[number];

	function isBridgeVerb(value: unknown): value is BridgeVerb {
		return typeof value === "string" && BRIDGE_VERBS.includes(value as BridgeVerb);
	}

	function isBridgeMessage(message: unknown): message is { verb: BridgeVerb } {
		return typeof message === "object" && message !== null && "verb" in message && isBridgeVerb((message as { verb?: unknown }).verb);
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

		console.log("Accepted bridge port connection", { tabId });

		port.onMessage.addListener((message) => {
			if (!isBridgeMessage(message)) {
				console.warn("Ignoring malformed bridge message", { tabId, message });
				return;
			}

			switch (message.verb) {
				case "SEGMENT":
				case "ENHANCE":
				case "BIND":
				case "CANCEL":
					console.log("Received bridge verb", { tabId, verb: message.verb });
					break;
				default:
					console.warn("Ignoring unsupported bridge verb", { tabId, message });
			}
		});

		port.onDisconnect.addListener(() => {
			console.log("Bridge port disconnected", { tabId });
		});
	});
});

