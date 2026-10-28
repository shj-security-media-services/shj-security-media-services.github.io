#!/usr/bin/env bash
# Size budget: the shell's hashed JS and CSS (the ones release.json lists) and the install page get/, at BASE and at HEAD.
# Warns when a group grows more than 10%. Never fails. Needs both commits in the clone.
set -euo pipefail
HEAD_REF="${HEAD_REF:-HEAD}"
BASE_REF="${BASE_REF:-HEAD~1}"
LIMIT="${LIMIT:-10}"

# bytes of the files of a group at a commit: group = js | css | get | shell (release.json's hashed files are the shell's)
bytes() {
  local ref="$1" group="$2" files
  case "$group" in
    js|css)
      files=$(git show "$ref:release.json" 2>/dev/null | jq -r --arg ext "$group" 'keys[] | select(test("^[^/]+\\.[0-9a-f]{8,}\\." + $ext + "$"))' || true) ;;
    get)
      files=$(git ls-tree -r --name-only "$ref" -- get/ 2>/dev/null || true) ;;
  esac
  local sum=0 f s
  for f in $files; do s=$(git cat-file -s "$ref:$f" 2>/dev/null || echo 0); sum=$((sum + s)); done
  echo "$sum"
}
kb() { awk -v b="$1" 'BEGIN { printf "%.1f KB", b / 1024 }'; }

if ! git cat-file -e "$BASE_REF^{commit}" 2>/dev/null; then BASE_REF=""; fi
rows=""; warn=0
for g in js css get; do
  case "$g" in js) name='JavaScript (shell)';; css) name='CSS (shell)';; get) name='صفحة التنزيل · get/';; esac
  now=$(bytes "$HEAD_REF" "$g")
  if [ -n "$BASE_REF" ]; then before=$(bytes "$BASE_REF" "$g"); else before=0; fi
  if [ "$before" -gt 0 ]; then
    pct=$(awk -v a="$now" -v b="$before" 'BEGIN { printf "%+.1f", (a - b) * 100 / b }')
    over=$(awk -v a="$now" -v b="$before" -v l="$LIMIT" 'BEGIN { print ((a - b) * 100 / b > l) ? 1 : 0 }')
  else pct="new"; over=0; fi
  mark="✅"
  if [ "$over" = 1 ]; then mark="⚠️"; warn=1; echo "::warning title=Size budget::$name grew $pct% ($(kb "$before") → $(kb "$now")), over the ${LIMIT}% budget"; fi
  rows+="| $name | $(kb "$before") | $(kb "$now") | ${pct}% | $mark |"$'\n'
  echo "$g: $before -> $now ($pct)"
done
{
  echo "### ميزانية الحجم · Size budget"
  echo
  echo "مقارنة \`${HEAD_REF::7}\` بـ \`${BASE_REF:0:7}\` · comparing with the previous commit (تنبيه فوق ${LIMIT}% · warning above ${LIMIT}%)"
  echo
  echo "| المجموعة · Group | قبل · Before | بعد · After | التغيّر · Change | |"
  echo "|---|---|---|---|---|"
  printf '%s' "$rows"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
exit 0
