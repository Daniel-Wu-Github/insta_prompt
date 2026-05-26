import type { MiddlewareHandler } from "hono";
import { TIER_VALUES, type Tier } from "../../../shared/contracts";

type TierRoutePolicy = {
	routePrefix: string;
	allowedTiers: readonly Tier[];
};

const RECOGNIZED_TIERS = new Set<string>(TIER_VALUES);

// Explicit allowlist derived from docs/LLM_ROUTING.md routing table.
// Every protected route must appear here; any tier absent from allowedTiers
// receives a 403 TIER_FORBIDDEN before the route handler is reached.
//
// /segment  — all tiers: fast Groq classifier, no model differentiation by tier.
// /enhance  — all tiers: free → Groq llama-3.3-70b, pro/byok → Anthropic models.
//             Tier is passed to selectModel() in the route handler; the middleware
//             only enforces that the tier is recognized and route-eligible.
// /bind     — same allowlist and rationale as /enhance.
// /projects — v2 surface, no tier restriction yet; open to all recognized tiers.
//
// The combination of this middleware (route eligibility) + selectModel()
// (tier → provider/model mapping) is what prevents a free-tier user from
// reaching Anthropic models: they can call /enhance and /bind, but
// selectModel({ tier: "free", ... }) always returns a Groq model, never Anthropic.
const DEFAULT_STRICT_TIER_ROUTE_POLICIES: readonly TierRoutePolicy[] = [
	{
		routePrefix: "/segment",
		allowedTiers: ["free", "pro", "byok"],
	},
	{
		routePrefix: "/enhance",
		allowedTiers: ["free", "pro", "byok"],
	},
	{
		routePrefix: "/bind",
		allowedTiers: ["free", "pro", "byok"],
	},
	{
		routePrefix: "/projects",
		allowedTiers: ["free", "pro", "byok"],
	},
];
let strictTierRoutePolicies: readonly TierRoutePolicy[] = DEFAULT_STRICT_TIER_ROUTE_POLICIES;

export function __setStrictTierRoutePoliciesForTests(policies: readonly TierRoutePolicy[]): void {
	strictTierRoutePolicies = policies;
}

export function __resetStrictTierRoutePoliciesForTests(): void {
	strictTierRoutePolicies = DEFAULT_STRICT_TIER_ROUTE_POLICIES;
}

function unauthorizedResponse() {
	return {
		error: {
			code: "UNAUTHORIZED",
			message: "Missing or invalid Authorization header",
		},
	};
}

function forbiddenResponse() {
	return {
		error: {
			code: "TIER_FORBIDDEN",
			message: "Tier is not allowed for this route",
		},
	};
}

function isRecognizedTier(value: unknown): value is Tier {
	return typeof value === "string" && RECOGNIZED_TIERS.has(value);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function resolveRoutePolicy(path: string): TierRoutePolicy | null {
	for (const policy of strictTierRoutePolicies) {
		if (pathMatchesPrefix(path, policy.routePrefix)) {
			return policy;
		}
	}

	return null;
}

export const tierMiddleware: MiddlewareHandler = async (c, next) => {
	const tierFromContext = c.get("tier");
	if (tierFromContext === undefined || tierFromContext === null) {
		return c.json(unauthorizedResponse(), 401);
	}

	if (!isRecognizedTier(tierFromContext)) {
		return c.json(forbiddenResponse(), 403);
	}

	const policy = resolveRoutePolicy(c.req.path);
	if (policy && !policy.allowedTiers.includes(tierFromContext)) {
		return c.json(forbiddenResponse(), 403);
	}

	await next();
};

