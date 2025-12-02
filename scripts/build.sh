#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/stack.sh"

PAIR="$(stack_and_defaults_from_args "$@")"
STACK_DIR="${PAIR%%|*}"
DEFAULTS_DIR="${PAIR#*|}"

echo "Building stack at ${STACK_DIR}"
node "${REPO_ROOT}/js/build.js" -d "${DEFAULTS_DIR}" "${STACK_DIR}"
