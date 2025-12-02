#!/bin/bash
# Shared helpers for stack-aware scripts

SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_LIB_DIR}/../.." && pwd)"
DEFAULT_STACK_DIR="${REPO_ROOT}/stacks/recipes"
DEFAULT_DEFAULTS_DIR="${REPO_ROOT}/defaults"

# Load secrets from .env if present (idempotent when sourced multiple times).
if [[ -z "${TERRIBLE_ENV_LOADED:-}" ]]; then
  ENV_FILE="${REPO_ROOT}/.env"
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    source "${ENV_FILE}"
    set +a
  fi
  export TERRIBLE_ENV_LOADED=1
fi

parse_stack_flag() {
  local stack_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--stack)
        stack_dir="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        return 1
        ;;
    esac
  done
  echo "${stack_dir}"
}

parse_stack_and_defaults_flags() {
  local stack_dir=""
  local defaults_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--stack)
        stack_dir="$2"
        shift 2
        ;;
      -d|--defaults)
        defaults_dir="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        return 1
        ;;
    esac
  done
  echo "${stack_dir}|${defaults_dir}"
}

resolve_stack_dir() {
  local provided="${1:-}"
  local stack_dir="${provided:-${DEFAULT_STACK_DIR}}"
  if [[ "${stack_dir}" != /* ]]; then
    stack_dir="${REPO_ROOT}/${stack_dir}"
  fi
  local resolved
  resolved="$(cd "$(dirname "${stack_dir}")" && pwd)/$(basename "${stack_dir}")"
  if [[ ! -d "${resolved}" ]]; then
    echo "Stack directory not found: ${resolved}" >&2
    return 1
  fi
  echo "${resolved}"
}

resolve_defaults_dir() {
  local provided="${1:-}"
  local defaults_dir="${provided:-${DEFAULT_DEFAULTS_DIR}}"
  if [[ "${defaults_dir}" != /* ]]; then
    defaults_dir="${REPO_ROOT}/${defaults_dir}"
  fi
  # If the path exists, ensure it is a directory; if missing, allow it (treated as empty defaults).
  if [[ -e "${defaults_dir}" ]]; then
    local resolved
    resolved="$(cd "$(dirname "${defaults_dir}")" && pwd)/$(basename "${defaults_dir}")"
    if [[ ! -d "${resolved}" ]]; then
      echo "Defaults path is not a directory: ${resolved}" >&2
      return 1
    fi
    echo "${resolved}"
  else
    echo "${defaults_dir}"
  fi
}

build_dir_name() {
  local stack_dir="$1"
  node "${REPO_ROOT}/js/stack_paths.js" "${stack_dir}" --build-dir-name
}

stack_dir_from_args() {
  local parsed
  parsed="$(parse_stack_flag "$@")"
  resolve_stack_dir "${parsed}"
}

stack_and_defaults_from_args() {
  local parsed
  parsed="$(parse_stack_and_defaults_flags "$@")" || return 1
  local stack_part="${parsed%%|*}"
  local defaults_part="${parsed#*|}"
  local resolved_stack
  resolved_stack="$(resolve_stack_dir "${stack_part}")" || return 1
  local resolved_defaults
  resolved_defaults="$(resolve_defaults_dir "${defaults_part}")" || return 1
  echo "${resolved_stack}|${resolved_defaults}"
}
