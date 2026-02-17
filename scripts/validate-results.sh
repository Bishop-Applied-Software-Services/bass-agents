#!/usr/bin/env bash
set -euo pipefail

# validate-results.sh — Validate agent-results/*.json against bass-agents schemas.
# Usage: ./scripts/validate-results.sh [results-dir] [schemas-dir]
#
# Exits non-zero on validation failure (CI-friendly).

RESULTS_DIR="${1:-agent-results}"
SCHEMAS_DIR="${2:-schemas}"

TASK_SCHEMA="${SCHEMAS_DIR}/agent-task.schema.json"
RESULT_SCHEMA="${SCHEMAS_DIR}/agent-result.schema.json"

usage() {
  echo "Usage: $0 [results-dir] [schemas-dir]"
  echo ""
  echo "Validates JSON files in results-dir against the appropriate schema."
  echo "Auto-detects schema type by checking for 'definition_of_done' (task)"
  echo "or 'findings' (result) keys."
  echo ""
  echo "  results-dir   Directory containing .json files (default: agent-results/)"
  echo "  schemas-dir   Directory containing schema files (default: schemas/)"
  exit 1
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
fi

if [[ ! -d "$RESULTS_DIR" ]]; then
  echo "Error: results directory not found: $RESULTS_DIR" >&2
  exit 1
fi

if [[ ! -f "$TASK_SCHEMA" ]]; then
  echo "Error: task schema not found: $TASK_SCHEMA" >&2
  exit 1
fi

if [[ ! -f "$RESULT_SCHEMA" ]]; then
  echo "Error: result schema not found: $RESULT_SCHEMA" >&2
  exit 1
fi

# Detect validation tool
VALIDATOR=""
if command -v ajv &>/dev/null; then
  VALIDATOR="ajv"
elif command -v python3 &>/dev/null && python3 -c "import jsonschema" 2>/dev/null; then
  VALIDATOR="python"
elif command -v jq &>/dev/null; then
  VALIDATOR="jq"
else
  echo "Error: no validator found. Install one of: ajv-cli (npm), python3 jsonschema, jq" >&2
  exit 1
fi

echo "Using validator: $VALIDATOR"
echo "Results dir: $RESULTS_DIR"
echo "Schemas dir: $SCHEMAS_DIR"
echo ""

TOTAL=0
PASSED=0
FAILED=0

validate_ajv() {
  local file="$1" schema="$2"
  ajv validate -s "$schema" -d "$file" 2>&1
}

validate_python() {
  local file="$1" schema="$2"
  python3 -c "
import json, sys
from jsonschema import validate, ValidationError

with open('$schema') as sf:
    schema = json.load(sf)
with open('$file') as df:
    data = json.load(df)
try:
    validate(instance=data, schema=schema)
    print('valid')
except ValidationError as e:
    print(f'INVALID: {e.message}', file=sys.stderr)
    sys.exit(1)
"
}

validate_jq() {
  local file="$1" schema="$2"
  # Basic structural check: verify required fields exist
  if [[ "$schema" == *"agent-task"* ]]; then
    jq -e '.task_id and .project and .goal and .definition_of_done' "$file" > /dev/null 2>&1
  else
    jq -e '.task_id and .status and .summary and .findings' "$file" > /dev/null 2>&1
  fi
}

for file in "${RESULTS_DIR}"/*.json; do
  [[ -f "$file" ]] || continue
  TOTAL=$((TOTAL + 1))

  # Auto-detect schema type
  if jq -e '.definition_of_done' "$file" > /dev/null 2>&1; then
    SCHEMA="$TASK_SCHEMA"
    SCHEMA_TYPE="AgentTask"
  elif jq -e '.findings' "$file" > /dev/null 2>&1; then
    SCHEMA="$RESULT_SCHEMA"
    SCHEMA_TYPE="AgentResult"
  else
    echo "SKIP  $(basename "$file") — cannot detect schema type"
    FAILED=$((FAILED + 1))
    continue
  fi

  case "$VALIDATOR" in
    ajv)    validate_ajv "$file" "$SCHEMA" ;;
    python) validate_python "$file" "$SCHEMA" ;;
    jq)     validate_jq "$file" "$SCHEMA" ;;
  esac

  if [[ $? -eq 0 ]]; then
    echo "PASS  $(basename "$file") ($SCHEMA_TYPE)"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $(basename "$file") ($SCHEMA_TYPE)"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Results: ${PASSED} passed, ${FAILED} failed, ${TOTAL} total"

if [[ $TOTAL -eq 0 ]]; then
  echo "Warning: no .json files found in $RESULTS_DIR"
  exit 0
fi

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
