#!/usr/bin/env bash
set -euo pipefail

# generate-skeletons.sh — Generate 7-step AgentResult skeleton files from an AgentTask JSON.
# Usage: ./scripts/generate-skeletons.sh <agent-task.json> [output-dir]

AGENTS=("pm" "gameplay-expert" "designer" "qa-adversary" "coding-agent" "evaluator" "metaagent")

usage() {
  echo "Usage: $0 <agent-task.json> [output-dir]"
  echo ""
  echo "Generates 7 skeleton AgentResult files and a next-task-seed.json"
  echo "from the given AgentTask JSON input."
  echo ""
  echo "  agent-task.json  Path to an AgentTask JSON file"
  echo "  output-dir       Output directory (default: agent-results/)"
  exit 1
}

if [[ $# -lt 1 ]]; then
  usage
fi

TASK_FILE="$1"

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Error: file not found: $TASK_FILE" >&2
  exit 1
fi

# Require jq
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

# Extract fields from the AgentTask
TASK_ID=$(jq -r '.task_id' "$TASK_FILE")
PROJECT_NAME=$(jq -r '.project.name' "$TASK_FILE")
GOAL=$(jq -r '.goal' "$TASK_FILE")

if [[ "$TASK_ID" == "null" || -z "$TASK_ID" ]]; then
  echo "Error: task_id not found in $TASK_FILE" >&2
  exit 1
fi

if [[ "$PROJECT_NAME" == "null" || -z "$PROJECT_NAME" ]]; then
  echo "Error: project.name not found in $TASK_FILE" >&2
  exit 1
fi

OUTPUT_DIR="${2:-agent-results}"
mkdir -p "$OUTPUT_DIR"

echo "Generating skeletons for task '$TASK_ID' (project: $PROJECT_NAME)"
echo "Output directory: $OUTPUT_DIR"

# Generate one skeleton per pipeline step
for i in "${!AGENTS[@]}"; do
  STEP=$((i + 1))
  AGENT="${AGENTS[$i]}"
  FILENAME="step-${STEP}-${AGENT}.result.json"

  jq -n \
    --arg task_id "$TASK_ID" \
    --arg summary "Pending — ${AGENT} has not run yet." \
    '{
      task_id: $task_id,
      status: "pending",
      summary: $summary,
      findings: [],
      next_actions: [],
      artifacts_produced: []
    }' > "${OUTPUT_DIR}/${FILENAME}"

  echo "  Created ${FILENAME}"
done

# Generate next-task-seed.json for iteration handoff
jq -n \
  --arg task_id "${TASK_ID}-next" \
  --arg project_name "$PROJECT_NAME" \
  --arg goal "Follow-up iteration for: ${GOAL}" \
  --arg prior_task "$TASK_ID" \
  '{
    task_id: $task_id,
    project: {
      name: $project_name
    },
    goal: $goal,
    context: {
      user_notes: [
        ("Prior prototype task: " + $prior_task + " — refine based on evaluator scorecard.")
      ],
      known_issues: [],
      artifacts: {
        screenshots: [],
        logs: [],
        test_results: []
      }
    },
    definition_of_done: [
      "Address top-priority findings from prior evaluator scorecard.",
      "All prior passing acceptance criteria remain passing (no regressions)."
    ]
  }' > "${OUTPUT_DIR}/next-task-seed.json"

echo "  Created next-task-seed.json"
echo "Done. ${#AGENTS[@]} skeletons + 1 seed generated in ${OUTPUT_DIR}/"
