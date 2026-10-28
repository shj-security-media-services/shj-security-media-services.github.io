#!/usr/bin/env bash
# Waits until GitHub Pages serves this commit: the live version.json, index.html and get/index.html must be byte for byte the checked-out
# ones (a cache-busting query skips the CDN's copy). Gives up after WAIT_MAX seconds (default 300) with a warning and lets the check run.
set -uo pipefail
SITE="${SITE:-https://shj-security-media-services.github.io}"
MAX="${WAIT_MAX:-300}"
files=(version.json index.html get/index.html)
start=$(date +%s)
while :; do
  miss=""
  for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    want=$(sha256sum < "$f" | cut -d' ' -f1)
    got=$(curl -fsS --max-time 20 "$SITE/$f?deploy=$(date +%s%N)" 2>/dev/null | sha256sum | cut -d' ' -f1)
    [ "$want" = "$got" ] || { miss="$f"; break; }
  done
  waited=$(( $(date +%s) - start ))
  if [ -z "$miss" ]; then echo "the site serves this commit (waited ${waited}s)"; exit 0; fi
  if [ "$waited" -ge "$MAX" ]; then
    echo "::warning title=Deploy::the site still does not serve this commit's $miss after ${waited}s; checking what it serves now"
    exit 0
  fi
  echo "waiting for the deploy ($miss differs, ${waited}s)"
  sleep 15
done
