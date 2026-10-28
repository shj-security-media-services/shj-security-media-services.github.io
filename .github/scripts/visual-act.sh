#!/usr/bin/env bash
# After visual.mjs: keeps the baselines on the visual-baseline branch and reports a change.
#   accept=true, or no baselines yet: the new screenshots become the baselines (current/).
#   a screen changed: before/after/diff go to changes/<date>_<commit>_<run>/ on that branch, one issue «🎨 تغيّر في شكل الصفحات»
#   (label مظهر) gets them (a comment when it is already open), and the run fails.
#   nothing changed: new screens join the baselines; an open change issue is closed (the pages look like the baselines again).
# Env: VIS (visual.mjs output: shots/, diffs/, result.json, summary.md), VB (visual-baseline clone), ACCEPT, GH_TOKEN, GITHUB_*.
# Writes $VIS/outcome (accepted | created | changed | same).
set -euo pipefail
: "${VIS:?}" "${VB:?}"
R="$VIS/result.json"
REPO="$GITHUB_REPOSITORY"
SHA7="${GITHUB_SHA::7}"
RUN="$GITHUB_SERVER_URL/$REPO/actions/runs/$GITHUB_RUN_ID"
TITLE='🎨 تغيّر في شكل الصفحات'
LABEL='مظهر'
changed=$(jq '.changed' "$R")
total=$(jq '.total' "$R")
have=$(find "$VB/current" -name '*.png' 2>/dev/null | wc -l)

open_issue() {
  gh issue list --label "$LABEL" --state open --limit 20 --json number,title --jq "map(select(.title == \"$TITLE\"))[0].number // empty"
}
info() {
  jq -n --arg commit "$GITHUB_SHA" --arg run "$RUN" --arg at "$(date -u +%FT%TZ)" --arg why "$1" '{commit:$commit, run:$run, at:$at, why:$why}' > "$VB/current/info.json"
}
readme() {
  cat > "$VB/README.md" <<'EOF'
# visual-baseline

صور المرجع للفحص البصري (`.github/workflows/visual.yml`) — لا تُنشر على الموقع.
Baseline screenshots of the visual check (`.github/workflows/visual.yml`); GitHub Pages does not serve this branch.

- `current/`: صور المرجع الحالية · the current baselines (`<page>-<device>-<light|dark>-<ar|en>.png`, `info.json` = the commit they came from)
- `changes/<date>_<commit>_<run>/`: قبل/بعد/الفرق لكل تغيّر · before / after / diff of each detected change

اعتماد شكل جديد · Accept a new look: Actions → Visual → Run workflow → ✓ accept (or `gh workflow run visual.yml -f accept=true`).
EOF
}

readme
if [ "${ACCEPT:-false}" = "true" ] || [ "$have" -eq 0 ]; then
  why=$([ "${ACCEPT:-false}" = "true" ] && echo accepted || echo created)
  rm -rf "$VB/current"; mkdir -p "$VB/current"
  cp "$VIS/shots/"*.png "$VB/current/"
  info "$why"
  bash .github/scripts/branch.sh push "$VB" "baseline $why: $total screens from ${SHA7}"
  n=$(open_issue || true)
  if [ -n "$n" ] && [ "$why" = accepted ]; then
    gh issue comment "$n" --body "✅ اعتُمد الشكل الحالي مرجعاً جديداً · The current look is the new baseline ([run]($RUN), commit \`$SHA7\`)."
    gh issue close "$n" --reason completed
  fi
  echo "$why" > "$VIS/outcome"
  { echo; echo "**المرجع · Baseline:** $why ($total screens) → branch \`visual-baseline\`"; } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

# new screens (a page or a variant added) join the baselines in every case
for name in $(jq -r '.shots[] | select(.status == "new") | .name' "$R"); do cp "$VIS/shots/$name.png" "$VB/current/"; done

if [ "$changed" -gt 0 ]; then
  d="changes/$(date -u +%F)_${SHA7}_${GITHUB_RUN_ID}"
  mkdir -p "$VB/$d"
  names=$(jq -r '.shots[] | select(.status == "changed") | .name' "$R")
  for name in $names; do
    cp "$VB/current/$name.png" "$VB/$d/$name-before.png"
    cp "$VIS/shots/$name.png" "$VB/$d/$name-after.png"
    cp "$VIS/diffs/$name.png" "$VB/$d/$name-diff.png"
  done
  cp "$VIS/summary.md" "$VB/$d/summary.md"
  bash .github/scripts/branch.sh push "$VB" "change seen: $changed of $total screens at ${SHA7}"
  c=$(git -C "$VB" rev-parse HEAD)
  raw="https://raw.githubusercontent.com/$REPO/$c/$d"
  tree="$GITHUB_SERVER_URL/$REPO/tree/$c/$d"
  body="$RUNNER_TEMP/visual-issue.md"
  {
    echo "تغيّر شكل **$changed** من $total شاشة بعد \`$SHA7\`. · **$changed** of $total screens look different after \`$SHA7\`."
    echo
    echo "- [سجل الفحص · Check run]($RUN) · [كل الصور · All images]($tree)"
    echo "- إن كان التغيير مقصوداً فاعتمده: Actions → Visual → Run workflow → ✓ accept، أو \`gh workflow run visual.yml -f accept=true\`."
    echo "- If the change is intended, accept it: Actions → Visual → Run workflow → ✓ accept (or \`gh workflow run visual.yml -f accept=true\`)."
    echo
    for name in $names; do
      pct=$(jq -r --arg n "$name" '.shots[] | select(.name == $n) | ((.ratio * 10000 | round) / 100 | tostring) + "%"' "$R")
      echo "#### \`$name\` · $pct"
      echo
      echo "| قبل · Before | بعد · After | الفرق · Diff |"
      echo "|---|---|---|"
      echo "| <img src=\"$raw/$name-before.png\" width=\"200\"> | <img src=\"$raw/$name-after.png\" width=\"200\"> | <img src=\"$raw/$name-diff.png\" width=\"200\"> |"
      echo
    done
  } > "$body"
  n=$(open_issue || true)
  if [ -n "$n" ]; then gh issue comment "$n" --body-file "$body"; else gh issue create --title "$TITLE" --label "$LABEL" --body-file "$body"; fi
  echo "changed" > "$VIS/outcome"
  { echo; echo "**🎨 $changed screens changed** → [images]($tree)"; } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  echo "::error title=Visual::$changed of $total screens changed; see the issue «$TITLE», or run Visual with accept=true if the change is intended"
  exit 1
fi

bash .github/scripts/branch.sh push "$VB" "new screens from ${SHA7}" || true
n=$(open_issue || true)
if [ -n "$n" ]; then
  gh issue comment "$n" --body "✅ عادت الصفحات تطابق المرجع · The pages match the baselines again ([run]($RUN), commit \`$SHA7\`)."
  gh issue close "$n" --reason completed
fi
echo "same" > "$VIS/outcome"
