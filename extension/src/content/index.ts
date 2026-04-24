export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main() {
		const BRIDGE_PORT_NAME = "insta_prompt_bridge";
		const BRIDGE_VERBS = ["SEGMENT", "ENHANCE", "BIND", "CANCEL"] as const;

		const bridgePort = chrome.runtime.connect({ name: BRIDGE_PORT_NAME });

		setTimeout(() => {
			for (const verb of BRIDGE_VERBS) {
				bridgePort.postMessage({ verb });
			}
		}, 0);
	},
});

