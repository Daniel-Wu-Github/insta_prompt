/**
 * @promptcompiler/core — the platform-agnostic compiler core (plan §6.1).
 *
 * Zero DOM/Node/chrome imports (R-ARCH-1). Every surface (extension, web, IDE,
 * terminal) consumes this identically and injects its own InputSource /
 * RenderTarget / TransportClient (R-ARCH-2).
 *
 * Track C status: boundary spike + first proven slice (canonical ordering) +
 * the C2 contracts. The section state machine, settings, and orchestration are
 * sequenced in docs/agent_plans/v2/c1_core_boundary_spike.md and land behind the
 * C3 test harness + human review (DEC-2).
 */
export * from "./clause-order";
export * from "./adapter";
export * from "./transport";
