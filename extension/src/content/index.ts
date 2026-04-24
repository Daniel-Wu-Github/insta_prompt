export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main() {
		const BRIDGE_PORT_NAME = "insta_prompt_bridge";

		const bridgePort = chrome.runtime.connect({ name: BRIDGE_PORT_NAME });

		bridgePort.onMessage.addListener((message) => {
			console.debug("PromptCompiler bridge message", message);
		});

		bridgePort.onDisconnect.addListener(() => {
			console.debug("PromptCompiler bridge disconnected");
		});
	},
});

