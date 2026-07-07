import { createHash } from "node:crypto";
import { z } from "zod";

import type { GoalType, Section, SegmentResponse } from "../../shared/contracts";
import { canonicalSlotForGoalType, type ModelConfig } from "./llm";
import {
	anthropicStreamingAdapter,
	groqStreamingAdapter,
	type ProviderName,
	type ProviderStreamErrorEvent,
	type ProviderStreamRequest,
	type ProviderStreamingAdapter,
} from "./providers";

const DEFAULT_SEGMENT_CLASSIFIER_TEMPERATURE = 0;
const GOAL_TYPE_FALLBACK: GoalType = "action";
const STABLE_SECTION_ID_HEX_LENGTH = 24;
const SEGMENT_FAILURE_FALLBACK_GOAL_TYPE: GoalType = "context";
const SEGMENT_FAILURE_FALLBACK_CANONICAL_ORDER = 1;

const dependencyIndexSchema = z.union([z.number().int(), z.string().regex(/^-?\d+$/)]);

const segmentIntermediateSectionSchema = z
	.object({
		text: z.string().min(1),
		goal_type: z.string().min(1),
		depends_on: z.array(dependencyIndexSchema).optional(),
		canonical_order: z.number().optional(),
		id: z.string().optional(),
	})
	.passthrough();

const segmentIntermediateSchema = z
	.object({
		sections: z.array(segmentIntermediateSectionSchema),
	})
	.passthrough();

export type SegmentClassificationIntermediateSection = z.infer<typeof segmentIntermediateSectionSchema>;
export type SegmentClassificationIntermediate = z.infer<typeof segmentIntermediateSchema>;
type SegmentDependencyIndex = z.infer<typeof dependencyIndexSchema>;

type SegmentPrompt = {
	systemPrompt: string;
	userPrompt: string;
};

type StreamAggregationResult = {
	aggregatedText: string;
	sawDoneEvent: boolean;
};

const DEFAULT_PROVIDER_STREAMING_ADAPTERS: Readonly<Record<ProviderName, ProviderStreamingAdapter>> = {
	groq: groqStreamingAdapter,
	anthropic: anthropicStreamingAdapter,
};

let providerAdapterOverridesForTests: Partial<Record<ProviderName, ProviderStreamingAdapter>> = {};

export function __setSegmentProviderAdapterOverrideForTests(
	provider: ProviderName,
	adapter: ProviderStreamingAdapter,
): void {
	providerAdapterOverridesForTests[provider] = adapter;
}

export function __resetSegmentProviderAdapterOverridesForTests(): void {
	providerAdapterOverridesForTests = {};
}

function pickStreamingAdapter(provider: string): ProviderStreamingAdapter {
	if (provider === "groq" || provider === "anthropic") {
		const overridden = providerAdapterOverridesForTests[provider];
		if (overridden) {
			return overridden;
		}

		return DEFAULT_PROVIDER_STREAMING_ADAPTERS[provider];
	}

	throw new Error(`Unsupported streaming provider for /segment classification: ${provider}`);
}

function formatSegmentsForPrompt(segments: string[]): string {
	return segments
		.map((segment, index) => `${index + 1}. ${JSON.stringify(segment)}`)
		.join("\n");
}

export function createSegmentClassificationPrompt(segments: string[]): SegmentPrompt {
	return {
		systemPrompt: [
			"You are a strict, deterministic JSON classifier for PromptCompiler /segment.",
			"Output JSON only with no markdown, no prose, and no code fences.",
			"You classify each input segment into exactly one of these six canonical goal types.",
			"Always choose the single best-fitting label; do not invent new labels.",
			"",
			"Goal type definitions:",
			'- "context": background, scenario, purpose, or what the user is building/doing. "I am building a personal finance tracker for a side project."',
			'- "tech_stack": languages, frameworks, libraries, tools, or platform. "I am using Python with pandas and sqlite3."',
			'- "constraint": requirements, limits, rules, or non-functional conditions the result must satisfy. "It must run locally with no cloud dependencies and finish in under 5 seconds."',
			'- "action": the core task or imperative request — what to actually produce or do. "Write a function that categorizes monthly expenses by type."',
			'- "output_format": the shape, structure, or medium of the deliverable. "Return the results as a markdown table with columns for category and trend."',
			'- "edge_case": exceptions, error handling, or boundary conditions to account for. "Handle the case where some months have no transactions for a category."',
			"",
			"Disambiguation rules (apply in order):",
			'- A segment asking for a plan, list, table, JSON, steps, or any specific FORM of the answer is "output_format", even when phrased as an imperative. "Give me a step by step plan I can follow." -> output_format.',
			'- A segment about what happens when something is missing, empty, failing, or unavailable is "edge_case", not "constraint". "Don\'t break if storage is empty or the API is down." -> edge_case.',
			'- "constraint" is reserved for limits the solution itself must satisfy (performance, dependencies, compatibility, rules).',
		].join("\n"),
		userPrompt: [
			"Classify each segment into one section record in the same order as input.",
			"Return a single JSON object with this exact top-level shape:",
			'{"sections":[{"text":"<segment text>","goal_type":"<one canonical label>","depends_on":[0]}]}',
			"Rules:",
			"- Keep one output section per input segment, in input order.",
			"- text must preserve input segment meaning.",
			"- goal_type must be exactly one of: context, tech_stack, constraint, action, output_format, edge_case.",
			"- Pick the same label every time for the same segment; be deterministic.",
			"- depends_on must be an array of integer section indices (0-based).",
			"",
			"Example input:",
			'1. "I am building a CLI tool in Rust."',
			'2. "Parse the config file and print all keys."',
			'3. "Output the keys as a JSON array."',
			"Example output:",
			'{"sections":[{"text":"I am building a CLI tool in Rust.","goal_type":"tech_stack","depends_on":[]},{"text":"Parse the config file and print all keys.","goal_type":"action","depends_on":[0]},{"text":"Output the keys as a JSON array.","goal_type":"output_format","depends_on":[1]}]}',
			"",
			"Input segments:",
			formatSegmentsForPrompt(segments),
		].join("\n"),
	};
}

export function normalizeIncomingSegments(segments: string[]): string[] {
	return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

function stripCodeFenceIfPresent(raw: string): string {
	const trimmed = raw.trim();
	const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	if (fencedMatch && fencedMatch[1]) {
		return fencedMatch[1].trim();
	}

	return trimmed;
}

function toProviderErrorMessage(event: ProviderStreamErrorEvent): string {
	const statusSuffix = typeof event.status === "number" ? ` status=${event.status}` : "";
	return `${event.provider}:${event.code}${statusSuffix} ${event.message}`;
}

async function aggregateStreamingTokensToString(
	adapter: ProviderStreamingAdapter,
	request: ProviderStreamRequest,
): Promise<StreamAggregationResult> {
	let aggregatedText = "";
	let sawDoneEvent = false;

	for await (const event of adapter.stream(request)) {
		if (event.type === "token") {
			aggregatedText += event.content;
			continue;
		}

		if (event.type === "error") {
			throw new Error(toProviderErrorMessage(event));
		}

		sawDoneEvent = true;
	}

	return {
		aggregatedText,
		sawDoneEvent,
	};
}

function parseSegmentIntermediateFromJson(jsonText: string): SegmentClassificationIntermediate {
	const cleaned = stripCodeFenceIfPresent(jsonText);
	let parsed: unknown;

	try {
		parsed = JSON.parse(cleaned);
	} catch {
		throw new Error("Segment classifier stream did not return valid JSON.");
	}

	const validated = segmentIntermediateSchema.safeParse(parsed);
	if (!validated.success) {
		throw new Error("Segment classifier JSON did not match intermediate shape.");
	}

	return validated.data;
}

const GOAL_TYPE_NORMALIZATION_MAP: Record<string, GoalType> = {
	context: "context",
	background: "context",
	problem_context: "context",
	use_case: "context",
	domain: "context",

	tech_stack: "tech_stack",
	stack: "tech_stack",
	technology: "tech_stack",
	framework: "tech_stack",
	frameworks: "tech_stack",
	language: "tech_stack",
	languages: "tech_stack",

	constraint: "constraint",
	constraints: "constraint",
	requirement: "constraint",
	requirements: "constraint",
	restriction: "constraint",
	restrictions: "constraint",

	action: "action",
	task: "action",
	tasks: "action",
	objective: "action",
	objectives: "action",
	implementation: "action",

	output_format: "output_format",
	format: "output_format",
	response_format: "output_format",
	deliverable: "output_format",

	edge_case: "edge_case",
	edge_cases: "edge_case",
	edgecase: "edge_case",
	corner_case: "edge_case",
	corner_cases: "edge_case",
	exception: "edge_case",
	exceptions: "edge_case",
};

function normalizeGoalType(rawGoalType: string): GoalType {
	const normalized = rawGoalType.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

	if (GOAL_TYPE_NORMALIZATION_MAP[normalized]) {
		return GOAL_TYPE_NORMALIZATION_MAP[normalized];
	}

	if (normalized.includes("tech") || normalized.includes("stack") || normalized.includes("framework")) {
		return "tech_stack";
	}

	if (normalized.includes("output") || normalized.includes("format") || normalized.includes("schema")) {
		return "output_format";
	}

	if (normalized.includes("edge") || normalized.includes("corner") || normalized.includes("exception")) {
		return "edge_case";
	}

	if (normalized.includes("constraint") || normalized.includes("requirement") || normalized.includes("limit")) {
		return "constraint";
	}

	if (normalized.includes("context") || normalized.includes("background")) {
		return "context";
	}

	return GOAL_TYPE_FALLBACK;
}

function deriveStableSectionId(text: string, occurrenceCount: number): string {
	const digest = createHash("sha256")
		.update(`${text}\u0000${occurrenceCount}`, "utf8")
		.digest("hex")
		.slice(0, STABLE_SECTION_ID_HEX_LENGTH);

	return `s_${digest}`;
}

function translateDependencyIndices(
	rawDependencies: readonly SegmentDependencyIndex[] | undefined,
	sectionIdsByIndex: readonly string[],
): string[] {
	if (!rawDependencies || rawDependencies.length === 0) {
		return [];
	}

	const translated: string[] = [];
	for (const rawDependency of rawDependencies) {
		let dependencyIndex: number | null = null;

		if (typeof rawDependency === "number" && Number.isInteger(rawDependency)) {
			dependencyIndex = rawDependency;
		} else if (typeof rawDependency === "string") {
			const trimmed = rawDependency.trim();
			if (/^-?\d+$/.test(trimmed)) {
				dependencyIndex = Number(trimmed);
			}
		}

		if (dependencyIndex === null) {
			continue;
		}

		if (dependencyIndex < 0 || dependencyIndex >= sectionIdsByIndex.length) {
			continue;
		}

		translated.push(sectionIdsByIndex[dependencyIndex] as string);
	}

	return translated;
}

function hasPath(fromId: string, targetId: string, adjacency: ReadonlyMap<string, ReadonlySet<string>>): boolean {
	const stack: string[] = [fromId];
	const visited = new Set<string>();

	while (stack.length > 0) {
		const current = stack.pop() as string;
		if (current === targetId) {
			return true;
		}

		if (visited.has(current)) {
			continue;
		}

		visited.add(current);
		const neighbors = adjacency.get(current);
		if (!neighbors) {
			continue;
		}

		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				stack.push(neighbor);
			}
		}
	}

	return false;
}

function sanitizeDependencies(
	sectionIds: readonly string[],
	translatedDependenciesBySection: readonly string[][],
): string[][] {
	const allIds = new Set(sectionIds);
	const adjacency = new Map<string, Set<string>>();
	for (const sectionId of sectionIds) {
		adjacency.set(sectionId, new Set<string>());
	}

	const sanitized: string[][] = sectionIds.map(() => []);

	for (let sectionIndex = 0; sectionIndex < sectionIds.length; sectionIndex += 1) {
		const sectionId = sectionIds[sectionIndex] as string;
		const candidates = translatedDependenciesBySection[sectionIndex] ?? [];
		const acceptedForSection = new Set<string>();

		for (const dependencyId of candidates) {
			if (!allIds.has(dependencyId)) {
				continue;
			}

			if (dependencyId === sectionId) {
				continue;
			}

			if (acceptedForSection.has(dependencyId)) {
				continue;
			}

			if (hasPath(dependencyId, sectionId, adjacency)) {
				continue;
			}

			acceptedForSection.add(dependencyId);
			(adjacency.get(sectionId) as Set<string>).add(dependencyId);
			(sanitized[sectionIndex] as string[]).push(dependencyId);
		}
	}

	return sanitized;
}

export function normalizeSegmentClassificationIntermediate(
	intermediate: SegmentClassificationIntermediate,
): SegmentResponse {
	const occurrenceByText = new Map<string, number>();

	const preparedSections = intermediate.sections.map((section) => {
		const normalizedText = section.text.trim();
		const occurrenceCount = occurrenceByText.get(normalizedText) ?? 0;
		occurrenceByText.set(normalizedText, occurrenceCount + 1);

		const normalizedGoalType = normalizeGoalType(section.goal_type);

		return {
			id: deriveStableSectionId(normalizedText, occurrenceCount),
			text: normalizedText,
			goal_type: normalizedGoalType,
			canonical_order: canonicalSlotForGoalType(normalizedGoalType),
			raw_dependencies: section.depends_on,
		};
	});

	const sectionIdsByIndex = preparedSections.map((section) => section.id);

	const translatedDependenciesBySection = preparedSections.map((section) => {
		return translateDependencyIndices(section.raw_dependencies, sectionIdsByIndex);
	});

	const sanitizedDependenciesBySection = sanitizeDependencies(sectionIdsByIndex, translatedDependenciesBySection);

	const normalizedSections: Section[] = preparedSections.map((section, index) => {
		return {
			id: section.id,
			text: section.text,
			goal_type: section.goal_type,
			canonical_order: section.canonical_order,
			depends_on: sanitizedDependenciesBySection[index] ?? [],
		};
	});

	return {
		sections: normalizedSections,
	};
}

function createDeterministicSegmentFallbackIntermediate(
	segments: readonly string[],
): SegmentClassificationIntermediate {
	return {
		sections: segments.map((segment) => {
			return {
				text: segment,
				goal_type: SEGMENT_FAILURE_FALLBACK_GOAL_TYPE,
				canonical_order: SEGMENT_FAILURE_FALLBACK_CANONICAL_ORDER,
				depends_on: [],
			};
		}),
	};
}

export async function classifySegmentsFromStreamingAdapter(params: {
	segments: string[];
	model: ModelConfig;
	signal?: AbortSignal;
}): Promise<SegmentClassificationIntermediate> {
	const { model, segments, signal } = params;
	const fallbackIntermediate = createDeterministicSegmentFallbackIntermediate(segments);

	let aggregated: StreamAggregationResult;
	try {
		const adapter = pickStreamingAdapter(model.provider);
		const prompt = createSegmentClassificationPrompt(segments);

		aggregated = await aggregateStreamingTokensToString(adapter, {
			model: model.model,
			userPrompt: prompt.userPrompt,
			systemPrompt: prompt.systemPrompt,
			maxTokens: model.maxTokens,
			temperature: DEFAULT_SEGMENT_CLASSIFIER_TEMPERATURE,
			signal,
		});
	} catch {
		return fallbackIntermediate;
	}

	if (!aggregated.sawDoneEvent) {
		return fallbackIntermediate;
	}

	try {
		return parseSegmentIntermediateFromJson(aggregated.aggregatedText);
	} catch {
		return fallbackIntermediate;
	}
}