#!/usr/bin/env bash
# Run a command on the Hugging Face CPU box ($0.03/h, 8 vCPU / 32 GB, cpu-upgrade) at a pushed Frankendom-v3 sha. Strategy's ruling 2026-10-27: lanejob's spill is
# hard-wired to another repo, so V3 jobs go straight to `hf jobs run`.
#   scripts/hf-job.sh <sha> -- <cmd...>        e.g.  scripts/hf-job.sh a8f9b10... -- npm test
# Run it ON THE VPS as root (the hf CLI there submits the job); the sha must be pushed to github.com/DomLynch/Frankendom-v3. Detached: it prints the job id and
# `tier=hf-cpu job=<id>`; follow with `hf jobs logs <id>`. The job carries NO secrets (the repo is public; the token only authorises the submit from here).
# Env: HF_JOB_TIMEOUT (default 30m), HF_JOB_FLAVOR (default cpu-upgrade), HF_JOB_REPO (default DomLynch/Frankendom-v3).
set -euo pipefail
sha=${1:?usage: scripts/hf-job.sh <sha> -- <cmd...>}; shift
[ "${1:-}" = "--" ] && shift
[ "$#" -gt 0 ] || { echo "hf-job: no command" >&2; exit 2; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "hf-job: the sha must be the full 40-hex commit id" >&2; exit 2; }
repo=${HF_JOB_REPO:-DomLynch/Frankendom-v3}
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "hf-job: bad repo" >&2; exit 2; }
argv=$(printf '%s\0' "$@" | base64 -w0)   # the command crosses as base64, never re-quoted
script='set -euo pipefail; t0=$(date +%s); lap(){ echo "LAP $1 $(( $(date +%s) - t0 ))s"; }
timeout 300 apt-get update -qq >/dev/null; timeout 300 apt-get install -y -qq git ca-certificates >/dev/null; lap apt
mkdir /work && cd /work && git init -q && git remote add origin "https://github.com/$REPO.git"
timeout 300 git fetch -q --depth 1 origin "$SHA" && git checkout -q FETCH_HEAD; lap clone
[ -f package-lock.json ] && { timeout 600 npm ci --silent; lap npm-ci; }
mapfile -d "" -t cmd < <(printf %s "$JOB_ARGV_B64" | base64 -d)
echo "RUN ${cmd[*]}"; set +e; "${cmd[@]}"; rc=$?; lap "done rc=$rc"; exit $rc'
HF_TOKEN="$(cat /root/.hf/token)"; export HF_TOKEN
out=$(hf jobs run --detach --flavor "${HF_JOB_FLAVOR:-cpu-upgrade}" --timeout "${HF_JOB_TIMEOUT:-30m}" -e "SHA=$sha" -e "REPO=$repo" -e "JOB_ARGV_B64=$argv" node:22 bash -c "$script")
id=$(printf '%s\n' "$out" | grep -oE '[0-9a-f]{24}' | head -1)
[ -n "$id" ] || { echo "hf-job: no job id in: $out" >&2; exit 1; }
echo "tier=hf-cpu job=$id sha=${sha:0:7} (detached; follow: hf jobs logs $id)"
