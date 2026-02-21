#!/usr/bin/env bash
set -euo pipefail

# score-basic-todo-run.sh
# Computes benchmark scores from explicit numeric inputs.
#
# Usage:
#   ./scripts/score-basic-todo-run.sh \
#     --passed 6 --total 7 \
#     --blocker 0 --major 1 --minor 2 --info 0 \
#     --run-tokens 12000 --baseline-tokens 15000 \
#     --run-minutes 45 --baseline-minutes 60 \
#     --run-iterations 2 --baseline-iterations 3 \
#     --schema pass --stability pass --repro pass

usage() {
  cat <<USAGE
Usage: $0 [options]

Required options:
  --passed N
  --total N
  --blocker N --major N --minor N --info N
  --run-tokens N --baseline-tokens N
  --run-minutes N --baseline-minutes N
  --run-iterations N --baseline-iterations N
  --schema pass|partial|fail
  --stability pass|partial|fail
  --repro pass|partial|fail
USAGE
  exit 1
}

# Defaults
passed=""
total=""
blocker=""
major=""
minor=""
info=""
run_tokens=""
baseline_tokens=""
run_minutes=""
baseline_minutes=""
run_iterations=""
baseline_iterations=""
schema=""
stability=""
repro=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --passed) passed="$2"; shift 2 ;;
    --total) total="$2"; shift 2 ;;
    --blocker) blocker="$2"; shift 2 ;;
    --major) major="$2"; shift 2 ;;
    --minor) minor="$2"; shift 2 ;;
    --info) info="$2"; shift 2 ;;
    --run-tokens) run_tokens="$2"; shift 2 ;;
    --baseline-tokens) baseline_tokens="$2"; shift 2 ;;
    --run-minutes) run_minutes="$2"; shift 2 ;;
    --baseline-minutes) baseline_minutes="$2"; shift 2 ;;
    --run-iterations) run_iterations="$2"; shift 2 ;;
    --baseline-iterations) baseline_iterations="$2"; shift 2 ;;
    --schema) schema="$2"; shift 2 ;;
    --stability) stability="$2"; shift 2 ;;
    --repro) repro="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

for v in passed total blocker major minor info run_tokens baseline_tokens run_minutes baseline_minutes run_iterations baseline_iterations schema stability repro; do
  if [[ -z "${!v}" ]]; then
    echo "Missing required option: $v" >&2
    usage
  fi
done

grade_to_points() {
  case "$1" in
    pass) echo 1 ;;
    partial) echo 0.5 ;;
    fail) echo 0 ;;
    *) echo "Invalid grade: $1 (use pass|partial|fail)" >&2; exit 1 ;;
  esac
}

# Quality
quality=$(awk -v p="$passed" -v t="$total" -v b="$blocker" -v m="$major" -v n="$minor" -v i="$info" '
BEGIN {
  criteria = (p / t) * 70;
  penalty = (15*b) + (8*m) + (3*n) + (1*i);
  defect = 30 - penalty;
  if (defect < 0) defect = 0;
  print criteria + defect;
}')

# Efficiency
efficiency=$(awk -v rt="$run_tokens" -v bt="$baseline_tokens" -v rm="$run_minutes" -v bm="$baseline_minutes" -v ri="$run_iterations" -v bi="$baseline_iterations" '
BEGIN {
  token = 50 * bt / rt; if (token > 50) token = 50;
  time = 30 * bm / rm; if (time > 30) time = 30;
  iter = 20 * bi / ri; if (iter > 20) iter = 20;
  print token + time + iter;
}')

schema_p=$(grade_to_points "$schema")
stability_p=$(grade_to_points "$stability")
repro_p=$(grade_to_points "$repro")

# Reliability
reliability=$(awk -v s="$schema_p" -v st="$stability_p" -v r="$repro_p" '
BEGIN {
  print (50*s) + (30*st) + (20*r);
}')

# Composite
composite=$(awk -v q="$quality" -v e="$efficiency" -v r="$reliability" '
BEGIN {
  print (0.45*q) + (0.35*e) + (0.20*r);
}')

printf "quality=%.2f\n" "$quality"
printf "efficiency=%.2f\n" "$efficiency"
printf "reliability=%.2f\n" "$reliability"
printf "composite=%.2f\n" "$composite"
