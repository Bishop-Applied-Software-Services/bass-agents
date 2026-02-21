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
  --session-path PATH          JSON/JSONL artifact path to analyze after run.
  --source auto|codex|claude   Source passed to review-session.py (default: auto).
  --format json|markdown       Review output format (default: markdown).
  --report-out PATH            Write review output to this path.
  --max-tokens N               Budget: max tokens.
  --max-cost-usd N             Budget: max cost.
  --timebox-minutes N          Budget: timebox in minutes.
  --log-dir DIR                Where wrapper run logs are stored.
  --allow-stale-artifact       Allow fallback to older artifacts when no fresh artifact exists.

Examples:
  $0 --tool codex -- --model gpt-5
  $0 --tool claude --session-path ./session.json --format markdown --report-out ./review.md --
USAGE
  exit 0
}

tool=""
session_path=""
source="auto"
format="markdown"
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
    --source) source="$2"; shift 2 ;;
    --format) format="$2"; shift 2 ;;
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
  allow_fallback="$allow_stale_artifact"
  if [[ "$tool_exit" -ne 0 ]]; then
    allow_fallback="0"
  fi
  discovered="$(discover_session_path "$tool" "$start_epoch" "$allow_fallback")"
  if [[ -n "${discovered:-}" ]]; then
    session_path="$discovered"
    echo "[bass-agents] auto-discovered session artifact: $session_path"
  else
    echo "[bass-agents] no --session-path and no auto-discovered artifact; skipping auto review"
    echo "[bass-agents] tip: pass --allow-stale-artifact if you intentionally want to analyze an older artifact"
    echo "[bass-agents] tip: set BASS_AGENTS_SESSION_DIRS for custom search roots"
    exit "$tool_exit"
  fi
fi

effective_source="$source"
if [[ "$effective_source" == "auto" ]]; then
  effective_source="$tool"
fi
review_cmd=("$repo_root/scripts/review-session.py" --path "$session_path" --source "$effective_source" --format "$format" --elapsed-minutes "$elapsed_minutes")

if [[ -n "$report_out" ]]; then
  review_cmd+=(--out "$report_out")
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
