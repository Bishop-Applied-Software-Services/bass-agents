#!/usr/bin/env python3
"""Build a static workspace dashboard from Beads tickets and ai-memory entries."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a workspace dashboard HTML file."
    )
    parser.add_argument(
        "--root",
        default="ai-memory",
        help="Memory root directory (default: ai-memory)",
    )
    parser.add_argument(
        "--out",
        help="Output HTML path (default: <root>/dashboard.html)",
    )
    parser.add_argument(
        "--project",
        help="Optional durable-memory project filter (default: all projects)",
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
    out: Dict[str, str] = {}
    for label in labels:
        if ":" not in label:
            continue
        key, value = label.split(":", 1)
        if key in ("section", "kind", "scope", "status"):
            out[key] = value
    return out


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


def load_memory_rows(root: Path, project_filter: str | None = None) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for project_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if project_filter and project_dir.name != project_filter:
            continue
        issues_path = project_dir / ".beads" / "issues.jsonl"
        if not issues_path.exists():
            continue
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
                    label_map = parse_labels([str(x) for x in labels])
                    metadata = extract_metadata(str(issue.get("body", "")))
                    evidence = metadata.get("evidence", [])
                    rows.append(
                        {
                            "project": project_dir.name,
                            "id": str(issue.get("id", "")),
                            "summary": str(issue.get("title", "")),
                            "section": label_map.get("section", "observations"),
                            "status": label_map.get("status", "active"),
                            "kind": label_map.get("kind", "other"),
                            "scope": label_map.get("scope", "repo"),
                            "confidence": to_float(metadata.get("confidence", 0.5), 0.5),
                            "created_at": str(issue.get("created_at", "")),
                            "updated_at": str(issue.get("updated_at", "")),
                            "created_by": str(
                                metadata.get("created_by")
                                or issue.get("created_by")
                                or issue.get("createdBy")
                                or ""
                            ),
                            "evidence_count": len(evidence)
                            if isinstance(evidence, list)
                            else 0,
                        }
                    )
        except OSError:
            continue
    rows.sort(key=lambda row: row.get("updated_at", ""), reverse=True)
    return rows


def run_json_command(cmd: List[str], cwd: Path) -> Tuple[Any, str]:
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd),
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return None, f"command not found: {cmd[0]}"
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


def load_ticket_data(workspace_root: Path) -> Dict[str, Any]:
    issues_data, issues_error = run_json_command(
        ["bd", "list", "--json", "--all", "--limit", "0"],
        workspace_root,
    )
    ready_data, ready_error = run_json_command(
        ["bd", "ready", "--json"],
        workspace_root,
    )

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
                    "created_at": str(issue.get("created_at", "")),
                    "updated_at": str(issue.get("updated_at", "")),
                    "created_by": str(issue.get("created_by", "")),
                    "dependency_count": to_int(issue.get("dependency_count"), 0),
                    "dependent_count": to_int(issue.get("dependent_count"), 0),
                    "comment_count": to_int(issue.get("comment_count"), 0),
                }
            )
    rows.sort(key=lambda row: row.get("updated_at", ""), reverse=True)

    ready_ids: List[str] = []
    if isinstance(ready_data, list):
        ready_ids = [str(item.get("id", "")) for item in ready_data if isinstance(item, dict)]

    error_parts = [part for part in (issues_error, ready_error) if part]
    return {
        "rows": rows,
        "ready_ids": ready_ids,
        "error": " | ".join(error_parts),
    }


def build_html(memory_rows: List[Dict[str, Any]], ticket_data: Dict[str, Any], generated_at: str) -> str:
    payload = json.dumps(
        {
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
  <title>Workspace Dashboard</title>
  <style>
    :root {{
      --bg: #eff3ea;
      --panel: #fcfdf8;
      --ink: #15212a;
      --muted: #5e6d78;
      --line: #d4e0d6;
      --ticket: #8f2d56;
      --ticket-soft: #b84f6f;
      --memory: #2c7a5b;
      --memory-soft: #156f80;
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
    .stack {{
      display: grid;
      gap: 14px;
    }}
    .section {{
      background: rgba(252, 253, 248, .82);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      backdrop-filter: blur(8px);
    }}
    .section-head {{
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 12px;
      margin-bottom: 12px;
    }}
    .section-head h2 {{
      margin: 0;
      font-size: 1.2rem;
      letter-spacing: -0.02em;
    }}
    .controls {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }}
    .controls label {{
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--muted);
      font-size: .8rem;
    }}
    select, input {{
      font: inherit;
      border: 1px solid #c2d2c6;
      border-radius: 8px;
      padding: 7px 9px;
      min-width: 140px;
      background: #fff;
    }}
    .check {{
      flex-direction: row !important;
      align-items: center;
      gap: 8px !important;
      padding-top: 22px;
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
    .v.good {{ color: var(--good); }}
    .v.warn {{ color: var(--warn); }}
    .panels {{
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
    }}
    .panel h3 {{
      margin: 0 0 10px;
      font-size: 1rem;
    }}
    .bars {{ display: grid; gap: 8px; }}
    .bar-row {{
      display: grid;
      grid-template-columns: 150px 1fr 70px;
      gap: 8px;
      align-items: center;
      font-size: .9rem;
    }}
    .bar-track {{
      background: #e8efe9;
      border-radius: 999px;
      height: 12px;
      overflow: hidden;
    }}
    .bar-fill {{
      height: 100%;
      width: 0;
    }}
    .bar-fill.ticket {{
      background: linear-gradient(90deg, var(--ticket), var(--ticket-soft));
    }}
    .bar-fill.memory {{
      background: linear-gradient(90deg, var(--memory), var(--memory-soft));
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
    .mono {{ font-family: var(--mono); }}
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
    .warning {{
      margin-bottom: 12px;
      background: #fff4e7;
      border: 1px solid #e9c5a0;
      color: #7d4a17;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: .9rem;
    }}
    .hint {{
      color: var(--muted);
      font-size: .84rem;
    }}
    @media (max-width: 1000px) {{
      .card {{ grid-column: span 6; }}
      .panels {{ grid-template-columns: 1fr; }}
      .bar-row {{ grid-template-columns: 110px 1fr 58px; }}
    }}
    @media (max-width: 640px) {{
      .header, .section-head {{
        flex-direction: column;
        align-items: flex-start;
      }}
      .card {{ grid-column: span 12; }}
      .controls label {{ width: 100%; }}
      select, input {{ width: 100%; }}
      .check {{ padding-top: 0; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="eyebrow">Operations + Knowledge</div>
        <h1 class="title">Workspace Dashboard</h1>
        <div id="pageMeta" class="meta"></div>
      </div>
      <div class="hint">Top-level Beads tickets plus durable memory from <span class="mono">ai-memory/</span>.</div>
    </div>

    <div id="ticketWarning" class="warning" hidden></div>

    <div class="stack">
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Beads Tickets</h2>
            <div id="ticketMeta" class="meta"></div>
          </div>
          <div class="hint">Loaded from the repo's top-level <span class="mono">bd</span> tracker.</div>
        </div>

        <div class="controls">
          <label>Status <select id="ticketStatusFilter"><option value="all">all</option></select></label>
          <label>Type <select id="ticketTypeFilter"><option value="all">all</option></select></label>
          <label>Priority <select id="ticketPriorityFilter"><option value="all">all</option></select></label>
          <label class="check"><input id="ticketReadyOnly" type="checkbox" /> Ready only</label>
        </div>

        <div class="grid">
          <div class="card"><div class="k">Issues</div><div class="v mono" id="kTicketTotal">0</div></div>
          <div class="card"><div class="k">Open</div><div class="v mono" id="kTicketOpen">0</div></div>
          <div class="card"><div class="k">In Progress</div><div class="v mono" id="kTicketInProgress">0</div></div>
          <div class="card"><div class="k">Ready</div><div class="v mono" id="kTicketReady">0</div></div>
        </div>

        <div class="panels">
          <div class="panel">
            <h3>Issues by Status</h3>
            <div id="ticketBars" class="bars"></div>
          </div>
          <div class="panel">
            <h3>Ready Work</h3>
            <table>
              <thead>
                <tr>
                  <th>Updated</th><th>P</th><th>Type</th><th>Title</th><th>ID</th>
                </tr>
              </thead>
              <tbody id="ticketReadyBody"></tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h3>Recently Updated Tickets</h3>
          <table>
            <thead>
              <tr>
                <th>Updated</th><th>Status</th><th>P</th><th>Type</th><th>Title</th><th>ID</th>
              </tr>
            </thead>
            <tbody id="ticketBody"></tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <h2>Durable Memory</h2>
            <div id="memoryMeta" class="meta"></div>
          </div>
          <div class="hint">Loaded from <span class="mono">ai-memory/&lt;project&gt;/.beads/issues.jsonl</span>.</div>
        </div>

        <div class="controls">
          <label>Project <select id="memoryProjectFilter"></select></label>
          <label>Status <select id="memoryStatusFilter"><option value="all">all</option></select></label>
          <label>Section <select id="memorySectionFilter"><option value="all">all</option></select></label>
          <label>Min confidence <input id="memoryMinConfidence" type="number" min="0" max="1" step="0.1" value="0" /></label>
        </div>

        <div class="grid">
          <div class="card"><div class="k">Entries</div><div class="v mono" id="kMemoryEntries">0</div></div>
          <div class="card"><div class="k">Active</div><div class="v mono" id="kMemoryActive">0</div></div>
          <div class="card"><div class="k">Updated Today</div><div class="v mono" id="kMemoryToday">0</div></div>
          <div class="card"><div class="k">Avg Confidence</div><div class="v mono" id="kMemoryConf">0.0</div></div>
        </div>

        <div class="panels">
          <div class="panel">
            <h3>Entries by Section</h3>
            <div id="memoryBars" class="bars"></div>
          </div>
          <div class="panel">
            <h3>Recent Memory Entries</h3>
            <table>
              <thead>
                <tr>
                  <th>Updated</th><th>Project</th><th>Section</th><th>Status</th><th>Confidence</th><th>ID</th>
                </tr>
              </thead>
              <tbody id="memoryBody"></tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h3>Memory Details</h3>
          <table>
            <thead>
              <tr>
                <th>Updated</th><th>Project</th><th>Section</th><th>Status</th><th>Confidence</th><th>Summary</th><th>ID</th>
              </tr>
            </thead>
            <tbody id="memoryDetailBody"></tbody>
          </table>
        </div>
      </section>
    </div>
  </div>

  <script>
    const DATA = {payload};
    const ticketRows = (DATA.tickets && DATA.tickets.rows) || [];
    const readyIds = new Set(((DATA.tickets && DATA.tickets.ready_ids) || []).map(String));
    const memoryRows = DATA.memory_rows || [];
    const generatedAt = String(DATA.generated_at || '');
    const today = generatedAt.slice(0, 10);

    const escMap = {{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }};
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => escMap[ch]);
    const fmtInt = (n) => new Intl.NumberFormat().format(Number(n || 0));
    const fmt1 = (n) => Number(n || 0).toFixed(1);
    const fmtPriority = (value) => value === '' || value === null || value === undefined ? '' : `P${{value}}`;
    const ts = (value) => esc(String(value || '').replace('T', ' ').slice(0, 19));

    document.getElementById('pageMeta').textContent =
      `${{fmtInt(ticketRows.length)}} tickets | ${{fmtInt(memoryRows.length)}} durable-memory entries | generated ${{generatedAt}}`;

    const ticketWarning = document.getElementById('ticketWarning');
    if (DATA.tickets && DATA.tickets.error) {{
      ticketWarning.hidden = false;
      ticketWarning.textContent = `Ticket data unavailable: ${{DATA.tickets.error}}`;
    }}

    const ticketStatusFilter = document.getElementById('ticketStatusFilter');
    const ticketTypeFilter = document.getElementById('ticketTypeFilter');
    const ticketPriorityFilter = document.getElementById('ticketPriorityFilter');
    const ticketReadyOnly = document.getElementById('ticketReadyOnly');

    const memoryProjectFilter = document.getElementById('memoryProjectFilter');
    const memoryStatusFilter = document.getElementById('memoryStatusFilter');
    const memorySectionFilter = document.getElementById('memorySectionFilter');
    const memoryMinConfidence = document.getElementById('memoryMinConfidence');

    const ticketStatuses = ['all', ...Array.from(new Set(ticketRows.map(r => r.status).filter(Boolean))).sort()];
    const ticketTypes = ['all', ...Array.from(new Set(ticketRows.map(r => r.issue_type).filter(Boolean))).sort()];
    const ticketPriorities = ['all', ...Array.from(new Set(ticketRows.map(r => String(r.priority)).filter(Boolean))).sort((a, b) => Number(a) - Number(b))];
    const memoryProjects = ['all', ...Array.from(new Set(memoryRows.map(r => r.project).filter(Boolean))).sort()];
    const memoryStatuses = Array.from(new Set(memoryRows.map(r => r.status).filter(Boolean))).sort();
    const memorySections = Array.from(new Set(memoryRows.map(r => r.section).filter(Boolean))).sort();

    function fillSelect(node, values) {{
      for (const value of values) {{
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        node.appendChild(opt);
      }}
    }}

    fillSelect(ticketStatusFilter, ticketStatuses);
    fillSelect(ticketTypeFilter, ticketTypes);
    fillSelect(ticketPriorityFilter, ticketPriorities);
    fillSelect(memoryProjectFilter, memoryProjects);
    fillSelect(memoryStatusFilter, ['all', ...memoryStatuses]);
    fillSelect(memorySectionFilter, ['all', ...memorySections]);

    function pickTicketRows() {{
      const status = ticketStatusFilter.value;
      const issueType = ticketTypeFilter.value;
      const priority = ticketPriorityFilter.value;
      return ticketRows.filter((row) =>
        (status === 'all' || row.status === status) &&
        (issueType === 'all' || row.issue_type === issueType) &&
        (priority === 'all' || String(row.priority) === priority) &&
        (!ticketReadyOnly.checked || readyIds.has(String(row.id || '')))
      );
    }}

    function pickMemoryRows() {{
      const project = memoryProjectFilter.value;
      const status = memoryStatusFilter.value;
      const section = memorySectionFilter.value;
      const minConfidence = Number(memoryMinConfidence.value || 0);
      return memoryRows.filter((row) =>
        (project === 'all' || row.project === project) &&
        (status === 'all' || row.status === status) &&
        (section === 'all' || row.section === section) &&
        Number(row.confidence || 0) >= minConfidence
      );
    }}

    function renderBars(rootId, entries, tone) {{
      const root = document.getElementById(rootId);
      root.innerHTML = '';
      const max = Math.max(1, ...entries.map((entry) => entry[1]));
      for (const [label, count] of entries) {{
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <div class="mono">${{esc(label)}}</div>
          <div class="bar-track"><div class="bar-fill ${{tone}}" style="width:${{(count / max) * 100}}%"></div></div>
          <div class="mono">${{fmtInt(count)}}</div>
        `;
        root.appendChild(row);
      }}
    }}

    function renderTickets() {{
      const selected = pickTicketRows();
      const openCount = selected.filter((row) => row.status === 'open').length;
      const inProgressCount = selected.filter((row) => row.status === 'in_progress').length;
      const readyCount = selected.filter((row) => readyIds.has(String(row.id || ''))).length;

      document.getElementById('kTicketTotal').textContent = fmtInt(selected.length);
      document.getElementById('kTicketOpen').textContent = fmtInt(openCount);
      document.getElementById('kTicketInProgress').textContent = fmtInt(inProgressCount);
      document.getElementById('kTicketReady').textContent = fmtInt(readyCount);
      document.getElementById('ticketMeta').textContent =
        `${{fmtInt(selected.length)}} filtered tickets | ready set size ${{fmtInt(readyIds.size)}}`;

      const byStatus = new Map();
      for (const row of selected) {{
        byStatus.set(row.status || 'unknown', (byStatus.get(row.status || 'unknown') || 0) + 1);
      }}
      renderBars(
        'ticketBars',
        Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]),
        'ticket'
      );

      const readyBody = document.getElementById('ticketReadyBody');
      readyBody.innerHTML = '';
      for (const row of selected.filter((item) => readyIds.has(String(item.id || ''))).slice(0, 12)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{ts(row.updated_at)}}</td>
          <td class="mono">${{esc(fmtPriority(row.priority))}}</td>
          <td><span class="pill ticket">${{esc(row.issue_type || '')}}</span></td>
          <td>${{esc(row.title || '')}}</td>
          <td class="mono">${{esc(row.id || '')}}</td>
        `;
        readyBody.appendChild(tr);
      }}

      const ticketBody = document.getElementById('ticketBody');
      ticketBody.innerHTML = '';
      for (const row of selected.slice(0, 50)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{ts(row.updated_at)}}</td>
          <td><span class="pill ticket">${{esc(row.status || '')}}</span></td>
          <td class="mono">${{esc(fmtPriority(row.priority))}}</td>
          <td>${{esc(row.issue_type || '')}}</td>
          <td>${{esc(row.title || '')}}</td>
          <td class="mono">${{esc(row.id || '')}}</td>
        `;
        ticketBody.appendChild(tr);
      }}
    }}

    function renderMemory() {{
      const selected = pickMemoryRows();
      const activeCount = selected.filter((row) => row.status === 'active').length;
      const updatedToday = selected.filter((row) => String(row.updated_at || '').slice(0, 10) === today).length;
      const avgConfidence = selected.length
        ? selected.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / selected.length
        : 0;

      document.getElementById('kMemoryEntries').textContent = fmtInt(selected.length);
      document.getElementById('kMemoryActive').textContent = fmtInt(activeCount);
      document.getElementById('kMemoryToday').textContent = fmtInt(updatedToday);
      const confNode = document.getElementById('kMemoryConf');
      confNode.textContent = fmt1(avgConfidence);
      confNode.className = `v mono ${{avgConfidence >= 0.8 ? 'good' : avgConfidence < 0.6 ? 'warn' : ''}}`;

      document.getElementById('memoryMeta').textContent =
        `${{fmtInt(selected.length)}} filtered entries | ${{fmtInt(updatedToday)}} updated on ${{today || 'today'}}`;

      const bySection = new Map();
      for (const row of selected) {{
        bySection.set(row.section || 'unknown', (bySection.get(row.section || 'unknown') || 0) + 1);
      }}
      renderBars(
        'memoryBars',
        Array.from(bySection.entries()).sort((a, b) => b[1] - a[1]),
        'memory'
      );

      const recentBody = document.getElementById('memoryBody');
      recentBody.innerHTML = '';
      for (const row of selected.slice(0, 12)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{ts(row.updated_at)}}</td>
          <td>${{esc(row.project || '')}}</td>
          <td><span class="pill">${{esc(row.section || '')}}</span></td>
          <td>${{esc(row.status || '')}}</td>
          <td class="mono">${{fmt1(row.confidence)}}</td>
          <td class="mono">${{esc(row.id || '')}}</td>
        `;
        recentBody.appendChild(tr);
      }}

      const detailBody = document.getElementById('memoryDetailBody');
      detailBody.innerHTML = '';
      for (const row of selected.slice(0, 100)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{ts(row.updated_at)}}</td>
          <td>${{esc(row.project || '')}}</td>
          <td><span class="pill">${{esc(row.section || '')}}</span></td>
          <td>${{esc(row.status || '')}}</td>
          <td class="mono">${{fmt1(row.confidence)}}</td>
          <td>${{esc(row.summary || '')}}</td>
          <td class="mono">${{esc(row.id || '')}}</td>
        `;
        detailBody.appendChild(tr);
      }}
    }}

    ticketStatusFilter.addEventListener('change', renderTickets);
    ticketTypeFilter.addEventListener('change', renderTickets);
    ticketPriorityFilter.addEventListener('change', renderTickets);
    ticketReadyOnly.addEventListener('change', renderTickets);

    memoryProjectFilter.addEventListener('change', renderMemory);
    memoryStatusFilter.addEventListener('change', renderMemory);
    memorySectionFilter.addEventListener('change', renderMemory);
    memoryMinConfidence.addEventListener('input', renderMemory);

    renderTickets();
    renderMemory();
  </script>
</body>
</html>
"""


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Error: root path not found: {root}")
        return 1

    workspace_root = root.parent
    out_path = Path(args.out).resolve() if args.out else root / "dashboard.html"
    memory_rows = load_memory_rows(root, args.project)
    ticket_data = load_ticket_data(workspace_root)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    html = build_html(memory_rows, ticket_data, generated_at)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Dashboard written: {out_path}")
    print(f"Tickets indexed: {len(ticket_data.get('rows', []))}")
    print(f"Memory entries indexed: {len(memory_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
