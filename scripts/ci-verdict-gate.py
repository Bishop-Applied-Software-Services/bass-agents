#!/usr/bin/env python3
"""CI verdict gate for session review reports.

Policy:
- smoke: never blocking (warn only)
- workflow/real: fail CI when verdict == "fail"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Apply CI gating policy to a session review report JSON")
    p.add_argument("--report", required=True, help="Path to review report JSON")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    report_path = Path(args.report)
    if not report_path.exists():
        print(f"[ci-gate] ERROR: report not found: {report_path}", file=sys.stderr)
        return 2

    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[ci-gate] ERROR: invalid JSON in report: {report_path}: {exc}", file=sys.stderr)
        return 2

    run_type = str(report.get("run_type", "real"))
    evaluation = report.get("evaluation", {}) or {}
    verdict = str(evaluation.get("verdict", "")).lower()
    report_id = str(report.get("report_id", "unknown"))

    if run_type == "smoke":
        print(f"[ci-gate] smoke run is non-blocking (report={report_id}, verdict={verdict or 'unknown'})")
        return 0

    if run_type not in {"workflow", "real"}:
        print(f"[ci-gate] ERROR: unsupported run_type={run_type} in report={report_id}", file=sys.stderr)
        return 2

    if verdict == "fail":
        print(f"[ci-gate] FAIL: run_type={run_type}, verdict=fail, report={report_id}", file=sys.stderr)
        return 1

    if verdict in {"pass", "warn"}:
        print(f"[ci-gate] PASS: run_type={run_type}, verdict={verdict}, report={report_id}")
        return 0

    print(f"[ci-gate] ERROR: missing/invalid verdict for run_type={run_type}, report={report_id}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
