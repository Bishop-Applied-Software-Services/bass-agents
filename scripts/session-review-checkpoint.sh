#!/usr/bin/env bash
set -euo pipefail

# session-review-checkpoint.sh
# Runs review-session.py and appends a compact trend row.

usage() {
  cat <<USAGE
Usage:
  $0 --source codex|claude [options]

Required:
  --source codex|claude

Optional:
  --project NAME               Project slug for output paths (default: basename of CWD)
  --session-id ID              Explicit provider session id (otherwise auto reference id is generated)
  --report-out PATH            Override report output JSON path
  --trend-file PATH            Override trend CSV path
  --max-tokens N               Budget: max tokens
  --max-cost-usd N             Budget: max cost
  --timebox-minutes N          Budget: timebox minutes
  --elapsed-minutes N          Observed elapsed minutes

Example:
  $0 --source codex --project bass.ai --session-id 019c864b-0a2e-7dd2-be82-c2967b70bf10
USAGE
  exit 1
}

source_tool=""
project="${BASS_AGENTS_PROJECT:-}"
session_id=""
report_out=""
trend_file=""
max_tokens=""
max_cost_usd=""
timebox_minutes=""
elapsed_minutes=""

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

normalize_slug() {
  local raw="$1"
  local out=""
  out="$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
  out="${out#-}"
  out="${out%-}"
  if [[ -z "$out" ]]; then
    out="unknown-project"
  fi
  printf "%s" "$out"
}

normalize_session_id() {
  local raw="$1"
  local out=""
  out="$(printf "%s" "$raw" | tr -cs 'a-zA-Z0-9._-' '-')"
  out="${out#-}"
  out="${out%-}"
  printf "%s" "$out"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) source_tool="$2"; shift 2 ;;
    --project) project="$2"; shift 2 ;;
    --session-id) session_id="$2"; shift 2 ;;
    --report-out) report_out="$2"; shift 2 ;;
    --trend-file) trend_file="$2"; shift 2 ;;
    --max-tokens) max_tokens="$2"; shift 2 ;;
    --max-cost-usd) max_cost_usd="$2"; shift 2 ;;
    --timebox-minutes) timebox_minutes="$2"; shift 2 ;;
    --elapsed-minutes) elapsed_minutes="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

if [[ -z "$source_tool" ]]; then
  echo "Error: --source is required" >&2
  usage
fi
if [[ "$source_tool" != "codex" && "$source_tool" != "claude" ]]; then
  echo "Error: --source must be codex or claude" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for checkpoint extraction" >&2
  exit 1
fi

session_ref_id="$session_id"
if [[ -z "$session_ref_id" ]]; then
  session_ref_id="auto-$(date +%Y%m%d-%H%M%S)-$RANDOM"
fi

if [[ -z "$project" ]]; then
  project="$(basename "$PWD")"
fi
project_slug="$(normalize_slug "$project")"
timestamp="$(date +%Y%m%d-%H%M%S)"
report_date="$(date +%Y-%m-%d)"
session_suffix=""
normalized_session_id="$(normalize_session_id "$session_ref_id")"
if [[ -n "$normalized_session_id" ]]; then
  session_suffix="-$normalized_session_id"
fi

if [[ -z "$report_out" ]]; then
  report_out="$repo_root/session-reviews/$project_slug/${report_date}-${source_tool}-session-review-${timestamp#*-}${session_suffix}.json"
fi
if [[ -z "$trend_file" ]]; then
  trend_file="$repo_root/session-reviews/$project_slug/trend.csv"
fi

mkdir -p "$(dirname "$report_out")"
mkdir -p "$(dirname "$trend_file")"

review_cmd=("$repo_root/scripts/review-session.py" --source "$source_tool" --path "$PWD" --project-root "$PWD" --format json --out "$report_out")
review_cmd+=(--session-reference-id "$session_ref_id")
if [[ -n "$session_id" ]]; then
  review_cmd+=(--session-id "$session_id")
fi
if [[ -n "$max_tokens" ]]; then
  review_cmd+=(--max-tokens "$max_tokens")
fi
if [[ -n "$max_cost_usd" ]]; then
  review_cmd+=(--max-cost-usd "$max_cost_usd")
fi
if [[ -n "$timebox_minutes" ]]; then
  review_cmd+=(--timebox-minutes "$timebox_minutes")
fi
if [[ -n "$elapsed_minutes" ]]; then
  review_cmd+=(--elapsed-minutes "$elapsed_minutes")
fi

echo "[checkpoint] generating review: $report_out"
echo "[checkpoint] session reference id: $session_ref_id"
"${review_cmd[@]}"

new_header="date,project,source,session_reference_id,session_id,total_tokens,input_tokens,output_tokens,tool_calls,retry_loops,efficiency,reliability,composite,estimated_cost_usd,report_path"
old_header="date,project,source,session_id,total_tokens,input_tokens,output_tokens,tool_calls,retry_loops,efficiency,reliability,composite,estimated_cost_usd,report_path"

if [[ ! -f "$trend_file" ]]; then
  echo "$new_header" > "$trend_file"
else
  current_header="$(head -n 1 "$trend_file")"
  if [[ "$current_header" == "$old_header" ]]; then
    tmp_migrated="$(mktemp)"
    {
      echo "$new_header"
      # Insert empty session_reference_id after the first three CSV fields.
      sed -n '2,$p' "$trend_file" | sed -E 's/^((\"[^\"]*\",){3})(\"[^\"]*\",)/\1"",\3/'
    } > "$tmp_migrated"
    mv "$tmp_migrated" "$trend_file"
  fi
fi

today="$(date +%F)"
report_session_ref_id="$(jq -r '.session_reference_id // empty' "$report_out")"
if [[ -z "$report_session_ref_id" || "$report_session_ref_id" == "null" ]]; then
  report_session_ref_id="$session_ref_id"
fi
resolved_session_id="$(jq -r '.raw_sources.agtrace.content.header.session_id // empty' "$report_out")"
if [[ -z "$resolved_session_id" || "$resolved_session_id" == "null" ]]; then
  resolved_session_id="$session_ref_id"
fi

row="$(
  jq -r --arg date "$today" --arg project "$project_slug" --arg source "$source_tool" --arg session_reference_id "$report_session_ref_id" --arg session_id "$resolved_session_id" --arg report_path "$report_out" '
    [
      $date,
      $project,
      $source,
      $session_reference_id,
      $session_id,
      (.summary.total_tokens // 0),
      (.summary.input_tokens // 0),
      (.summary.output_tokens // 0),
      (.summary.tool_calls // 0),
      (.summary.retry_loops // 0),
      (.scores.efficiency // 0),
      (.scores.reliability // 0),
      (.scores.composite // 0),
      (.summary.estimated_cost_usd // 0),
      $report_path
    ] | @csv
  ' "$report_out"
)"
echo "$row" >> "$trend_file"

echo "[checkpoint] trend updated: $trend_file"
echo "[checkpoint] latest row:"
tail -n 1 "$trend_file"
