#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
SKILLS_DIR="$ROOT_DIR/.github/skills"

if [[ ! -d "$SKILLS_DIR" ]]; then
  echo "ERROR: skills directory not found at $SKILLS_DIR"
  exit 1
fi

if [[ $# -eq 0 ]]; then
  prompts=(
    "Please tighten our workflow docs, verify instruction consistency, and log what changed."
    "We keep repeating mistakes in our skills. Evaluate ineffective skills, summarize failures, and update the skill map."
  )
else
  prompts=("$*")
fi

keywords=(
  workflow instruction verify verification log logging
  mistake mistakes improve improvement summarize summary
  evaluate effectiveness update updated change changed scope
  rename remove add map skill skills loading auto
)

score_desc() {
  local prompt="$1"
  local desc="$2"
  local score=0
  local p d w

  p="$(echo "$prompt" | tr '[:upper:]' '[:lower:]')"
  d="$(echo "$desc" | tr '[:upper:]' '[:lower:]')"

  for w in "${keywords[@]}"; do
    if echo "$p" | grep -qw "$w" && echo "$d" | grep -qw "$w"; then
      score=$((score + 1))
    fi
  done

  echo "$score"
}

for prompt in "${prompts[@]}"; do
  echo "PROMPT: $prompt"
  while IFS= read -r skill_file; do
    name="$(awk '/^name:/{print $2; exit}' "$skill_file")"
    desc="$(awk -F': ' '/^description:/{print $2; exit}' "$skill_file" | sed 's/^"//; s/"$//')"
    score="$(score_desc "$prompt" "$desc")"
    printf "%02d %s | %s\n" "$score" "$name" "$desc"
  done < <(find "$SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | sort)
  echo
done | awk '
  /^PROMPT:/ {if (block) print ""; print; block=1; next}
  {lines[NR]=$0}
  /^$/ {next}
' >/dev/null

# Re-run for sorted display per prompt for readability.
for prompt in "${prompts[@]}"; do
  echo "PROMPT: $prompt"
  while IFS= read -r skill_file; do
    name="$(awk '/^name:/{print $2; exit}' "$skill_file")"
    desc="$(awk -F': ' '/^description:/{print $2; exit}' "$skill_file" | sed 's/^"//; s/"$//')"
    score="$(score_desc "$prompt" "$desc")"
    printf "%02d %s | %s\n" "$score" "$name" "$desc"
  done < <(find "$SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | sort) | sort -rn
  echo
done
