#!/usr/bin/env bash
# session-end.sh — Stop hook.
# 1. Checks TypeScript in packages modified since last commit
# 2. Appends a session boundary to .claude/debugging_log.md
# 3. Runs update-skill-memory.sh to process any new Debug Entry blocks
# 4. Sends ntfy push notification

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.claude/debugging_log.md"
ERRORS_TMP="$PROJECT_DIR/.claude/session_errors.tmp"

mkdir -p "$PROJECT_DIR/.claude"
> "$ERRORS_TMP" 2>/dev/null || true

SESSION_DATE="$(date -u +%Y-%m-%d)"
SESSION_TIME="$(date -u +%H:%M:%SZ)"
TS_ERRORS=""

# ─── 1. TypeScript check on uncommitted packages ──────────────────────────────
MODIFIED_TS="$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep '\.ts$' || true)"

if [[ -n "$MODIFIED_TS" ]]; then
  for pkg in extension backend; do
    if echo "$MODIFIED_TS" | grep -q "^$pkg/"; then
      PKG_PATH="$PROJECT_DIR/$pkg"
      if [[ -f "$PKG_PATH/package.json" ]]; then
        PKG_ERRORS="$(cd "$PKG_PATH" && ./node_modules/.bin/tsc --noEmit 2>&1 | head -40 || true)"
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

# ─── 2. Append session boundary to debugging log ─────────────────────────────
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
    ERROR_COUNT="$(echo "$TS_ERRORS" | grep -c 'error TS' || true)"
    echo "**Verification Result:** ❌ Errors found ($ERROR_COUNT TypeScript error(s))"
    echo "$TS_ERRORS"
  else
    echo "**Verification Result:** ✅ No TypeScript errors"
  fi
  echo ""
} >> "$LOG_FILE"

# ─── 3. Process new Debug Entry blocks into memory files ──────────────────────
UPDATE_MEM="$PROJECT_DIR/scripts/update-skill-memory.sh"
[[ -x "$UPDATE_MEM" ]] && bash "$UPDATE_MEM" 2>/dev/null || true

# ─── 4. Push notification ─────────────────────────────────────────────────────
NOTIFY="$PROJECT_DIR/scripts/notify.sh"
if [[ -x "$NOTIFY" ]]; then
  if [[ -n "$TS_ERRORS" ]]; then
    bash "$NOTIFY" "Done — TypeScript errors found. Check .claude/debugging_log.md" \
      "PromptCompiler — Claude" "high" "warning,claude"
  else
    bash "$NOTIFY" "Done — no errors." "PromptCompiler — Claude" "default" "white_check_mark,claude"
  fi
fi

if [[ -n "$TS_ERRORS" ]]; then
  echo "⚠️  SESSION END: TypeScript errors found"
else
  echo "✅ SESSION END: No TypeScript errors"
fi
