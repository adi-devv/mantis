#!/usr/bin/env bash
# List Codex jobs started by scripts/codex-job.sh: label, state, start, end, exit code.
set -u
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.codex-jobs
shopt -s nullglob
files=("$dir"/*.status)
if [ "${#files[@]}" -eq 0 ]; then echo "no codex jobs"; exit 0; fi
printf '%-24s %-8s %-21s %-21s %s\n' LABEL STATE START END EXIT
for f in "${files[@]}"; do
  get() { sed -n "s/^$1=//p" "$f"; }
  printf '%-24s %-8s %-21s %-21s %s\n' "$(get label)" "$(get state)" "$(get start)" "$(get end)" "$(get exit)"
done
