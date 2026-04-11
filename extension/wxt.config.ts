import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	entrypointsDir: ".",
	manifest: {
		name: "PromptCompiler",
		description: "Step 0 bootstrap extension surface for PromptCompiler.",
		permissions: ["storage", "alarms"],
		host_permissions: ["<all_urls>"],
	},
	modules: ["@wxt-dev/module-react"],
});

