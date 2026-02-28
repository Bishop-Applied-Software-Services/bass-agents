#!/usr/bin/env python3
"""Build a static HTML dashboard from session review trend/report files."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a session-review dashboard HTML file."
    )
    parser.add_argument(
        "--root",
        default="session-reviews",
        help="Session reviews root directory (default: session-reviews)",
    )
    parser.add_argument(
        "--out",
        help="Output HTML path (default: <root>/dashboard.html)",
    )
    return parser.parse_args()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def read_json_report(report_path: Path) -> Dict[str, Any]:
    try:
        raw = json.loads(report_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}

    recommendations: List[Dict[str, str]] = []
    for rec in raw.get("recommendations", [])[:3]:
        if isinstance(rec, dict):
            recommendations.append(
                {
                    "id": str(rec.get("id", "")),
                    "action": str(rec.get("action", "")),
                    "expected_impact": str(rec.get("expected_impact", "")),
                }
            )

    top_drivers: List[Dict[str, Any]] = []
    for driver in raw.get("top_token_drivers", [])[:3]:
        if isinstance(driver, dict):
            top_drivers.append(
                {
                    "rank": to_int(driver.get("rank"), 0),
                    "driver": str(driver.get("driver", "")),
                    "estimated_token_impact": to_int(
                        driver.get("estimated_token_impact"), 0
                    ),
                }
            )

    return {
        "report_id": str(raw.get("report_id", "")),
        "generated_at": str(raw.get("generated_at", "")),
        "model_used": str(raw.get("model_used", "")),
        "source": str(raw.get("source", "")),
        "scores": {
            "efficiency": to_float(raw.get("scores", {}).get("efficiency"), 0.0),
            "reliability": to_float(raw.get("scores", {}).get("reliability"), 0.0),
            "composite": to_float(raw.get("scores", {}).get("composite"), 0.0),
        },
        "summary": {
            "total_tokens": to_int(raw.get("summary", {}).get("total_tokens"), 0),
            "tool_calls": to_int(raw.get("summary", {}).get("tool_calls"), 0),
            "retry_loops": to_int(raw.get("summary", {}).get("retry_loops"), 0),
            "messages": to_int(raw.get("summary", {}).get("messages"), 0),
        },
        "recommendations": recommendations,
        "top_token_drivers": top_drivers,
    }


def resolve_report_path(trend_file: Path, report_path_raw: str) -> Optional[Path]:
    if not report_path_raw:
        return None
    report_path = Path(report_path_raw)
    if report_path.is_absolute():
        return report_path
    repo_root = trend_file.parents[2]
    return repo_root / report_path


def load_rows(root: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for trend_file in sorted(root.glob("*/trend.csv")):
        project = trend_file.parent.name
        try:
            with trend_file.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for item in reader:
                    report_path = resolve_report_path(
                        trend_file, str(item.get("report_path", "")).strip()
                    )
                    report_meta = read_json_report(report_path) if report_path else {}

                    session_id = str(item.get("session_id", "")).strip()
                    session_reference_id = str(
                        item.get("session_reference_id", "")
                    ).strip()
                    source = str(item.get("source", "")).strip() or report_meta.get(
                        "source", "unknown"
                    )
                    date_value = str(item.get("date", "")).strip()
                    report_name = report_path.name if report_path else ""

                    rows.append(
                        {
                            "project": project,
                            "date": date_value,
                            "source": source,
                            "session_id": session_id,
                            "session_reference_id": session_reference_id,
                            "total_tokens": to_int(item.get("total_tokens"), 0),
                            "input_tokens": to_int(item.get("input_tokens"), 0),
                            "output_tokens": to_int(item.get("output_tokens"), 0),
                            "tool_calls": to_int(item.get("tool_calls"), 0),
                            "retry_loops": to_int(item.get("retry_loops"), 0),
                            "efficiency": to_float(item.get("efficiency"), 0.0),
                            "reliability": to_float(item.get("reliability"), 0.0),
                            "composite": to_float(item.get("composite"), 0.0),
                            "estimated_cost_usd": to_float(
                                item.get("estimated_cost_usd"), 0.0
                            ),
                            "report_path": str(report_path) if report_path else "",
                            "report_file": report_name,
                            "report": report_meta,
                        }
                    )
        except OSError:
            continue
    return rows


def date_sort_key(item: Dict[str, Any]) -> str:
    path_hint = item.get("report_file", "")
    return f"{item.get('date', '')} {path_hint}"


def build_html(rows: List[Dict[str, Any]], generated_at: str) -> str:
    payload = json.dumps({"rows": rows, "generated_at": generated_at}, ensure_ascii=True)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Session Review Dashboard</title>
  <style>
    :root {{
      --bg: #f4f0e6;
      --panel: #fffaf2;
      --ink: #13213a;
      --muted: #4d5b7a;
      --line: #d4c8ad;
      --accent: #005f73;
      --accent-soft: #0a9396;
      --warning: #bb3e03;
      --good: #2a9d8f;
      --mono: "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
      --sans: "Manrope", "Avenir Next", "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -10%, #d9edc4 0%, transparent 55%),
        radial-gradient(1200px 700px at 100% -20%, #cdebf6 0%, transparent 45%),
        var(--bg);
      min-height: 100vh;
    }}
    .wrap {{
      max-width: 1200px;
      margin: 24px auto 40px;
      padding: 0 16px;
      animation: fadeUp .4s ease-out both;
    }}
    @keyframes fadeUp {{
      from {{ opacity: 0; transform: translateY(10px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-bottom: 16px;
    }}
    .title {{
      margin: 0;
      font-size: 2rem;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }}
    .meta {{
      margin-top: 6px;
      color: var(--muted);
      font-size: 0.9rem;
    }}
    .controls {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }}
    .controls label {{
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}
    select, input {{
      font: inherit;
      border: 1px solid #bcae8f;
      border-radius: 8px;
      padding: 7px 9px;
      background: #fff;
      min-width: 150px;
    }}
    .grid {{
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(12, 1fr);
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
      font-size: 0.8rem;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }}
    .v {{
      font-family: var(--mono);
      font-size: 1.45rem;
      font-weight: 700;
    }}
    .v.good {{ color: var(--good); }}
    .v.warn {{ color: var(--warning); }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }}
    .panel h2 {{
      margin: 0 0 10px;
      font-size: 1rem;
    }}
    .bars {{
      display: grid;
      gap: 8px;
    }}
    .bar-row {{
      display: grid;
      grid-template-columns: 140px 1fr 70px;
      gap: 8px;
      align-items: center;
      font-size: .9rem;
    }}
    .bar-track {{
      background: #e8dfcd;
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
    }}
    .bar-fill {{
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
      height: 100%;
      width: 0;
      transition: width .25s ease;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: .88rem;
    }}
    th, td {{
      border-bottom: 1px solid #e4dac6;
      text-align: left;
      padding: 7px 5px;
      vertical-align: top;
    }}
    th {{
      font-size: .74rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .04em;
    }}
    .mono {{ font-family: var(--mono); }}
    .pill {{
      display: inline-block;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: .72rem;
      font-weight: 600;
      background: #d9ecef;
      color: #10485f;
    }}
    .hint {{ color: var(--muted); font-size: .84rem; }}
    @media (max-width: 1000px) {{
      .card {{ grid-column: span 6; }}
      .bar-row {{ grid-template-columns: 105px 1fr 58px; }}
    }}
    @media (max-width: 640px) {{
      .header {{ flex-direction: column; align-items: flex-start; }}
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
        <h1 class="title">Session Review Dashboard</h1>
        <div id="meta" class="meta"></div>
      </div>
      <div class="hint">Generated static file from local review artifacts.</div>
    </div>

    <div class="controls">
      <label>Project
        <select id="projectFilter"></select>
      </label>
      <label>Source
        <select id="sourceFilter">
          <option value="all">all</option>
        </select>
      </label>
      <label>Min composite
        <input id="minComposite" type="number" min="0" max="100" step="1" value="0" />
      </label>
      <label>Rows
        <select id="rowLimit">
          <option value="20">20</option>
          <option value="50" selected>50</option>
          <option value="100">100</option>
          <option value="500">500</option>
        </select>
      </label>
    </div>

    <div class="grid">
      <div class="card"><div class="k">Sessions</div><div class="v mono" id="kSessions">0</div></div>
      <div class="card"><div class="k">Total Tokens</div><div class="v mono" id="kTokens">0</div></div>
      <div class="card"><div class="k">Avg Composite</div><div class="v mono" id="kComposite">0</div></div>
      <div class="card"><div class="k">Avg Efficiency</div><div class="v mono" id="kEfficiency">0</div></div>
    </div>

    <div class="panel">
      <h2>Token Load by Project</h2>
      <div id="projectBars" class="bars"></div>
    </div>

    <div class="panel">
      <h2>Latest Recommendations</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Project</th><th>Source</th><th>Recommendation</th><th>Impact</th>
          </tr>
        </thead>
        <tbody id="recsBody"></tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Recent Sessions</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Project</th><th>Source</th><th>Total tokens</th><th>Composite</th><th>Tool calls</th><th>Retry</th><th>Session ref</th>
          </tr>
        </thead>
        <tbody id="sessionsBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    const DATA = {payload};

    const fmtInt = (n) => new Intl.NumberFormat().format(Number(n || 0));
    const fmt1 = (n) => Number(n || 0).toFixed(1);
    const byNewest = (a, b) => (a.sort_key < b.sort_key ? 1 : -1);

    const rows = (DATA.rows || []).map(r => ({{
      ...r,
      sort_key: `${{r.date || ''}} ${{r.report_file || ''}}`
    }})).sort(byNewest);

    const projectFilter = document.getElementById('projectFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const minComposite = document.getElementById('minComposite');
    const rowLimit = document.getElementById('rowLimit');
    const meta = document.getElementById('meta');

    const projects = ['all', ...Array.from(new Set(rows.map(r => r.project))).sort()];
    for (const project of projects) {{
      const opt = document.createElement('option');
      opt.value = project;
      opt.textContent = project;
      projectFilter.appendChild(opt);
    }}
    const sources = Array.from(new Set(rows.map(r => r.source))).filter(Boolean).sort();
    for (const src of sources) {{
      const opt = document.createElement('option');
      opt.value = src;
      opt.textContent = src;
      sourceFilter.appendChild(opt);
    }}

    const pickRows = () => {{
      const p = projectFilter.value;
      const s = sourceFilter.value;
      const min = Number(minComposite.value || 0);
      return rows.filter(r =>
        (p === 'all' || r.project === p) &&
        (s === 'all' || r.source === s) &&
        Number(r.composite || 0) >= min
      );
    }};

    function render() {{
      const picked = pickRows();
      const limited = picked.slice(0, Number(rowLimit.value || 50));
      const totalTokens = picked.reduce((a, r) => a + Number(r.total_tokens || 0), 0);
      const avgComposite = picked.length ? picked.reduce((a, r) => a + Number(r.composite || 0), 0) / picked.length : 0;
      const avgEfficiency = picked.length ? picked.reduce((a, r) => a + Number(r.efficiency || 0), 0) / picked.length : 0;

      document.getElementById('kSessions').textContent = fmtInt(picked.length);
      document.getElementById('kTokens').textContent = fmtInt(totalTokens);

      const c = document.getElementById('kComposite');
      c.textContent = fmt1(avgComposite);
      c.className = `v mono ${{avgComposite >= 70 ? 'good' : avgComposite < 40 ? 'warn' : ''}}`;

      const e = document.getElementById('kEfficiency');
      e.textContent = fmt1(avgEfficiency);
      e.className = `v mono ${{avgEfficiency >= 70 ? 'good' : avgEfficiency < 40 ? 'warn' : ''}}`;

      meta.textContent = `${{picked.length}} filtered rows | generated ${{DATA.generated_at}}`;

      const byProject = new Map();
      for (const row of picked) {{
        const prev = byProject.get(row.project) || 0;
        byProject.set(row.project, prev + Number(row.total_tokens || 0));
      }}
      const projItems = Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
      const maxTokens = Math.max(1, ...projItems.map(x => x[1]));
      const projectBars = document.getElementById('projectBars');
      projectBars.innerHTML = '';
      for (const [project, tokens] of projItems) {{
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <div class="mono">${{project}}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${{(tokens / maxTokens) * 100}}%"></div></div>
          <div class="mono">${{fmtInt(tokens)}}</div>
        `;
        projectBars.appendChild(row);
      }}

      const sessionsBody = document.getElementById('sessionsBody');
      sessionsBody.innerHTML = '';
      for (const row of limited) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{row.date || ''}}</td>
          <td>${{row.project}}</td>
          <td><span class="pill">${{row.source || 'unknown'}}</span></td>
          <td class="mono">${{fmtInt(row.total_tokens)}}</td>
          <td class="mono">${{fmt1(row.composite)}}</td>
          <td class="mono">${{fmtInt(row.tool_calls)}}</td>
          <td class="mono">${{fmtInt(row.retry_loops)}}</td>
          <td class="mono">${{row.session_reference_id || row.session_id || ''}}</td>
        `;
        sessionsBody.appendChild(tr);
      }}

      const recRows = [];
      for (const row of picked) {{
        const rec = (row.report && row.report.recommendations && row.report.recommendations[0]) || null;
        if (!rec || !rec.action) continue;
        recRows.push({{
          date: row.date || '',
          project: row.project,
          source: row.source || '',
          action: rec.action,
          impact: rec.expected_impact || '',
          sort_key: row.sort_key
        }});
      }}
      recRows.sort((a, b) => a.sort_key < b.sort_key ? 1 : -1);
      const recsBody = document.getElementById('recsBody');
      recsBody.innerHTML = '';
      for (const rec of recRows.slice(0, 20)) {{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${{rec.date}}</td>
          <td>${{rec.project}}</td>
          <td><span class="pill">${{rec.source}}</span></td>
          <td>${{rec.action}}</td>
          <td class="mono">${{rec.impact}}</td>
        `;
        recsBody.appendChild(tr);
      }}
    }}

    projectFilter.addEventListener('change', render);
    sourceFilter.addEventListener('change', render);
    minComposite.addEventListener('input', render);
    rowLimit.addEventListener('change', render);
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

    rows = load_rows(root)
    rows.sort(key=date_sort_key, reverse=True)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    html = build_html(rows, generated_at)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Dashboard written: {out_path}")
    print(f"Rows indexed: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
