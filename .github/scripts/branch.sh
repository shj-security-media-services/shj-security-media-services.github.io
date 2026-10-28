#!/usr/bin/env bash
# A data branch of this repository (status, visual-baseline) in its own folder, so the checks keep their history outside main
# (GitHub Pages serves main only).
#   branch.sh open <branch> <dir>        clone the branch into <dir>, or start it empty when it does not exist yet
#   branch.sh push <dir> <message>       commit everything in <dir> and push it (retries, rebases on a newer push)
# Needs GH_TOKEN (the workflow's token, with contents: write for push) and GITHUB_REPOSITORY.
set -euo pipefail
cmd="${1:?open|push}"
url="https://x-access-token:${GH_TOKEN:?}@github.com/${GITHUB_REPOSITORY:?}.git"

case "$cmd" in
  open)
    branch="${2:?branch}"; dir="${3:?dir}"
    if git ls-remote --exit-code --heads "$url" "$branch" >/dev/null 2>&1; then
      git clone -q --depth 1 --single-branch -b "$branch" "$url" "$dir"
    else
      echo "branch $branch does not exist yet: starting it"
      mkdir -p "$dir"
      git -C "$dir" init -q -b "$branch"
      git -C "$dir" remote add origin "$url"
    fi
    git -C "$dir" config user.name "github-actions[bot]"
    git -C "$dir" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    ;;
  push)
    dir="${2:?dir}"; msg="${3:?message}"
    branch="$(git -C "$dir" symbolic-ref --short HEAD)"
    git -C "$dir" add -A
    if git -C "$dir" diff --cached --quiet; then echo "nothing to commit on $branch"; exit 0; fi
    git -C "$dir" commit -q -m "$msg"
    for wait in 2 4 8 16 32; do
      if git -C "$dir" push -q origin "HEAD:refs/heads/$branch"; then echo "pushed $branch"; exit 0; fi
      echo "push of $branch refused, retrying in ${wait}s"
      sleep "$wait"
      git -C "$dir" pull -q --rebase origin "$branch" || { git -C "$dir" rebase --abort 2>/dev/null || true; }
    done
    echo "::warning title=$branch::could not push to the $branch branch"
    exit 1
    ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
