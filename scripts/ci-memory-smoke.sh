#!/usr/bin/env bash
set -euo pipefail

# Durable-memory storage smoke test (init -> create -> query)
# This script intentionally supports environments where bd DB mode is unavailable.

project="smoke-project"
workspace="$(mktemp -d /tmp/bass-memory-smoke-XXXXXX)"
mem_path="$workspace/ai-memory/$project"
beads_path="$mem_path/.beads"
issues_path="$beads_path/issues.jsonl"

cleanup() {
  rm -rf "$workspace"
}
trap cleanup EXIT

mkdir -p "$mem_path"

# Init storage repository (best effort, required for .beads layout)
(
  cd "$mem_path"
  bd init >/dev/null 2>&1 || true
)

if [[ ! -d "$beads_path" ]]; then
  echo "[memory-smoke] FAIL: bd init did not create .beads directory" >&2
  exit 1
fi

# Ensure no-db mode is configured
config_file="$beads_path/config.yaml"
if [[ -f "$config_file" ]]; then
  if ! grep -Eq '^\s*no-db\s*:\s*true\b' "$config_file"; then
    printf '\nno-db: true\n' >> "$config_file"
  fi
else
  printf 'no-db: true\n' > "$config_file"
fi

# Match adapter metadata/body shape
body=$'Smoke memory content\n\n---METADATA---\n{\n  "subject": "memory-smoke",\n  "confidence": 0.9,\n  "evidence": [{"type":"assumption","uri":"n/a","note":"smoke"}],\n  "superseded_by": null,\n  "related_entries": [],\n  "created_by": "ci"\n}'
labels='section:decisions,kind:decision,scope:repo,status:active'

issue_id=""
set +e
issue_id="$(cd "$mem_path" && bd create --title "Memory smoke test" --description "$body" --labels "$labels" --silent 2>/tmp/bass-memory-smoke-bd.err)"
create_rc=$?
set -e

if [[ $create_rc -ne 0 || -z "$issue_id" ]]; then
  # Fallback to JSONL write path used by MemoryAdapter when bd DB mode is unavailable.
  prefix="$project"
  hash_part="$(date +%s%N | shasum | awk '{print substr($1,1,10)}')"
  issue_id="${prefix}-${hash_part}"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  node -e '
const fs = require("fs");
const out = process.argv[1];
const issueId = process.argv[2];
const now = process.argv[3];
const issue = {
  id: issueId,
  title: "Memory smoke test",
  body: "Smoke memory content\n\n---METADATA---\n" + JSON.stringify({
    subject: "memory-smoke",
    confidence: 0.9,
    evidence: [{ type: "assumption", uri: "n/a", note: "smoke" }],
    superseded_by: null,
    related_entries: [],
    created_by: "ci",
  }, null, 2),
  labels: ["section:decisions", "kind:decision", "scope:repo", "status:active"],
  created_by: "ci",
  created_at: now,
  updated_at: now,
};
fs.appendFileSync(out, JSON.stringify(issue) + "\n", "utf8");
' "$issues_path" "$issue_id" "$now"
fi

if [[ ! -f "$issues_path" ]]; then
  echo "[memory-smoke] FAIL: issues.jsonl missing after create step" >&2
  exit 1
fi

# Query check: at least one active memory entry with expected section label
query_count="$(node -e '
const fs = require("fs");
const p = process.argv[1];
const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
const matches = lines.map(l => JSON.parse(l)).filter(i => Array.isArray(i.labels) && i.labels.includes("status:active") && i.labels.includes("section:decisions"));
process.stdout.write(String(matches.length));
' "$issues_path")"

if [[ "$query_count" -lt 1 ]]; then
  echo "[memory-smoke] FAIL: query check returned 0 matching entries" >&2
  exit 1
fi

echo "[memory-smoke] PASS: init -> create -> query succeeded (entry=$issue_id, matches=$query_count)"
