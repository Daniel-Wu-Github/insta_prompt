import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	entrypointsDir: ".",
	manifest: {
		name: "PromptCompiler",
		// One-line store description — keep under 132 chars for Chrome Web Store.
		description: "AI prompt compiler: classify, expand, and assemble rough ideas into polished prompts — directly in any text field.",
		// host_permissions: <all_urls> is required because the content script
		// injects into every page the user browses.  The extension is a
		// universal textarea assistant (ChatGPT, Claude.ai, Notion, Linear,
		// GitHub, etc.) with no fixed target-site list; narrowing to a named
		// allowlist would silently break functionality on any unlisted site.
		// All network requests from the background service worker are scoped to
		// VITE_API_BASE_URL (the PromptCompiler backend) — no user-page data
		// leaves the content script to third-party origins.
		permissions: ["storage", "alarms"],
		host_permissions: ["<all_urls>"],
	},
	modules: ["@wxt-dev/module-react"],
});

