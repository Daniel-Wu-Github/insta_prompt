#!/usr/bin/env bash
# post-edit-check.sh
# PostToolUse hook — fires after every Edit or Write tool call.
# If the edited file is TypeScript, runs an incremental tsc check on the package.
# Rate-limited: skips if the same package was checked less than 30 seconds ago.

set -uo pipefail

PROJECT_DIR="/home/seed/projects/insta_prompt"
ERRORS_TMP="$PROJECT_DIR/.claude/session_errors.tmp"
LAST_CHECK_FILE="$PROJECT_DIR/.claude/last_tsc_check.tmp"
CONFIG_FILE="$PROJECT_DIR/.claude/config"

POST_EDIT_RATE_LIMIT_SECS=30
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"
RATE_LIMIT_SECS="${POST_EDIT_RATE_LIMIT_SECS}"

mkdir -p "$PROJECT_DIR/.claude"

# ─── 1. Extract edited file path from CLAUDE_TOOL_INPUT ──────────────────────
FILE=""
if [[ -n "${CLAUDE_TOOL_INPUT:-}" ]]; then
  FILE=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    print(d.get('file_path', ''))
except Exception:
    print('')
" "$CLAUDE_TOOL_INPUT" 2>/dev/null || echo "")
fi

# Skip if not a TypeScript file
[[ "$FILE" != *.ts ]] && exit 0

# ─── 2. Identify the package ─────────────────────────────────────────────────
PKG_DIR=""
PKG_NAME=""
if [[ "$FILE" == */extension/* ]]; then
  PKG_DIR="$PROJECT_DIR/extension"; PKG_NAME="extension"
elif [[ "$FILE" == */backend/* ]]; then
  PKG_DIR="$PROJECT_DIR/backend"; PKG_NAME="backend"
else
  exit 0
fi

[[ ! -f "$PKG_DIR/package.json" ]] && exit 0

# ─── 3. Rate limit: skip if checked this package recently ────────────────────
NOW=$(date +%s)
LAST_CHECK=0
if [[ -f "$LAST_CHECK_FILE" ]]; then
  LAST_CHECK=$(grep "^$PKG_NAME=" "$LAST_CHECK_FILE" 2>/dev/null | cut -d= -f2 || echo 0)
fi
ELAPSED=$(( NOW - LAST_CHECK ))
if [[ $ELAPSED -lt $RATE_LIMIT_SECS ]]; then
  exit 0
fi

# Update timestamp before running (prevents parallel runs)
if grep -q "^$PKG_NAME=" "$LAST_CHECK_FILE" 2>/dev/null; then
  sed -i "s/^$PKG_NAME=.*/$PKG_NAME=$NOW/" "$LAST_CHECK_FILE"
else
  echo "$PKG_NAME=$NOW" >> "$LAST_CHECK_FILE"
fi

# ─── 4. Run incremental TypeScript check ─────────────────────────────────────
RESULT=$(cd "$PKG_DIR" && timeout 45 npx tsc --noEmit --skipLibCheck 2>&1 | head -40 || true)

if [[ -z "$RESULT" ]]; then
  exit 0
fi

# ─── 5. Record errors ─────────────────────────────────────────────────────────
{
  echo "### TS check — $(basename "$FILE") — $(date -u +%H:%M:%SZ)"
  echo '```'
  echo "$RESULT"
  echo '```'
  echo ""
} >> "$ERRORS_TMP"

# ─── 6. Notify ────────────────────────────────────────────────────────────────
ERROR_COUNT=$(echo "$RESULT" | grep -c 'error TS' || true)
bash "$PROJECT_DIR/scripts/notify.sh" \
  "TypeScript: $ERROR_COUNT error(s) after editing $(basename "$FILE")" \
  "PromptCompiler — TS Error" "high" "x,claude" 2>/dev/null || true

echo "⚠️  POST-EDIT: $ERROR_COUNT TS error(s) in $PKG_NAME — see .claude/session_errors.tmp"
