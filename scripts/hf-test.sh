#!/bin/bash
# The unit suite on a job (hfjob -- bash scripts/hf-test.sh): the job's checkout is depth 1, so fetch the V1 seed tag the Gate 0 and byte-for-byte clip tests read, then npm test.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch --no-tags --depth=1 origin refs/tags/v1-seed-82a994d15:refs/tags/v1-seed-82a994d15
npm test
