---
name: documentation-cohesion
description: "Use when creating, refining, or maintaining documentation to ensure fixes flow naturally and are readable by both humans and AI agents."
---

# Documentation Cohesion

## When to Use

Use this skill when:

- refining planning or specification documents that guide agent implementation
- integrating corrections, clarifications, or new requirements into existing docs
- ensuring prompt language is explicit enough for AI agents while remaining human-readable
- updating taskboards, decision hierarchies, or workflow docs with new requirements
- reviewing docs to prevent bolted-on sections and maintain natural narrative flow

## When Not to Use

Do not use this skill for:

- simple typo fixes or formatting cleanup with no semantic impact
- feature implementation or runtime code changes
- general writing or communication tasks unrelated to workflow or planning docs
- tasks that do not require both human and AI interpretability

## Core Principles

### 1. Natural Integration Over Bolted Additions

**Rule:** Fixes and new requirements must integrate into existing document structure, not be added at the top or bottom as separate sections.

**Why:** Bolted-on sections break the narrative flow, confuse both humans and AI agents about where requirements actually belong, and make the document harder to navigate during implementation.

**How:** 
- Identify the logical section where each fix or requirement belongs
- Weave new content into existing decision hierarchies, checklists, or prompts
- Keep related concerns collocated (e.g., if a migration detail is missing, fix it in the migration decision, not in a new "Missing Fixes" section)

### 2. Hierarchy-Aware Placement

**Rule:** Requirements must sit at the correct level in the document hierarchy where they logically belong.

**Why:** AI agents follow hierarchical structure to understand scope and dependencies. Misplaced requirements can cause agents to:
- Miss dependencies that should be obvious from the structure
- Add features or logic that belong in a later step
- Assume optional behavior is mandatory or vice versa

**How:**
- Decision docs: place schema or implementation requirements in the specific Decision section they affect
- Taskboards: place checklist items and "Done when" criteria in the right Task section
- Prompts: embed mandatory requirements directly in step instructions, not as side notes
- Use bold `**Mandatory:**` markers in checklists to make enforcement clear

### 3. Dual Readability: Human-First, Agent-Compatible

**Rule:** Write for both human understanding and agent instruction following without creating two separate documents.

**Why:** 
- Humans need narrative flow and context to remember why decisions were made
- Agents need explicit, non-ambiguous instruction language
- Splitting into two versions creates sync problems and confusion

**How:**
- Use plain language for rationale and context (humans)
- Use explicit, dictatorial language for implementation constraints (agents)
- Example: "The route accepts X and **must** call Y() before doing Z" (not "should" or "try to")
- Use code blocks and bullet lists for implementation details; use prose for context

### 4. Immutable Source-of-Truth Positioning

**Rule:** Fixes must reference and reinforce existing source-of-truth documents, not replace or override them.

**Why:** If multiple documents contradict each other, agents get confused about which to follow, and humans have to debug inconsistencies.

**How:**
- After integrating a fix, verify it aligns with the source-of-truth docs listed in the document (e.g., `docs/DATA_MODELS.md`, `docs/ARCHITECTURE.md`)
- If the fix conflicts with a source-of-truth doc, either update the source-of-truth doc first or explain the conflict explicitly
- Use cross-references to keep updates synchronized (e.g., "See Decision D1 in planning doc for vector extension detail")

### 5. Progression and Dependency Clarity

**Rule:** Prerequisites, blockers, and dependencies must be explicit in the document structure, not buried in prose.

**Why:** Agents need to know what must be done before what; humans need to plan implementation sequences.

**How:**
- Use "Dependencies:" sections in taskboard items
- Use "Planning rule:" sections in decision docs to state constraints before implementation starts
- In prompts, list "Mandatory requirements:" at the top, then rationale
- If step N depends on step N-1, make that explicit in the "Done when" criteria

## Verification Checklist

Before considering a documentation edit complete:

- [ ] Is the fix integrated into the existing doc structure, not bolted on?
- [ ] Does it sit at the correct hierarchy level (Decision, Task, Checklist, Prompt)?
- [ ] Would a human reader understand why and where this requirement matters?
- [ ] Would an AI agent reading this doc follow the requirement correctly?
- [ ] Is mandatory behavior marked with `**Mandatory:**` or explicit "must" language?
- [ ] Does the fix reference or reinforce source-of-truth docs instead of conflicting with them?
- [ ] Are prerequisites and dependencies clear from the document structure?
- [ ] Could the fix have been "bolted on" at the top or bottom instead? If yes, move it higher in this hierarchy.

## Anatomy of a Well-Integrated Fix

### Example: Adding a Missing Vector Extension Requirement

**Bad (bolted on):** Create a new "Additional Requirements" section at the top of the document.

**Good (integrated):** 
1. Find the migration decision (D1).
2. Update the "Planned files" bullet to show the first migration "enables the vector extension."
3. Update the "Planning rule" to add "The `context_chunks` migration must enable `vector` before creating the table."
4. Go to the Step 1.3 taskboard section. Update the checklist with `**Mandatory:** Include CREATE EXTENSION IF NOT EXISTS vector;`
5. Update the Step 1.3 "Done when" criteria to include "Vector extension is explicitly enabled in the first migration."
6. In the Step 1.3 prompt, add "Enables the vector extension with CREATE EXTENSION IF NOT EXISTS vector;" to the mandatory requirements list.

**Result:** The requirement flows from decision context → planning rule → checklist → prompt → done criteria, all woven into the existing narrative. Humans see it as part of the natural progression; agents follow the explicit flags.

## Operating Rules

- Load this skill before refining planning or specification documents.
- Load [repo-workflow](../repo-workflow/SKILL.md) alongside this skill when updating instruction files.
- If you're composing a prompt inside a doc, ensure the prompt language is dictatorial, not suggestive.
- When adding "Mandatory:" requirements, also add a corresponding "Done when" criterion to verify it was completed.
- Keep cross-document references as markdown links.
- After integration, read the section aloud to check narrative flow.
- If a fix requires updating multiple document levels, do all levels in the same edit pass to keep them in sync.

## Common Anti-Patterns

1. **The "Review Feedback Resolved" Section:** Adding a top-level section listing all fixes. Instead, integrate each fix into the hierarchical section where it belongs.

2. **The Wishy-Washy Prompt:** "Consider adding a trigger" or "You might want to enable the vector extension." Instead: "**Mandatory:** Include CREATE EXTENSION IF NOT EXISTS vector;" or "Create an AFTER INSERT trigger on auth.users."

3. **The Separated Verification:** Listing "Verification" as a separate step for a single requirement. Instead, embed verification into the "Done when" criteria at the task level.

4. **The Orphaned Decision:** Making architectural decisions in planning docs but not connecting them to specific tasks or prompts. Instead, reference the decision explicitly in the task ("See Decision D1 for why this matters").

5. **Conflicting Multiple Sources:** Having the requirement in the decision doc but different wording in the prompt. Instead, reference the decision from the prompt or extract the requirement once into the decision and reference it everywhere.

## Testing Documentation Cohesion

After refining a document:

1. **Print it out mentally:** Would a human want to read this top-to-bottom, or do they have to jump around?
2. **Trace an agent execution:** Pick a task prompt and follow it. Can the agent find all prerequisites? Are constraints explicit?
3. **Search for orphans:** Look for any "Mandatory:" markers or italicized requirements that are not reflected in corresponding "Done when" criteria.
4. **Check hierarchy:** Is every requirement at the level of the hierarchy it's intended to control? (Decision = architecture, Task = scope, Checklist = verification, Prompt = instruction)
5. **Verify source-of-truth alignment:** Pick 3 source-of-truth docs the planning doc references. Spot-check that major requirements align with them.

## Coordination with Other Skills

- **repo-workflow**: Use together when updating instruction surfaces or prompts.
- **skill-map-governance**: Use together if documentation updates require skill changes.
- **verification-gate**: Use together when documentation changes affect execution or safety.
- **workflow-logging**: Use together when documentation changes are material enough to log.

