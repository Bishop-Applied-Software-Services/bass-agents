#!/usr/bin/env python3
"""Build a static HTML dashboard from ai-memory entries."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a memory dashboard HTML file."
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
        help="Optional project filter (default: all projects)",
    )
    return parser.parse_args()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
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


def load_rows(root: Path, project_filter: str | None = None) -> List[Dict[str, Any]]:
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
                            "evidence_count": len(evidence) if isinstance(evidence, list) else 0,
                        }
                    )
        except OSError:
            continue
    rows.sort(key=lambda row: row.get("updated_at", ""), reverse=True)
    return rows


def build_html(rows: List[Dict[str, Any]], generated_at: str) -> str:
    payload = json.dumps({"rows": rows, "generated_at": generated_at}, ensure_ascii=True)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Memory Dashboard</title>
  <style>
    :root {{
      --bg: #f2f7f3;
      --panel: #fefefe;
      --ink: #192227;
      --muted: #5e707c;
      --line: #d2e0d8;
      --accent: #2c7a5b;
      --accent-2: #156f80;
      --warn: #a53f2b;
      --mono: "IBM Plex Mono", Menlo, Consolas, monospace;
      --sans: "Instrument Sans", "Avenir Next", "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      font-family: var(--sans);
      background:
        radial-gradient(1000px 600px at 0% 0%, #d8efe0 0%, transparent 55%),
        radial-gradient(1200px 700px at 100% 0%, #d7ecf6 0%, transparent 45%),
        var(--bg);
      min-height: 100vh;
    }}
    .wrap {{
      max-width: 1180px;
      margin: 24px auto 40px;
      padding: 0 16px;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: end;
      margin-bottom: 14px;
      gap: 12px;
    }}
    h1 {{
      margin: 0;
      font-size: 2rem;
      letter-spacing: -0.02em;
    }}
    .meta {{ color: var(--muted); font-size: .9rem; }}
    .controls {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
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
      border: 1px solid #bfd2c8;
      border-radius: 8px;
      padding: 7px 9px;
      min-width: 150px;
      background: #fff;
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
    .k {{ font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }}
    .v {{ font-family: var(--mono); font-size: 1.45rem; font-weight: 700; }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }}
    .panel h2 {{ margin: 0 0 10px; font-size: 1rem; }}
    .bars {{ display: grid; gap: 8px; }}
    .bar-row {{ display: grid; grid-template-columns: 150px 1fr 80px; gap: 8px; align-items: center; font-size: .9rem; }}
    .bar-track {{ background: #e5efe8; border-radius: 999px; height: 12px; overflow: hidden; }}
    .bar-fill {{ height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }}
    table {{ width: 100%; border-collapse: collapse; font-size: .88rem; }}
    th, td {{ text-align: left; border-bottom: 1px solid #e3ece7; padding: 7px 5px; vertical-align: top; }}
    th {{ font-size: .73rem; text-transform: uppercase; color: var(--muted); letter-spacing: .04em; }}
    .mono {{ font-family: var(--mono); }}
    .pill {{ display: inline-block; border-radius: 999px; padding: 2px 7px; font-size: .72rem; font-weight: 600; background: #ddf2e8; color: #195843; }}
    @media (max-width: 900px) {{ .card {{ grid-column: span 6; }} }}
    @media (max-width: 640px) {{
      .header {{ flex-direction: column; align-items: start; }}
      .card {{ grid-column: span 12; }}
      .controls label {{ width: 100%; }}
      select, input {{ width: 100%; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <h1>Memory Dashboard</h1>
        <div id="meta" class="meta"></div>
      </div>
      <div class="meta">Static HTML built from local memory data.</div>
    </div>

    <div class="controls">
      <label>Project <select id="projectFilter"></select></label>
      <label>Status <select id="statusFilter"><option value="all">all</option></select></label>
      <label>Section <select id="sectionFilter"><option value="all">all</option></select></label>
      <label>Min confidence <input id="minConfidence" type="number" min="0" max="1" step="0.1" value="0" /></label>
    </div>

    <div class="grid">
      <div class="card"><div class="k">Entries</div><div class="v mono" id="kEntries">0</div></div>
      <div class="card"><div class="k">Active</div><div class="v mono" id="kActive">0</div></div>
      <div class="card"><div class="k">Avg Confidence</div><div class="v mono" id="kConf">0.0</div></div>
      <div class="card"><div class="k">Evidence Items</div><div class="v mono" id="kEvidence">0</div></div>
    </div>

    <div class="panel">
      <h2>Entries by Project</h2>
      <div id="projectBars" class="bars"></div>
    </div>

    <div class="panel">
      <h2>Recent Memory Entries</h2>
      <table>
        <thead>
          <tr>
            <th>Updated</th><th>Project</th><th>Section</th><th>Status</th><th>Confidence</th><th>Summary</th><th>ID</th>
          </tr>
        </thead>
        <tbody id="entriesBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    const DATA = {payload};
    const rows = DATA.rows || [];
    const fmtInt = (n) => new Intl.NumberFormat().format(Number(n || 0));
    const fmt1 = (n) => Number(n || 0).toFixed(1);
    const projects = ['all', ...Array.from(new Set(rows.map(r => r.project))).sort()];
    const statuses = Array.from(new Set(rows.map(r => r.status))).filter(Boolean).sort();
    const sections = Array.from(new Set(rows.map(r => r.section))).filter(Boolean).sort();

    const projectFilter = document.getElementById('projectFilter');
    const statusFilter = document.getElementById('statusFilter');
    const sectionFilter = document.getElementById('sectionFilter');
    const minConfidence = document.getElementById('minConfidence');
    const meta = document.getElementById('meta');

    for (const value of projects) {{
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      projectFilter.appendChild(opt);
    }}
    for (const value of statuses) {{
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      statusFilter.appendChild(opt);
    }}
    for (const value of sections) {{
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      sectionFilter.appendChild(opt);
    }}

    function pickRows() {{
      const p = projectFilter.value;
      const st = statusFilter.value;
      const sec = sectionFilter.value;
      const min = Number(minConfidence.value || 0);
      return rows.filter(row =>
        (p === 'all' || row.project === p) &&
        (st === 'all' || row.status === st) &&
        (sec === 'all' || row.section === sec) &&
        Number(row.confidence || 0) >= min
      );
    }}

    function render() {{
      const selected = pickRows();
      const active = selected.filter(r => r.status === 'active').length;
      const avgConfidence = selected.length
        ? selected.reduce((a, r) => a + Number(r.confidence || 0), 0) / selected.length
        : 0;
      const evidence = selected.reduce((a, r) => a + Number(r.evidence_count || 0), 0);

      document.getElementById('kEntries').textContent = fmtInt(selected.length);
      document.getElementById('kActive').textContent = fmtInt(active);
      document.getElementById('kConf').textContent = fmt1(avgConfidence);
      document.getElementById('kEvidence').textContent = fmtInt(evidence);
      meta.textContent = `${{selected.length}} filtered entries | generated ${{DATA.generated_at}}`;

      const projectTotals = new Map();
      for (const row of selected) {{
        projectTotals.set(row.project, (projectTotals.get(row.project) || 0) + 1);
      }}
      const ranked = Array.from(projectTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
      const max = Math.max(1, ...ranked.map(item => item[1]));
      const barRoot = document.getElementById('projectBars');
      barRoot.innerHTML = '';
      for (const [project, count] of ranked) {{
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <div class="mono">${{project}}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${{(count / max) * 100}}%"></div></div>
          <div class="mono">${{fmtInt(count)}}</div>
        `;
        barRoot.appendChild(row);
      }}

      const body = document.getElementById('entriesBody');
      body.innerHTML = '';
      for (const row of selected.slice(0, 100)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{(row.updated_at || '').replace('T', ' ').slice(0, 19)}}</td>
          <td>${{row.project}}</td>
          <td><span class="pill">${{row.section}}</span></td>
          <td>${{row.status}}</td>
          <td class="mono">${{fmt1(row.confidence)}}</td>
          <td>${{row.summary || ''}}</td>
          <td class="mono">${{row.id || ''}}</td>
        `;
        body.appendChild(tr);
      }}
    }}

    projectFilter.addEventListener('change', render);
    statusFilter.addEventListener('change', render);
    sectionFilter.addEventListener('change', render);
    minConfidence.addEventListener('input', render);
    render();
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

    out_path = Path(args.out).resolve() if args.out else root / "dashboard.html"
    rows = load_rows(root, args.project)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    html = build_html(rows, generated_at)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Dashboard written: {out_path}")
    print(f"Entries indexed: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
