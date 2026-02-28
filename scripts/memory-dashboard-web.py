#!/usr/bin/env python3
"""Build a project-local dashboard from the current tracker and local durable memory."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a project-local durable-memory dashboard."
    )
    parser.add_argument(
        "--root",
        default="ai-memory",
        help="Local durable-memory root (default: ai-memory)",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root for local tracker data (default: .)",
    )
    parser.add_argument(
        "--out",
        help="Output HTML path (default: .bass-agents/dashboards/memory-dashboard.html)",
    )
    return parser.parse_args()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_labels(labels: List[str]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for label in labels:
        if ":" not in label:
            continue
        key, value = label.split(":", 1)
        if key in ("section", "kind", "scope", "status"):
            values[key] = value
    return values


def extract_metadata(body: str) -> Dict[str, Any]:
    marker = "---METADATA---"
    if marker not in body:
        return {}
    _, raw = body.split(marker, 1)
    try:
        parsed = json.loads(raw.strip())
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def load_memory_rows(memory_root: Path, project_name: str) -> List[Dict[str, Any]]:
    issues_path = memory_root / ".beads" / "issues.jsonl"
    if not issues_path.exists():
        return []

    rows: List[Dict[str, Any]] = []
    try:
        with issues_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    issue = json.loads(line)
                except json.JSONDecodeError:
                    continue
                labels = issue.get("labels", [])
                if not isinstance(labels, list):
                    labels = []
                label_map = parse_labels([str(value) for value in labels])
                metadata = extract_metadata(str(issue.get("body", "")))
                evidence = metadata.get("evidence", [])
                rows.append(
                    {
                        "project": project_name,
                        "id": str(issue.get("id", "")),
                        "summary": str(issue.get("title", "")),
                        "section": label_map.get("section", "observations"),
                        "status": label_map.get("status", "active"),
                        "kind": label_map.get("kind", "other"),
                        "scope": label_map.get("scope", "repo"),
                        "confidence": to_float(metadata.get("confidence", 0.5), 0.5),
                        "updated_at": str(issue.get("updated_at", "")),
                        "created_by": str(
                            metadata.get("created_by")
                            or issue.get("created_by")
                            or issue.get("createdBy")
                            or ""
                        ),
                        "evidence_count": len(evidence) if isinstance(evidence, list) else 0,
                    }
                )
    except OSError:
        return []

    rows.sort(key=lambda row: row.get("updated_at", ""), reverse=True)
    return rows


def run_json_command(command: List[str], cwd: Path) -> Tuple[Any, str]:
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return None, f"command not found: {command[0]}"
    except subprocess.CalledProcessError as exc:
        message = (exc.stderr or exc.stdout or "").strip() or str(exc)
        return None, message

    raw = (completed.stdout or "").strip()
    if not raw:
        return None, "empty response"

    try:
        return json.loads(raw), ""
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON: {exc}"


def load_ticket_data(project_root: Path) -> Dict[str, Any]:
    issues_data, issues_error = run_json_command(
        ["bd", "list", "--json", "--all", "--limit", "0"],
        project_root,
    )
    ready_data, ready_error = run_json_command(["bd", "ready", "--json"], project_root)

    rows: List[Dict[str, Any]] = []
    if isinstance(issues_data, list):
        for issue in issues_data:
            if not isinstance(issue, dict):
                continue
            rows.append(
                {
                    "id": str(issue.get("id", "")),
                    "title": str(issue.get("title", "")),
                    "status": str(issue.get("status", "")),
                    "priority": to_int(issue.get("priority"), 0),
                    "issue_type": str(issue.get("issue_type", "")),
                    "updated_at": str(issue.get("updated_at", "")),
                }
            )

    rows.sort(key=lambda row: row.get("updated_at", ""), reverse=True)
    ready_ids = []
    if isinstance(ready_data, list):
        ready_ids = [str(item.get("id", "")) for item in ready_data if isinstance(item, dict)]

    error_parts = [part for part in (issues_error, ready_error) if part]
    return {
        "rows": rows,
        "ready_ids": ready_ids,
        "error": " | ".join(error_parts),
    }


def build_html(
    project_name: str,
    project_root: Path,
    memory_root: Path,
    memory_rows: List[Dict[str, Any]],
    ticket_data: Dict[str, Any],
    generated_at: str,
) -> str:
    payload = json.dumps(
        {
            "project_name": project_name,
            "project_root": str(project_root),
            "memory_root": str(memory_root),
            "memory_rows": memory_rows,
            "tickets": ticket_data,
            "generated_at": generated_at,
        },
        ensure_ascii=True,
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Project Memory Dashboard</title>
  <style>
    :root {{
      --bg: #eff3ea;
      --panel: #fcfdf8;
      --ink: #15212a;
      --muted: #5e6d78;
      --line: #d4e0d6;
      --ticket: #8f2d56;
      --memory: #2c7a5b;
      --warn: #9b3d1f;
      --good: #1f7a4f;
      --mono: "IBM Plex Mono", Menlo, Consolas, monospace;
      --sans: "Instrument Sans", "Avenir Next", "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      font-family: var(--sans);
      background:
        radial-gradient(1200px 700px at 0% 0%, #efe2d8 0%, transparent 45%),
        radial-gradient(1200px 700px at 100% 0%, #d8efe0 0%, transparent 42%),
        var(--bg);
      min-height: 100vh;
    }}
    .wrap {{
      max-width: 1280px;
      margin: 24px auto 40px;
      padding: 0 16px;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 16px;
      margin-bottom: 16px;
    }}
    .title {{
      margin: 0;
      font-size: 2.2rem;
      letter-spacing: -0.03em;
    }}
    .meta {{
      color: var(--muted);
      font-size: .92rem;
      margin-top: 6px;
    }}
    .eyebrow {{
      font-size: .78rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
      margin-bottom: 6px;
    }}
    .section {{
      background: rgba(252, 253, 248, .85);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      margin-bottom: 14px;
      backdrop-filter: blur(8px);
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }}
    .card {{
      grid-column: span 3;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
    }}
    .k {{
      font-size: .78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .05em;
      margin-bottom: 8px;
    }}
    .v {{
      font-family: var(--mono);
      font-size: 1.45rem;
      font-weight: 700;
    }}
    .mono {{ font-family: var(--mono); }}
    .warning {{
      margin-bottom: 12px;
      background: #fff4e7;
      border: 1px solid #e9c5a0;
      color: #7d4a17;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: .9rem;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: .88rem;
    }}
    th, td {{
      text-align: left;
      border-bottom: 1px solid #e5ede7;
      padding: 7px 5px;
      vertical-align: top;
    }}
    th {{
      font-size: .73rem;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: .04em;
    }}
    .pill {{
      display: inline-block;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: .72rem;
      font-weight: 600;
      background: #e6f0ea;
      color: #1c5a43;
    }}
    .pill.ticket {{
      background: #f7dde5;
      color: #7e2146;
    }}
    @media (max-width: 900px) {{
      .card {{ grid-column: span 6; }}
    }}
    @media (max-width: 640px) {{
      .header {{
        flex-direction: column;
        align-items: flex-start;
      }}
      .card {{ grid-column: span 12; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="eyebrow">Project Local Dashboard</div>
        <h1 class="title">Operations + Durable Memory</h1>
        <div id="pageMeta" class="meta"></div>
      </div>
      <div class="meta mono" id="rootMeta"></div>
    </div>

    <div id="ticketWarning" class="warning" hidden></div>

    <section class="section">
      <h2>Tracker</h2>
      <div class="grid">
        <div class="card"><div class="k">Issues</div><div class="v mono" id="kTicketTotal">0</div></div>
        <div class="card"><div class="k">Open</div><div class="v mono" id="kTicketOpen">0</div></div>
        <div class="card"><div class="k">In Progress</div><div class="v mono" id="kTicketInProgress">0</div></div>
        <div class="card"><div class="k">Ready</div><div class="v mono" id="kTicketReady">0</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Updated</th><th>Status</th><th>P</th><th>Type</th><th>Title</th><th>ID</th>
          </tr>
        </thead>
        <tbody id="ticketBody"></tbody>
      </table>
    </section>

    <section class="section">
      <h2>Durable Memory</h2>
      <div class="grid">
        <div class="card"><div class="k">Entries</div><div class="v mono" id="kMemoryEntries">0</div></div>
        <div class="card"><div class="k">Active</div><div class="v mono" id="kMemoryActive">0</div></div>
        <div class="card"><div class="k">Updated Today</div><div class="v mono" id="kMemoryToday">0</div></div>
        <div class="card"><div class="k">Avg Confidence</div><div class="v mono" id="kMemoryConf">0.0</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Updated</th><th>Section</th><th>Status</th><th>Confidence</th><th>Summary</th><th>ID</th>
          </tr>
        </thead>
        <tbody id="memoryBody"></tbody>
      </table>
    </section>
  </div>

  <script>
    const DATA = {payload};
    const ticketRows = (DATA.tickets && DATA.tickets.rows) || [];
    const readyIds = new Set(((DATA.tickets && DATA.tickets.ready_ids) || []).map(String));
    const memoryRows = DATA.memory_rows || [];
    const today = String(DATA.generated_at || '').slice(0, 10);
    const escMap = {{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }};
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => escMap[ch]);
    const fmtInt = (n) => new Intl.NumberFormat().format(Number(n || 0));
    const fmt1 = (n) => Number(n || 0).toFixed(1);
    const ts = (value) => esc(String(value || '').replace('T', ' ').slice(0, 19));

    document.getElementById('pageMeta').textContent =
      `${{esc(DATA.project_name)}} | ${{fmtInt(ticketRows.length)}} tickets | ${{fmtInt(memoryRows.length)}} memory entries | generated ${{esc(DATA.generated_at)}}`;
    document.getElementById('rootMeta').textContent =
      `${{esc(DATA.project_root)}}`;

    if (DATA.tickets && DATA.tickets.error) {{
      const warning = document.getElementById('ticketWarning');
      warning.hidden = false;
      warning.textContent = `Ticket data unavailable: ${{DATA.tickets.error}}`;
    }}

    const ticketOpen = ticketRows.filter((row) => row.status !== 'closed');
    document.getElementById('kTicketTotal').textContent = fmtInt(ticketRows.length);
    document.getElementById('kTicketOpen').textContent = fmtInt(ticketOpen.length);
    document.getElementById('kTicketInProgress').textContent = fmtInt(ticketRows.filter((row) => row.status === 'in_progress').length);
    document.getElementById('kTicketReady').textContent = fmtInt(ticketRows.filter((row) => readyIds.has(String(row.id))).length);

    document.getElementById('ticketBody').innerHTML = ticketRows.slice(0, 20).map((row) => `
      <tr>
        <td class="mono">${{ts(row.updated_at)}}</td>
        <td><span class="pill ticket">${{esc(row.status)}}</span></td>
        <td class="mono">${{esc(row.priority)}}</td>
        <td>${{esc(row.issue_type)}}</td>
        <td>${{esc(row.title)}}</td>
        <td class="mono">${{esc(row.id)}}</td>
      </tr>
    `).join('');

    const activeMemory = memoryRows.filter((row) => row.status === 'active');
    const averageConfidence = memoryRows.length
      ? memoryRows.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / memoryRows.length
      : 0;
    document.getElementById('kMemoryEntries').textContent = fmtInt(memoryRows.length);
    document.getElementById('kMemoryActive').textContent = fmtInt(activeMemory.length);
    document.getElementById('kMemoryToday').textContent = fmtInt(memoryRows.filter((row) => String(row.updated_at || '').slice(0, 10) === today).length);
    document.getElementById('kMemoryConf').textContent = fmt1(averageConfidence);

    document.getElementById('memoryBody').innerHTML = memoryRows.slice(0, 30).map((row) => `
      <tr>
        <td class="mono">${{ts(row.updated_at)}}</td>
        <td>${{esc(row.section)}}</td>
        <td><span class="pill">${{esc(row.status)}}</span></td>
        <td class="mono">${{fmt1(row.confidence)}}</td>
        <td>${{esc(row.summary)}}</td>
        <td class="mono">${{esc(row.id)}}</td>
      </tr>
    `).join('');
  </script>
</body>
</html>"""


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    memory_root = Path(args.root).resolve()
    project_name = project_root.name
    output_path = (
        Path(args.out).resolve()
        if args.out
        else project_root / ".bass-agents" / "dashboards" / "memory-dashboard.html"
    )

    memory_rows = load_memory_rows(memory_root, project_name)
    ticket_data = load_ticket_data(project_root)
    generated_at = datetime.now(timezone.utc).isoformat()
    html = build_html(
        project_name,
        project_root,
        memory_root,
        memory_rows,
        ticket_data,
        generated_at,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
