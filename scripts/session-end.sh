#!/usr/bin/env bash
# session-end.sh
# Runs after each Claude Code session (Stop hook).
# 1. Checks for TypeScript errors in modified packages
# 2. Appends a structured session boundary to the debugging log
# 3. Flags skill-improvement-loop if error threshold is exceeded

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.claude/debugging_log.md"
ERRORS_TMP="$PROJECT_DIR/.claude/session_errors.tmp"
CONFIG_FILE="$PROJECT_DIR/.claude/config"

# Load config (with fallback defaults)
TS_ERROR_THRESHOLD=2
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"
THRESHOLD_TRIGGER="${TS_ERROR_THRESHOLD}"

mkdir -p "$PROJECT_DIR/.claude"

SESSION_DATE="$(date -u +%Y-%m-%d)"
SESSION_TIME="$(date -u +%H:%M:%SZ)"
TS_ERRORS=""
SKILL_FLAG=false

# ─── 1. TypeScript Verification ──────────────────────────────────────────────
# Only check packages that have TypeScript files modified since last commit
MODIFIED_TS="$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep '\.ts$' || true)"

if [[ -n "$MODIFIED_TS" ]]; then
  for pkg in extension backend; do
    if echo "$MODIFIED_TS" | grep -q "^$pkg/"; then
      PKG_PATH="$PROJECT_DIR/$pkg"
      if [[ -f "$PKG_PATH/package.json" ]]; then
        PKG_ERRORS="$(cd "$PKG_PATH" && npx tsc --noEmit 2>&1 | head -40 || true)"
        if [[ -n "$PKG_ERRORS" ]]; then
          TS_ERRORS="$TS_ERRORS
### TypeScript Errors ($pkg)
\`\`\`
$PKG_ERRORS
\`\`\`"
        fi
      fi
    fi
  done
fi

# ─── 2. Count errors and decide flag ─────────────────────────────────────────
# Count error lines (lines containing "error TS")
ERROR_COUNT=0
if [[ -n "$TS_ERRORS" ]]; then
  ERROR_COUNT="$(echo "$TS_ERRORS" | grep -c 'error TS' || true)"
fi

# Also check accumulated session errors from previous Stop runs in this session
PREV_ERROR_COUNT=0
if [[ -f "$ERRORS_TMP" ]]; then
  PREV_ERROR_COUNT="$(grep -c 'error TS' "$ERRORS_TMP" 2>/dev/null || true)"
fi

TOTAL_ERRORS=$(( ERROR_COUNT + PREV_ERROR_COUNT ))
[[ $TOTAL_ERRORS -ge $THRESHOLD_TRIGGER ]] && SKILL_FLAG=true

# ─── 3. Append to debugging log ──────────────────────────────────────────────
{
  echo ""
  echo "---"
  echo "## Session End — $SESSION_DATE $SESSION_TIME"
  echo ""

  if [[ -n "$MODIFIED_TS" ]]; then
    echo "**Modified TypeScript files:**"
    echo "$MODIFIED_TS" | sed 's/^/- /'
    echo ""
  fi

  if [[ -n "$TS_ERRORS" ]]; then
    echo "**Verification Result:** ❌ Errors found ($ERROR_COUNT TypeScript error(s))"
    echo "$TS_ERRORS"
  else
    echo "**Verification Result:** ✅ No TypeScript errors"
  fi

  if [[ -f "$ERRORS_TMP" && -s "$ERRORS_TMP" ]]; then
    echo ""
    echo "**Accumulated session errors:**"
    cat "$ERRORS_TMP"
  fi

  if $SKILL_FLAG; then
    echo ""
    echo "> ⚠️ **AUTO-FLAG:** $TOTAL_ERRORS error(s) this session exceeded threshold ($THRESHOLD_TRIGGER)."
    echo "> Run \`skill-improvement-loop\` before next task — score active skills and update any with trigger gaps."
  fi

  echo ""
} >> "$LOG_FILE"

# Append new TS errors to tmp for pattern accumulation within session
if [[ -n "$TS_ERRORS" ]]; then
  echo "$TS_ERRORS" >> "$ERRORS_TMP"
fi

# ─── 4. Send ntfy.sh push notification ───────────────────────────────────────
NOTIFY="$PROJECT_DIR/scripts/notify.sh"
if [[ -x "$NOTIFY" ]]; then
  if $SKILL_FLAG; then
    bash "$NOTIFY" \
      "Done — $TOTAL_ERRORS TS error(s). Run skill-improvement-loop before next task." \
      "PromptCompiler — Claude" "high" "warning,claude"
  elif [[ -n "$TS_ERRORS" ]]; then
    bash "$NOTIFY" \
      "Done — TypeScript errors found. Check .claude/debugging_log.md" \
      "PromptCompiler — Claude" "default" "warning,claude"
  else
    bash "$NOTIFY" \
      "Done — no errors." \
      "PromptCompiler — Claude" "default" "white_check_mark,claude"
  fi
fi

# ─── 5. Update skill memory from structured debug entries ────────────────────
UPDATE_MEM="$PROJECT_DIR/scripts/update-skill-memory.sh"
if [[ -x "$UPDATE_MEM" ]]; then
  bash "$UPDATE_MEM" 2>/dev/null || true
fi

# ─── 6. Run pattern analysis ──────────────────────────────────────────────────
ANALYZE="$PROJECT_DIR/scripts/analyze-patterns.sh"
if [[ -x "$ANALYZE" ]]; then
  bash "$ANALYZE" 2>/dev/null || true
fi

# Print to stdout so Claude Code sees it in the Stop hook output
if $SKILL_FLAG; then
  echo "⚠️  SESSION END: $TOTAL_ERRORS TS error(s) — skill-improvement-loop flagged"
elif [[ -n "$TS_ERRORS" ]]; then
  echo "⚠️  SESSION END: TypeScript errors found — check .claude/debugging_log.md"
else
  echo "✅ SESSION END: No TypeScript errors"
fi
