#!/usr/bin/env bash
# implicit-skill-smoke-test.sh
# Validates that skill descriptions + When-to-Use sections would auto-load
# the correct skills for realistic task prompts — without explicit skill names.
#
# Usage:
#   ./scripts/implicit-skill-smoke-test.sh            # run full golden test suite
#   ./scripts/implicit-skill-smoke-test.sh "my prompt"  # test a single custom prompt
#   ./scripts/implicit-skill-smoke-test.sh --report    # only show failures + effectiveness

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$ROOT_DIR/.github/skills"
REPORT_ONLY=false
[[ "${1:-}" == "--report" ]] && REPORT_ONLY=true && shift

if [[ ! -d "$SKILLS_DIR" ]]; then
  echo "ERROR: skills directory not found at $SKILLS_DIR" >&2; exit 1
fi

# ─── Scoring ────────────────────────────────────────────────────────────────
# For each skill, build a trigger vocabulary from:
#   - frontmatter description (weight 3)
#   - "## When to Use" section body (weight 2)
#   - "## Purpose" or "## Files" sections (weight 1)
# Score a prompt by summing weights of matching unique tokens.
# Threshold >= 3 = skill "loads"; >= 5 = "strong load"

LOAD_THRESHOLD=3

tokenize() {
  # accepts input as arg OR via stdin (when piped)
  local input
  if [[ $# -gt 0 ]]; then
    input="$1"
  else
    input="$(cat)"
  fi
  echo "$input" | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9 ]/ /g' \
    | tr -s ' ' '\n' \
    | grep -Ev '^(the|a|an|is|in|to|for|of|on|at|by|up|do|if|or|be|we|it|no|via|and|not|use|any|all|when|with|that|this|from|into|each|more|also|then|does|but|are|has|was|its|per)$' \
    | grep -E '.{3,}' \
    | sort -u
}

score_skill() {
  local skill_file="$1"
  local prompt_tokens="$2"   # newline-separated token list
  local score=0

  # description line
  local desc
  desc="$(awk '/^description:/{sub(/^description: */, ""); gsub(/^"|"$/, ""); print; exit}' "$skill_file")"
  local desc_tokens
  desc_tokens="$(tokenize "$desc")"

  # section body: When to Use body (skip header, stop at next ## section)
  local body_raw
  body_raw="$(awk 'found && /^## /{exit} /^## When to Use/{found=1; next} found' "$skill_file")"
  local body_tokens
  body_tokens="$(tokenize "$body_raw")"

  while IFS= read -r tok; do
    [[ -z "$tok" ]] && continue
    if echo "$desc_tokens" | grep -qF "$tok"; then
      score=$((score + 3))
    elif echo "$body_tokens" | grep -qF "$tok"; then
      score=$((score + 2))
    fi
  done <<< "$prompt_tokens"

  echo "$score"
}

# ─── Golden Test Suite ───────────────────────────────────────────────────────
# Format: "prompt text" -> "expected_skill1,expected_skill2"
# These map real task descriptions to the skills that MUST load.

declare -a TEST_PROMPTS
declare -A TEST_EXPECTED

add_test() { TEST_PROMPTS+=("$1"); TEST_EXPECTED["$1"]="$2"; }

# Content script / overlay / rendering
add_test "fix overlay scroll sync with the textarea source element" \
  "underline-preview-rendering,content-script-instrumentation"
add_test "mirror div position drifts after user scrolls horizontally" \
  "underline-preview-rendering,content-script-instrumentation"
add_test "underline segments disappear when hovering over long lines" \
  "underline-preview-rendering"
add_test "confidence styling not updating after new segment response" \
  "underline-preview-rendering"
add_test "stale overlay still visible after input is cleared" \
  "underline-preview-rendering,content-script-instrumentation"
add_test "textarea listener attached multiple times after dom rerender" \
  "content-script-instrumentation,mv3-extension-boundaries"
add_test "debounce not cancelling stale segmentation requests" \
  "content-script-instrumentation"
add_test "mutationobserver not re-attaching after dynamic editor reload" \
  "content-script-instrumentation"

# Background / port / service worker
add_test "background service worker loses port connection after chrome restarts" \
  "background-port-state-recovery,mv3-extension-boundaries"
add_test "per-tab session state disappears when service worker suspends" \
  "background-port-state-recovery"
add_test "port disconnect not cleaning up tab state on chrome reload" \
  "background-port-state-recovery,mv3-extension-boundaries"
add_test "content script cannot reconnect to background after extension update" \
  "background-port-state-recovery,mv3-extension-boundaries"

# SSE streaming
add_test "enhance endpoint stream not aborting when user types again" \
  "sse-streaming-bridge"
add_test "partial token chunks arrive out of order in streaming response" \
  "sse-streaming-bridge"
add_test "relay not flushing sse events to content script correctly" \
  "sse-streaming-bridge"

# Hotkey / bind / commit
add_test "tab key should accept the current suggestion and commit" \
  "hotkey-bind-commit-ux"
add_test "commit button fires multiple bind requests on rapid clicks" \
  "hotkey-bind-commit-ux"
add_test "acceptance hotkey should be blocked when no suggestion is ready" \
  "hotkey-bind-commit-ux"

# LLM routing
add_test "route free tier users to the groq model path" \
  "llm-router-and-model-selection"
add_test "pro tier model selection picks wrong model for byok mode" \
  "llm-router-and-model-selection"

# Prompt assembly
add_test "build the system prompt for the action clause goal type" \
  "system-prompt-assembly"
add_test "context clause template is missing output format instructions" \
  "system-prompt-assembly"

# Rate limiting / tier enforcement
add_test "quota middleware rejecting valid pro users on enhance endpoint" \
  "rate-limiting-tier-enforcement"
add_test "free tier burst limit not enforced on segment route" \
  "rate-limiting-tier-enforcement"

# Clause pipeline
add_test "clause ordering wrong in bind output, context appears after action" \
  "canonical-clause-ordering,clause-state-management"
add_test "stale section not invalidating downstream dependent clauses" \
  "clause-state-management"
add_test "bind sort order does not match canonical slot sequence" \
  "canonical-clause-ordering"

# Docs / planning
add_test "update the architecture planning document for step 9 changes" \
  "documentation-cohesion"
add_test "add a new manual test case for the overlay hover state" \
  "manual-testing-guides"

# Skill / workflow maintenance
add_test "add a new skill for step 10 and register it in the skill map" \
  "skill-map-governance,repo-workflow"
add_test "update workflow logging instructions to capture more detail" \
  "repo-workflow,workflow-logging"

# Self-improvement triggers
add_test "we keep making the same mistake attaching scroll listeners in the overlay" \
  "self-improvement-loop,skill-improvement-loop"
add_test "skill auto-loading did not work for the background worker task" \
  "skill-improvement-loop"

# ─── Runtime ─────────────────────────────────────────────────────────────────

# Collect all skill files
declare -a ALL_SKILLS=()
declare -A SKILL_NAME=()
while IFS= read -r f; do
  name="$(awk '/^name:/{print $2; exit}' "$f")"
  [[ -n "$name" ]] && ALL_SKILLS+=("$f") && SKILL_NAME["$f"]="$name"
done < <(find "$SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | sort)

run_test() {
  local prompt="$1"
  local expected_raw="${TEST_EXPECTED[$prompt]:-}"
  local prompt_tokens
  prompt_tokens="$(tokenize "$prompt")"

  declare -A scores=()
  declare -A loads=()
  for f in "${ALL_SKILLS[@]}"; do
    local s
    s="$(score_skill "$f" "$prompt_tokens")"
    scores["$f"]=$s
    [[ $s -ge $LOAD_THRESHOLD ]] && loads["$f"]=1 || loads["$f"]=0
  done

  # parse expected skills
  declare -a expected_names=()
  IFS=',' read -ra expected_names <<< "$expected_raw"

  local pass=true
  declare -a misses=()
  for exp in "${expected_names[@]}"; do
    local found=false
    for f in "${ALL_SKILLS[@]}"; do
      if [[ "${SKILL_NAME[$f]}" == "$exp" && ${loads[$f]} -eq 1 ]]; then
        found=true; break
      fi
    done
    $found || { pass=false; misses+=("$exp"); }
  done

  echo "$pass" "${misses[*]:-}" "${scores[@]}"
  # Return sorted skill loads for display
  for f in "${ALL_SKILLS[@]}"; do
    printf "%d %s\n" "${scores[$f]}" "${SKILL_NAME[$f]}"
  done | sort -rn
}

# ─── Output ──────────────────────────────────────────────────────────────────

PASS=0
FAIL=0
declare -A SKILL_MISS_COUNT=()
declare -A SKILL_HIT_COUNT=()

# Initialize counts
for f in "${ALL_SKILLS[@]}"; do
  SKILL_MISS_COUNT["${SKILL_NAME[$f]}"]=0
  SKILL_HIT_COUNT["${SKILL_NAME[$f]}"]=0
done

# Decide which prompts to run
declare -a RUN_PROMPTS=()
if [[ $# -gt 0 && "${1:-}" != "--report" ]]; then
  RUN_PROMPTS=("$@")
else
  RUN_PROMPTS=("${TEST_PROMPTS[@]}")
fi

for prompt in "${RUN_PROMPTS[@]}"; do
  expected_raw="${TEST_EXPECTED[$prompt]:-CUSTOM}"
  prompt_tokens="$(tokenize "$prompt")"

  # Score all skills
  declare -A cur_scores=()
  declare -A cur_loads=()
  for f in "${ALL_SKILLS[@]}"; do
    s="$(score_skill "$f" "$prompt_tokens")"
    cur_scores["$f"]=$s
    [[ $s -ge $LOAD_THRESHOLD ]] && cur_loads["$f"]=1 || cur_loads["$f"]=0
  done

  # Determine pass/fail for golden tests
  pass=true
  misses=""
  if [[ "$expected_raw" != "CUSTOM" ]]; then
    IFS=',' read -ra exp_arr <<< "$expected_raw"
    for exp in "${exp_arr[@]}"; do
      found=false
      for f in "${ALL_SKILLS[@]}"; do
        if [[ "${SKILL_NAME[$f]}" == "$exp" && ${cur_loads[$f]} -eq 1 ]]; then
          found=true; break
        fi
      done
      if ! $found; then
        pass=false
        misses="$misses $exp"
        SKILL_MISS_COUNT["$exp"]=$(( ${SKILL_MISS_COUNT[$exp]:-0} + 1 ))
      else
        SKILL_HIT_COUNT["$exp"]=$(( ${SKILL_HIT_COUNT[$exp]:-0} + 1 ))
      fi
    done
  fi

  if $REPORT_ONLY && $pass; then
    [[ "$expected_raw" != "CUSTOM" ]] && PASS=$((PASS+1))
    continue
  fi

  # Print test result
  if $pass; then
    echo "✅ PASS | $prompt"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL | $prompt"
    echo "   Expected but missed:$misses"
    FAIL=$((FAIL+1))
  fi

  if ! $REPORT_ONLY || ! $pass; then
    echo "   Top loaded skills:"
    for f in "${ALL_SKILLS[@]}"; do
      printf "     %d  %s\n" "${cur_scores[$f]}" "${SKILL_NAME[$f]}"
    done | sort -rn | head -6
    echo
  fi
done

# ─── Effectiveness Report ────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "  SKILL EFFECTIVENESS REPORT"
echo "════════════════════════════════════════"
printf "%-42s  %s / %s\n" "Skill" "Hits" "Opportunities"
echo "────────────────────────────────────────"
for f in "${ALL_SKILLS[@]}"; do
  name="${SKILL_NAME[$f]}"
  hits="${SKILL_HIT_COUNT[$name]:-0}"
  misses_count="${SKILL_MISS_COUNT[$name]:-0}"
  total=$(( hits + misses_count ))
  [[ $total -eq 0 ]] && continue
  rate=$(( hits * 100 / total ))
  bar=$(printf '█%.0s' $(seq 1 $((rate / 10))))
  printf "%-42s  %2d / %2d  (%3d%%)  %s\n" "$name" "$hits" "$total" "$rate" "$bar"
done | sort -t'(' -k2 -rn

echo "────────────────────────────────────────"
total_tests=$(( PASS + FAIL ))
echo "Suite: $PASS/$total_tests passed"
[[ $FAIL -gt 0 ]] && echo "ACTION NEEDED: $FAIL skill(s) have trigger gaps — run skill-improvement-loop"
echo "════════════════════════════════════════"

[[ $FAIL -gt 0 ]] && exit 1 || exit 0
