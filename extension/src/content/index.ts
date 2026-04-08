export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	main() {
		console.debug("PromptCompiler content script active");
	},
});

