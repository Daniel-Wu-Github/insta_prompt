import { describe, expect, it } from "bun:test";

import type { Mode, Tier } from "../../../shared/contracts";

import { MODE_TOKEN_BUDGETS, selectModel, type CallType } from "../services/llm";

const MODES: Mode[] = ["efficiency", "balanced", "detailed"];
const TIERS: Tier[] = ["free", "pro", "byok"];
const GENERATION_CALL_TYPES: Exclude<CallType, "segment">[] = ["enhance", "bind"];

describe("selectModel", () => {
	it("pins /segment to the fast low-cost classifier path for every tier and mode", () => {
		for (const tier of TIERS) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType: "segment",
					tier,
					mode,
					byokConfig: {
						preferredProvider: "openai",
						preferredModel: "gpt-5-mini",
					},
				});

				expect(selected.provider).toBe("groq");
				expect(selected.model).toBe("llama-3.1-8b-instant");
				expect(selected.maxTokens).toBe(500);
			}
		}
	});

	it("keeps free-tier generation on Groq-only routes with exact mode budgets", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "free",
					mode,
				});

				expect(selected.provider).toBe("groq");
				expect(selected.model).toBe("llama-3.3-70b-versatile");
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("routes pro-tier generation by mode to Anthropic with exact mode budgets", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "pro",
					mode,
				});

				expect(selected.provider).toBe("anthropic");
				expect(selected.model).toBe(
					mode === "efficiency" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
				);
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("uses BYOK preferred provider/model for generation routes", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "byok",
					mode,
					byokConfig: {
						preferredProvider: "openai",
						preferredModel: "gpt-5-mini",
					},
				});

				expect(selected.provider).toBe("openai");
				expect(selected.model).toBe("gpt-5-mini");
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("returns deterministic BYOK safe fallback when preferred model is missing", () => {
		const selected = selectModel({
			callType: "enhance",
			tier: "byok",
			mode: "balanced",
			byokConfig: {
				preferredProvider: "",
				preferredModel: "",
			},
		});

		expect(selected.provider).toBe("user");
		expect(selected.model).toBe("byok-config-missing");
		expect(selected.maxTokens).toBe(500);
	});

	it("returns deterministic safe fallback on unknown unsupported route combinations", () => {
		const selected = selectModel({
			callType: "unknown" as CallType,
			tier: "enterprise" as Tier,
			mode: "turbo" as Mode,
			byokConfig: null,
		});

		expect(selected.provider).toBe("groq");
		expect(selected.model).toBe("llama-3.3-70b-versatile");
		expect(selected.maxTokens).toBe(500);
	});
});