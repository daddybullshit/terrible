#!/bin/bash
set -euo pipefail

show_help() {
	echo
	echo "Usage:"
	echo "  build -s <dir> [-d <dir>]  Build stack (stack default: stacks/recipes; defaults dir default: defaults)"
	echo
}

if [[ $# -lt 1 ]]; then
	show_help
	exit 1
fi

COMMAND="$1"
shift

if [[ "${COMMAND}" == "-h" || "${COMMAND}" == "--help" ]]; then
	show_help
	exit 0
fi

if [[ "${COMMAND}" != "build" ]]; then
	echo "Unknown command: ${COMMAND}"
	show_help
	exit 1
fi

# Resolve repository root to find helper scripts no matter where this entrypoint lives.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"${ROOT_DIR}/scripts/build.sh" "$@"
