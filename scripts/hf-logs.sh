#!/usr/bin/env bash
# Tail a Hugging Face job's log (run ON THE VPS as root, like scripts/hf-job.sh; the token is read here and never printed):  scripts/hf-logs.sh <job id> [lines]
set -euo pipefail
id=${1:?usage: scripts/hf-logs.sh <job id> [lines]}
[[ "$id" =~ ^[0-9a-f]{24}$ ]] || { echo "hf-logs: bad job id" >&2; exit 2; }
HF_TOKEN="$(cat /root/.hf/token)"; export HF_TOKEN
hf jobs logs "$id" 2>&1 | tail -n "${2:-40}"
