#!/usr/bin/env bash
# notify-approval.sh
# Notification hook — fires when Claude Code needs user interaction/approval
# (tool permission prompts, waiting for input, etc.)

set -uo pipefail

PROJECT_DIR="/home/seed/projects/insta_prompt"
NOTIFY="$PROJECT_DIR/scripts/notify.sh"
LOG_FILE="$PROJECT_DIR/.claude/notification_log.txt"

mkdir -p "$(dirname "$LOG_FILE")"

# Try to extract notification message from multiple possible env var locations
MSG=""
[[ -n "${CLAUDE_NOTIFICATION:-}" ]] && MSG="$CLAUDE_NOTIFICATION"
[[ -z "$MSG" && -n "${NOTIFICATION:-}" ]] && MSG="$NOTIFICATION"
[[ -z "$MSG" && -n "${CLAUDE_MESSAGE:-}" ]] && MSG="$CLAUDE_MESSAGE"

# Fallback: use a generic message
[[ -z "$MSG" ]] && MSG="Claude Code is waiting for your approval or input"

# Log for debugging (in case notify fails)
{
  echo "[$(date -u +%H:%M:%SZ)] Notification event"
  echo "  Message: $MSG"
  echo "  Env vars: CLAUDE_NOTIFICATION='${CLAUDE_NOTIFICATION:-}' NOTIFICATION='${NOTIFICATION:-}' CLAUDE_MESSAGE='${CLAUDE_MESSAGE:-}'"
  echo ""
} >> "$LOG_FILE"

# Send the notification
bash "$NOTIFY" \
  "⏸️  $MSG" \
  "PromptCompiler — Waiting for You" "high" "bell,hourglass,claude" 2>/dev/null || {
  echo "[$(date -u +%H:%M:%SZ)] notify.sh failed" >> "$LOG_FILE"
}

# Print to Claude Code's output
echo "🔔 Notification sent to ntfy.sh — check your phone"
