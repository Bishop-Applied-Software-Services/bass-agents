#!/usr/bin/env python3
"""Terminal dashboard for session review trend data."""

from __future__ import annotations

import argparse
import csv
import curses
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List


@dataclass
class TrendRow:
    date: str
    project: str
    source: str
    session_reference_id: str
    total_tokens: int
    composite: float
    efficiency: float
    retry_loops: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Launch a TUI for session-review trend data."
    )
    parser.add_argument(
        "--root",
        default="session-reviews",
        help="Session reviews root directory (default: session-reviews)",
    )
    parser.add_argument(
        "--refresh",
        type=int,
        default=5,
        help="Refresh interval in seconds (default: 5)",
    )
    return parser.parse_args()


def to_int(value: str, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def to_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def load_rows(root: Path) -> List[TrendRow]:
    rows: List[TrendRow] = []
    for trend_file in sorted(root.glob("*/trend.csv")):
        project = trend_file.parent.name
        try:
            with trend_file.open("r", encoding="utf-8", newline="") as handle:
                for row in csv.DictReader(handle):
                    rows.append(
                        TrendRow(
                            date=str(row.get("date", "")).strip(),
                            project=project,
                            source=str(row.get("source", "")).strip(),
                            session_reference_id=str(
                                row.get("session_reference_id", "")
                            ).strip()
                            or str(row.get("session_id", "")).strip(),
                            total_tokens=to_int(str(row.get("total_tokens", "0"))),
                            composite=to_float(str(row.get("composite", "0"))),
                            efficiency=to_float(str(row.get("efficiency", "0"))),
                            retry_loops=to_int(str(row.get("retry_loops", "0"))),
                        )
                    )
        except OSError:
            continue
    rows.sort(key=lambda r: (r.date, r.session_reference_id), reverse=True)
    return rows


def aggregate_tokens_by_project(rows: List[TrendRow]) -> List[tuple[str, int]]:
    totals: Dict[str, int] = {}
    for row in rows:
        totals[row.project] = totals.get(row.project, 0) + row.total_tokens
    return sorted(totals.items(), key=lambda item: item[1], reverse=True)


def draw_dashboard(
    stdscr: "curses._CursesWindow",
    rows: List[TrendRow],
    root: Path,
    refresh_seconds: int,
    last_refresh_at: float,
) -> None:
    stdscr.erase()
    height, width = stdscr.getmaxyx()

    total_tokens = sum(r.total_tokens for r in rows)
    avg_composite = sum(r.composite for r in rows) / len(rows) if rows else 0.0
    avg_efficiency = sum(r.efficiency for r in rows) / len(rows) if rows else 0.0

    header = "Session Review Dashboard (TUI)"
    subtitle = (
        f"root={root} | rows={len(rows)} | refresh={refresh_seconds}s | "
        "q:quit r:refresh"
    )
    summary = (
        f"sessions={len(rows)}  total_tokens={total_tokens:,}  "
        f"avg_composite={avg_composite:.1f}  avg_efficiency={avg_efficiency:.1f}"
    )
    age = int(max(0, time.time() - last_refresh_at))
    refresh_info = f"last refresh: {age}s ago"

    stdscr.addnstr(0, 0, header, width - 1, curses.A_BOLD)
    stdscr.addnstr(1, 0, subtitle, width - 1)
    stdscr.addnstr(2, 0, summary, width - 1)
    stdscr.addnstr(3, 0, refresh_info, width - 1)

    y = 5
    stdscr.addnstr(y, 0, "Top Projects by Token Load", width - 1, curses.A_UNDERLINE)
    y += 1
    project_totals = aggregate_tokens_by_project(rows)[:6]
    for project, tokens in project_totals:
        stdscr.addnstr(y, 0, f"- {project:<20} {tokens:>12,}", width - 1)
        y += 1

    y += 1
    stdscr.addnstr(
        y,
        0,
        "Recent Sessions (date project source tokens composite retry ref)",
        width - 1,
        curses.A_UNDERLINE,
    )
    y += 1

    max_rows = max(0, height - y - 1)
    for row in rows[:max_rows]:
        line = (
            f"{row.date:<10} {row.project:<14} {row.source:<7} "
            f"{row.total_tokens:>10,} {row.composite:>7.1f} "
            f"{row.retry_loops:>5} {row.session_reference_id}"
        )
        stdscr.addnstr(y, 0, line, width - 1)
        y += 1

    stdscr.refresh()


def run(stdscr: "curses._CursesWindow", root: Path, refresh_seconds: int) -> None:
    curses.curs_set(0)
    stdscr.nodelay(True)
    stdscr.timeout(250)

    rows = load_rows(root)
    last_refresh_at = time.time()

    while True:
        draw_dashboard(stdscr, rows, root, refresh_seconds, last_refresh_at)
        key = stdscr.getch()

        if key in (ord("q"), ord("Q")):
            break
        if key in (ord("r"), ord("R")):
            rows = load_rows(root)
            last_refresh_at = time.time()
            continue

        if time.time() - last_refresh_at >= refresh_seconds:
            rows = load_rows(root)
            last_refresh_at = time.time()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Error: root path not found: {root}")
        return 1
    curses.wrapper(run, root, max(1, args.refresh))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
