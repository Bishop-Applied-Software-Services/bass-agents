#!/usr/bin/env bash
set -euo pipefail

# run-with-bass-agents.sh
# Thin wrapper that launches codex/claude, captures terminal log, then runs review-session.py.

usage() {
  cat <<USAGE
Usage:
  $0 --tool codex|claude [options] -- [tool args...]

Required:
  --tool codex|claude          Tool CLI to execute.

Optional:
  --session-path PATH          Optional path hint for review-session.py.
  --session-id ID              Explicit provider session id for review-session.py.
  --source auto|codex|claude   Source passed to review-session.py (default: auto).
  --format json|markdown       Review output format (default: markdown).
  --project NAME               Project slug for default report path.
  --report-out PATH            Write review output to this path.
  --max-tokens N               Budget: max tokens.
  --max-cost-usd N             Budget: max cost.
  --timebox-minutes N          Budget: timebox in minutes.
  --log-dir DIR                Where wrapper run logs are stored.
  --allow-stale-artifact       Deprecated (session-id is now required).

Examples:
  $0 --tool codex -- --model gpt-5
  $0 --tool claude --session-path ./session.json --format markdown --report-out ./review.md --
USAGE
  exit 0
}

tool=""
session_path=""
session_id=""
source="auto"
format="markdown"
project=""
report_out=""
max_tokens=""
max_cost_usd=""
timebox_minutes=""
allow_stale_artifact="0"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
log_dir="$repo_root/fixtures/results/session-logs"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool) tool="$2"; shift 2 ;;
    --session-path) session_path="$2"; shift 2 ;;
    --session-id) session_id="$2"; shift 2 ;;
    --source) source="$2"; shift 2 ;;
    --format) format="$2"; shift 2 ;;
    --project) project="$2"; shift 2 ;;
    --report-out) report_out="$2"; shift 2 ;;
    --max-tokens) max_tokens="$2"; shift 2 ;;
    --max-cost-usd) max_cost_usd="$2"; shift 2 ;;
    --timebox-minutes) timebox_minutes="$2"; shift 2 ;;
    --log-dir) log_dir="$2"; shift 2 ;;
    --allow-stale-artifact) allow_stale_artifact="1"; shift ;;
    --) shift; break ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

if [[ -z "$tool" ]]; then
  echo "Error: --tool is required" >&2
  usage
fi

if [[ "$tool" != "codex" && "$tool" != "claude" ]]; then
  echo "Error: --tool must be codex or claude" >&2
  exit 1
fi

if ! command -v "$tool" >/dev/null 2>&1; then
  echo "Error: CLI not found in PATH: $tool" >&2
  exit 1
fi

session_ref_id="$session_id"
if [[ -z "$session_ref_id" ]]; then
  session_ref_id="auto-$(date +%Y%m%d-%H%M%S)-$RANDOM"
fi

mkdir -p "$log_dir"
timestamp="$(date +%Y%m%d-%H%M%S)"
run_log="$log_dir/${timestamp}-${tool}.log"

start_epoch="$(date +%s)"

file_mtime_epoch() {
  local f="$1"
  local mtime=""
  mtime="$(stat -f %m "$f" 2>/dev/null || true)"
  if [[ -z "$mtime" ]]; then
    mtime="$(stat -c %Y "$f" 2>/dev/null || true)"
  fi
  if [[ -n "$mtime" ]]; then
    printf "%s" "$mtime"
  fi
}

normalize_project_slug() {
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

discover_session_path() {
  local tool_name="$1"
  local start_ts="$2"
  local allow_fallback="${3:-0}"
  local dirs_csv="${BASS_AGENTS_SESSION_DIRS:-}"
  local dirs=()
  local best_path=""
  local best_mtime=0
  local fallback_path=""
  local fallback_mtime=0

  if [[ -n "$dirs_csv" ]]; then
    IFS=":" read -r -a dirs <<<"$dirs_csv"
  else
    if [[ "$tool_name" == "codex" ]]; then
      dirs=("$HOME/.codex" "$HOME/.config/codex" "$HOME/.local/share/codex")
    else
      dirs=("$HOME/.claude" "$HOME/.config/claude" "$HOME/.local/share/claude")
    fi
  fi

  for d in "${dirs[@]}"; do
    [[ -d "$d" ]] || continue
    while IFS= read -r f; do
      [[ -f "$f" ]] || continue
      local mtime
      mtime="$(file_mtime_epoch "$f")"
      [[ -n "$mtime" ]] || continue
      # Prefer artifacts written during/after this run.
      if (( mtime < start_ts - 10 )); then
        if (( mtime > fallback_mtime )); then
          fallback_mtime="$mtime"
          fallback_path="$f"
        fi
        continue
      fi
      if (( mtime > best_mtime )); then
        best_mtime="$mtime"
        best_path="$f"
      fi
    done < <(find "$d" -type f \( -name "*.json" -o -name "*.jsonl" \) 2>/dev/null)
  done

  if [[ -n "$best_path" ]]; then
    printf "%s" "$best_path"
    return
  fi
  if [[ "$allow_fallback" == "1" && -n "$fallback_path" ]]; then
    printf "%s" "$fallback_path"
  fi
}

# Expose canonical instructions path for future tool integrations.
export BASS_AGENTS_INSTRUCTIONS_PATH="$repo_root/CLAUDE.md"

echo "[bass-agents] launching: $tool $*"
echo "[bass-agents] run log: $run_log"
echo "[bass-agents] session reference id: $session_ref_id"

tool_exit=0
if [[ -t 0 && -t 1 ]]; then
  if command -v script >/dev/null 2>&1; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      script -q "$run_log" "$tool" "$@" || tool_exit=$?
    else
      cmd_quoted="$(printf '%q ' "$tool" "$@")"
      script -q -e -c "$cmd_quoted" "$run_log" || tool_exit=$?
    fi
  else
    "$tool" "$@" || tool_exit=$?
  fi
else
  {
    "$tool" "$@"
  } 2>&1 | tee "$run_log" || tool_exit=$?
fi

end_epoch="$(date +%s)"
elapsed_minutes=$(awk -v s="$start_epoch" -v e="$end_epoch" 'BEGIN { printf "%.2f", (e - s) / 60.0 }')

echo "[bass-agents] tool exit code: $tool_exit"
echo "[bass-agents] elapsed minutes: $elapsed_minutes"

if [[ -z "$session_path" ]]; then
  # review-session.py resolves session via --session-id; this is only a compatibility hint.
  session_path="$repo_root"
fi

effective_source="$source"
if [[ "$effective_source" == "auto" ]]; then
  effective_source="$tool"
fi
if [[ -z "$report_out" ]]; then
  inferred_project="${project:-${BASS_AGENTS_PROJECT:-$(basename "$PWD")}}"
  project_slug="$(normalize_project_slug "$inferred_project")"
  report_date="$(date +%Y-%m-%d)"
  report_time="${timestamp#*-}"
  session_suffix=""
  if [[ -n "$session_ref_id" ]]; then
    normalized_session_id="$(normalize_session_id "$session_ref_id")"
    if [[ -n "$normalized_session_id" ]]; then
      session_suffix="-$normalized_session_id"
    fi
  fi
  report_ext="md"
  if [[ "$format" == "json" ]]; then
    report_ext="json"
  fi
  report_out="$repo_root/session-reviews/$project_slug/${report_date}-${tool}-session-review-${report_time}${session_suffix}.${report_ext}"
fi

mkdir -p "$(dirname "$report_out")"
echo "[bass-agents] review report: $report_out"

review_cmd=("$repo_root/scripts/review-session.py" --path "$session_path" --source "$effective_source" --format "$format" --elapsed-minutes "$elapsed_minutes" --out "$report_out")
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

echo "[bass-agents] running session review..."
"${review_cmd[@]}" || {
  echo "[bass-agents] review failed; tool exit code preserved: $tool_exit" >&2
  exit "$tool_exit"
}

exit "$tool_exit"
