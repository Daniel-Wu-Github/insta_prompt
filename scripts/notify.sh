#!/usr/bin/env bash
# notify.sh — sends a push notification to ntfy.sh
# Usage: notify.sh "message" [title] [priority] [tags]
#   priority: min | low | default | high | urgent
#   tags:     comma-separated ntfy tag names (e.g. "white_check_mark,claude")
#
# Called by:
#   - session-end.sh (Stop hook) — "finished working" message
#   - settings.json Notification hook — "needs attention" message

NTFY_URL="https://ntfy.sh/claude-termius-daniel"
MSG="${1:-Claude notification}"
TITLE="${2:-PromptCompiler — Claude}"
PRIORITY="${3:-default}"
TAGS="${4:-bell}"

curl -s \
  -H "Title: $TITLE" \
  -H "Priority: $PRIORITY" \
  -H "Tags: $TAGS" \
  -d "$MSG" \
  "$NTFY_URL" > /dev/null 2>&1 || true
