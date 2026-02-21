#!/usr/bin/env python3
"""review-session.py - Analyze Codex/Claude session artifacts and emit scored report JSON.

MVP heuristics:
- Supports .json and .jsonl artifacts.
- Aggregates token/message/tool-call metrics using common key patterns.
- Emits session-review-report.schema.json-compatible output.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import uuid
from typing import Any, Dict, Iterable, List, Tuple

DOC_REFS = {
    "openai_prompt_best_practices": "https://platform.openai.com/docs/guides/prompt-engineering/prompt-engineering-best-practices.pdf",
    "openai_prompt_optimizer": "https://platform.openai.com/docs/guides/prompt-optimizer/",
    "anthropic_best_practices": "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices",
}

INPUT_KEYS = {
    "input_tokens",
    "prompt_tokens",
    "prompt_token_count",
    "inputTokenCount",
}
OUTPUT_KEYS = {
    "output_tokens",
    "completion_tokens",
    "output_token_count",
    "completionTokenCount",
}
TOTAL_KEYS = {"total_tokens", "totalTokenCount"}
COST_KEYS = {"estimated_cost_usd", "cost_usd", "cost"}

MESSAGE_ROLES = {"user", "assistant", "system", "tool", "developer"}
TOOL_KEYS = {"tool_name", "recipient_name", "tool", "tool_call_id", "function_call"}
TOOL_TYPES = {"tool_call", "function_call"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Analyze session artifacts and generate scored review report")
    p.add_argument("--path", required=True, help="Path to session file or directory (.json/.jsonl)")
    p.add_argument("--source", default="auto", choices=["auto", "codex", "claude"], help="Artifact source")
    p.add_argument("--format", default="json", choices=["json", "markdown"], help="Output format")
    p.add_argument("--out", help="Optional output path")
    p.add_argument("--max-tokens", type=int, help="Optional token budget for this session set")
    p.add_argument("--max-cost-usd", type=float, help="Optional cost budget in USD")
    p.add_argument("--timebox-minutes", type=float, help="Optional time budget in minutes")
    p.add_argument("--elapsed-minutes", type=float, help="Optional observed elapsed minutes")
    return p.parse_args()


def iter_files(path: str) -> List[str]:
    if os.path.isfile(path):
        return [path]
    files: List[str] = []
    for root, _, names in os.walk(path):
        for name in names:
            if name.endswith(".json") or name.endswith(".jsonl"):
                files.append(os.path.join(root, name))
    return sorted(files)


def load_file(path: str) -> List[Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
    except OSError as e:
        raise RuntimeError(f"cannot read {path}: {e}") from e

    if path.endswith(".jsonl"):
        out = []
        for idx, line in enumerate(raw.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise RuntimeError(f"invalid JSONL in {path}:{idx}: {e}") from e
        return out

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"invalid JSON in {path}: {e}") from e

    if isinstance(data, list):
        return data
    return [data]


def walk(node: Any) -> Iterable[Any]:
    yield node
    if isinstance(node, dict):
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def first_number(d: Dict[str, Any], keys: set[str]) -> float | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return None


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def extract_codex_token_count_usage(obj: Any) -> Dict[str, float] | None:
    if not isinstance(obj, dict):
        return None
    if obj.get("type") != "event_msg":
        return None
    payload = obj.get("payload")
    if not isinstance(payload, dict) or payload.get("type") != "token_count":
        return None
    info = payload.get("info")
    if not isinstance(info, dict):
        return None

    usage = info.get("last_token_usage")
    if not isinstance(usage, dict):
        return None

    out: Dict[str, float] = {}
    for key in ("input_tokens", "output_tokens", "total_tokens"):
        value = usage.get(key)
        if isinstance(value, (int, float)):
            out[key] = float(value)
    if not out:
        return None
    return out


def infer_source(files: List[str], objects: List[Any]) -> str:
    hints: set[str] = set()

    for f in files:
        lower = f.lower()
        if "/.codex/" in lower or "/codex/" in lower:
            hints.add("codex")
        if "/.claude/" in lower or "/claude/" in lower:
            hints.add("claude")

    for n in walk(objects):
        if not isinstance(n, dict):
            continue

        originator = n.get("originator")
        if isinstance(originator, str) and "codex" in originator.lower():
            hints.add("codex")

        model_provider = n.get("model_provider")
        if isinstance(model_provider, str):
            provider = model_provider.lower()
            if provider == "openai":
                hints.add("codex")
            elif provider == "anthropic":
                hints.add("claude")

        source = n.get("source")
        if isinstance(source, str):
            source_lower = source.lower()
            if source_lower in {"codex", "claude"}:
                hints.add(source_lower)

        message = n.get("message")
        if isinstance(message, dict):
            model = message.get("model")
            if isinstance(model, str):
                model_lower = model.lower()
                if "claude" in model_lower:
                    hints.add("claude")
                elif model_lower.startswith("gpt") or model_lower.startswith("o"):
                    hints.add("codex")

    if len(hints) > 1:
        return "mixed"
    if len(hints) == 1:
        return next(iter(hints))
    return "unknown"


def collect_metrics(objects: List[Any]) -> Dict[str, Any]:
    input_tokens = 0.0
    output_tokens = 0.0
    total_tokens = 0.0
    estimated_cost = 0.0
    has_cost = False

    messages = 0
    tool_calls = 0
    retry_loops = 0

    context_texts: List[str] = []
    last_token_snapshot: Tuple[float, float, float] | None = None

    for obj in objects:
        token_usage = extract_codex_token_count_usage(obj)
        if token_usage is not None:
            snapshot = (
                float(token_usage.get("input_tokens", 0.0)),
                float(token_usage.get("output_tokens", 0.0)),
                float(token_usage.get("total_tokens", 0.0)),
            )
            # Codex may emit duplicate token_count snapshots; count each unique
            # consecutive snapshot once.
            if snapshot != last_token_snapshot:
                input_tokens += snapshot[0]
                output_tokens += snapshot[1]
                total_tokens += snapshot[2]
                last_token_snapshot = snapshot
            continue

        for n in walk(obj):
            if not isinstance(n, dict):
                continue

            i = first_number(n, INPUT_KEYS)
            o = first_number(n, OUTPUT_KEYS)
            t = first_number(n, TOTAL_KEYS)

            if i is not None or o is not None or t is not None:
                if i is not None:
                    input_tokens += i
                if o is not None:
                    output_tokens += o
                if t is not None:
                    total_tokens += t
                elif i is not None or o is not None:
                    total_tokens += (i or 0) + (o or 0)

            c = first_number(n, COST_KEYS)
            if c is not None:
                estimated_cost += c
                has_cost = True

            role = n.get("role")
            if isinstance(role, str) and role.lower() in MESSAGE_ROLES:
                messages += 1
                content = n.get("content")
                if isinstance(content, str):
                    text = normalize_text(content)
                    if text:
                        if role.lower() in {"user", "system", "developer"}:
                            context_texts.append(text)
                        if any(tok in text for tok in ["retry", "again", "failed", "error", "didn't work", "did not work"]):
                            retry_loops += 1

            if any(k in n for k in TOOL_KEYS):
                tool_calls += 1
            ntype = n.get("type")
            if isinstance(ntype, str) and ntype in TOOL_TYPES:
                tool_calls += 1

    if total_tokens == 0 and (input_tokens > 0 or output_tokens > 0):
        total_tokens = input_tokens + output_tokens

    avg_tokens_per_message = (total_tokens / messages) if messages > 0 else 0.0

    repeated_context_ratio = 0.0
    if context_texts:
        unique = len(set(context_texts))
        repeated_context_ratio = max(0.0, min(1.0, 1.0 - (unique / len(context_texts))))

    result: Dict[str, Any] = {
        "input_tokens": int(round(input_tokens)),
        "output_tokens": int(round(output_tokens)),
        "total_tokens": int(round(total_tokens)),
        "messages": messages,
        "avg_tokens_per_message": round(avg_tokens_per_message, 2),
        "tool_calls": tool_calls,
        "retry_loops": retry_loops,
        "repeated_context_ratio": round(repeated_context_ratio, 3),
    }
    if has_cost:
        result["estimated_cost_usd"] = round(estimated_cost, 6)
    return result


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def build_budget(summary: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any] | None:
    has_budget = any(
        x is not None
        for x in [args.max_tokens, args.max_cost_usd, args.timebox_minutes, args.elapsed_minutes]
    )
    if not has_budget:
        return None

    constraints: Dict[str, Any] = {}
    usage: Dict[str, Any] = {
        "total_tokens": int(summary["total_tokens"]),
    }
    if "estimated_cost_usd" in summary:
        usage["estimated_cost_usd"] = float(summary["estimated_cost_usd"])
    if args.elapsed_minutes is not None:
        usage["elapsed_minutes"] = float(args.elapsed_minutes)

    adherence: Dict[str, Any] = {"warnings": []}

    if args.max_tokens is not None:
        constraints["max_tokens"] = int(args.max_tokens)
        pct = (float(summary["total_tokens"]) / float(args.max_tokens) * 100.0) if args.max_tokens > 0 else 0.0
        adherence["tokens_percent_of_budget"] = round(pct, 2)
        over = max(0, int(summary["total_tokens"]) - int(args.max_tokens))
        adherence["tokens_over_budget"] = over
        if over > 0:
            adherence["warnings"].append(f"Token budget exceeded by {over} tokens.")

    if args.max_cost_usd is not None:
        constraints["max_cost_usd"] = float(args.max_cost_usd)
        est_cost = float(summary.get("estimated_cost_usd", 0.0))
        pct = (est_cost / float(args.max_cost_usd) * 100.0) if args.max_cost_usd > 0 else 0.0
        adherence["cost_percent_of_budget"] = round(pct, 2)
        over = max(0.0, est_cost - float(args.max_cost_usd))
        adherence["cost_over_budget_usd"] = round(over, 6)
        if over > 0:
            adherence["warnings"].append(f"Cost budget exceeded by ${over:.4f}.")

    if args.timebox_minutes is not None:
        constraints["timebox_minutes"] = float(args.timebox_minutes)
    if args.elapsed_minutes is not None and args.timebox_minutes is not None and args.timebox_minutes > 0:
        pct = (float(args.elapsed_minutes) / float(args.timebox_minutes) * 100.0)
        adherence["time_percent_of_budget"] = round(pct, 2)
        over = max(0.0, float(args.elapsed_minutes) - float(args.timebox_minutes))
        adherence["minutes_over_budget"] = round(over, 2)
        if over > 0:
            adherence["warnings"].append(f"Time budget exceeded by {over:.2f} minutes.")

    return {
        "constraints": constraints,
        "usage": usage,
        "adherence": adherence,
    }


def score_summary(
    summary: Dict[str, Any],
    files_total: int,
    files_parsed: int,
    budget: Dict[str, Any] | None,
) -> Dict[str, Any]:
    total_tokens = float(summary["total_tokens"])
    avg_tpm = float(summary["avg_tokens_per_message"])
    retry_loops = float(summary["retry_loops"])
    tool_calls = float(summary["tool_calls"])
    repeated = float(summary["repeated_context_ratio"])

    # Efficiency: high score means less unnecessary usage patterns.
    eff = 100.0
    eff -= min(40.0, (total_tokens / 20000.0) * 40.0)
    eff -= min(20.0, max(0.0, (avg_tpm - 250.0) / 500.0 * 20.0))
    eff -= min(20.0, retry_loops * 6.0)
    eff -= min(10.0, max(0.0, tool_calls - 15.0) * 0.5)
    eff -= repeated * 10.0

    if budget is not None:
        adh = budget.get("adherence", {})
        over_tokens = float(adh.get("tokens_over_budget", 0))
        over_cost = float(adh.get("cost_over_budget_usd", 0.0))
        over_minutes = float(adh.get("minutes_over_budget", 0.0))
        # Budget overages apply explicit efficiency penalties.
        eff -= min(20.0, over_tokens / 1000.0 * 4.0)
        eff -= min(10.0, over_cost * 100.0)
        eff -= min(10.0, over_minutes / 10.0 * 5.0)

    eff = clamp(eff)

    # Reliability: parse success + signal completeness.
    parse_ratio = (files_parsed / files_total) if files_total > 0 else 0.0
    has_token_signal = 1.0 if total_tokens > 0 else 0.0
    rel = (parse_ratio * 60.0) + (has_token_signal * 20.0) + ((1.0 - min(1.0, retry_loops / 10.0)) * 20.0)
    rel = clamp(rel)

    # Quality estimate is intentionally low-confidence in MVP.
    quality_est = clamp(100.0 - (retry_loops * 8.0) - (repeated * 25.0))

    composite = clamp((0.45 * quality_est) + (0.35 * eff) + (0.20 * rel))

    confidence = "low"
    if files_parsed >= 3 and total_tokens > 0:
        confidence = "medium"
    if files_parsed >= 5 and total_tokens > 10000:
        confidence = "high"

    return {
        "efficiency": round(eff, 2),
        "reliability": round(rel, 2),
        "quality_estimate": round(quality_est, 2),
        "composite": round(composite, 2),
        "confidence": confidence,
        "score_method": "heuristic-v1",
    }


def build_drivers(summary: Dict[str, Any]) -> List[Dict[str, Any]]:
    drivers: List[Tuple[str, int, str]] = []
    total = int(summary["total_tokens"])
    avg = float(summary["avg_tokens_per_message"])
    tools = int(summary["tool_calls"])
    retries = int(summary["retry_loops"])
    repeated = float(summary["repeated_context_ratio"])

    drivers.append((
        "Session size",
        total,
        f"Total tokens were {total}, which is the primary overall cost driver.",
    ))

    if avg > 400:
        impact = int((avg - 400) * max(1, summary["messages"] * 0.2))
        drivers.append((
            "High tokens per message",
            max(0, impact),
            f"Average tokens/message was {avg:.1f}; longer turns increase cumulative token spend.",
        ))

    if retries > 0:
        drivers.append((
            "Retry/rewrite loops",
            retries * 350,
            f"Detected {retries} retry-like turns, which likely repeated context and output.",
        ))

    if tools > 20:
        drivers.append((
            "High tool-call volume",
            (tools - 20) * 120,
            f"Detected {tools} tool-call markers; orchestration overhead can amplify total tokens.",
        ))

    if repeated > 0.15:
        drivers.append((
            "Repeated context",
            int(repeated * total * 0.4),
            f"Repeated-context ratio was {repeated:.2f}; repeated prompts likely inflated usage.",
        ))

    drivers.sort(key=lambda x: x[1], reverse=True)

    out = []
    for idx, (driver, impact, details) in enumerate(drivers[:5], start=1):
        out.append({
            "rank": idx,
            "driver": driver,
            "estimated_token_impact": int(max(0, impact)),
            "details": details,
        })

    if not out:
        out = [{
            "rank": 1,
            "driver": "No dominant driver detected",
            "estimated_token_impact": 0,
            "details": "Artifact had limited usage detail; collect richer session logs for better attribution.",
        }]
    return out


def build_recommendations(summary: Dict[str, Any], budget: Dict[str, Any] | None) -> List[Dict[str, Any]]:
    recs: List[Dict[str, Any]] = []

    recs.append({
        "id": "R-001",
        "action": "Use a tighter initial task contract and avoid re-sending unchanged full context every turn.",
        "expected_impact": "high",
        "rationale": "Reduces repeated prompt overhead and prevents context bloat.",
        "doc_refs": [
            DOC_REFS["openai_prompt_best_practices"],
            DOC_REFS["anthropic_best_practices"],
        ],
    })

    if summary["retry_loops"] > 0:
        recs.append({
            "id": "R-002",
            "action": "Add explicit acceptance criteria and stop conditions to reduce retry loops.",
            "expected_impact": "high",
            "rationale": "Retry patterns are strongly correlated with avoidable token spend.",
            "doc_refs": [DOC_REFS["openai_prompt_optimizer"]],
        })
    else:
        recs.append({
            "id": "R-002",
            "action": "Keep turn objectives single-purpose and cap response scope per turn.",
            "expected_impact": "medium",
            "rationale": "Scoped turns lower average tokens per message and improve control.",
            "doc_refs": [DOC_REFS["anthropic_best_practices"]],
        })

    if summary["tool_calls"] > 20:
        recs.append({
            "id": "R-003",
            "action": "Batch read/search operations where possible to reduce iterative tool-call overhead.",
            "expected_impact": "medium",
            "rationale": "High tool-call fan-out can amplify assistant/tool coordination tokens.",
            "doc_refs": [DOC_REFS["openai_prompt_best_practices"]],
        })
    else:
        recs.append({
            "id": "R-003",
            "action": "Preserve the current tool-call discipline and avoid unnecessary exploratory loops.",
            "expected_impact": "low",
            "rationale": "Maintains current efficiency levels as task complexity grows.",
            "doc_refs": [DOC_REFS["openai_prompt_best_practices"]],
        })

    if budget is not None and budget.get("adherence", {}).get("warnings"):
        recs.append({
            "id": "R-004",
            "action": "Enforce explicit per-turn budget caps and stop when budget threshold reaches 85-90%.",
            "expected_impact": "high",
            "rationale": "Current run exceeded one or more declared budgets.",
            "doc_refs": [DOC_REFS["openai_prompt_optimizer"]],
        })

    return recs[:5]


def to_markdown(report: Dict[str, Any]) -> str:
    s = report["summary"]
    scores = report["scores"]
    lines = [
        "# Session Review Report",
        "",
        f"- Report ID: `{report['report_id']}`",
        f"- Generated: `{report['generated_at']}`",
        f"- Source: `{report['source']}`",
        f"- Sessions analyzed: `{report['sessions_analyzed']}`",
        "",
        "## Summary",
        "",
        f"- Input tokens: {s['input_tokens']}",
        f"- Output tokens: {s['output_tokens']}",
        f"- Total tokens: {s['total_tokens']}",
        f"- Messages: {s['messages']}",
        f"- Avg tokens/message: {s['avg_tokens_per_message']}",
        f"- Tool calls: {s['tool_calls']}",
        f"- Retry loops: {s['retry_loops']}",
        f"- Repeated context ratio: {s['repeated_context_ratio']}",
    ]
    if "estimated_cost_usd" in s:
        lines.append(f"- Estimated cost (USD): {s['estimated_cost_usd']}")

    if "budget" in report:
        b = report["budget"]
        constraints = b.get("constraints", {})
        usage = b.get("usage", {})
        adh = b.get("adherence", {})
        lines.extend(["", "## Budget", ""])
        for key, value in constraints.items():
            lines.append(f"- Constraint {key}: {value}")
        for key, value in usage.items():
            lines.append(f"- Usage {key}: {value}")
        for key, value in adh.items():
            if key == "warnings":
                continue
            lines.append(f"- Adherence {key}: {value}")
        if adh.get("warnings"):
            lines.append("- Warnings:")
            for w in adh["warnings"]:
                lines.append(f"  - {w}")

    lines.extend([
        "",
        "## Scores",
        "",
        f"- Efficiency: {scores['efficiency']}",
        f"- Reliability: {scores['reliability']}",
        f"- Quality estimate: {scores.get('quality_estimate', 'n/a')}",
        f"- Composite: {scores['composite']}",
        f"- Confidence: {scores.get('confidence', 'low')}",
        f"- Method: {scores['score_method']}",
        "",
        "## Top Token Drivers",
        "",
    ])

    for d in report["top_token_drivers"]:
        lines.append(f"{d['rank']}. {d['driver']} (impact: {d['estimated_token_impact']})")
        lines.append(f"   - {d['details']}")

    lines.extend(["", "## Recommendations", ""])
    for r in report["recommendations"]:
        lines.append(f"- {r['id']} [{r['expected_impact']}]: {r['action']}")
        if r.get("rationale"):
            lines.append(f"  rationale: {r['rationale']}")
        if r.get("doc_refs"):
            lines.append(f"  refs: {', '.join(r['doc_refs'])}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    files = iter_files(args.path)
    if not files:
        print(f"No .json/.jsonl artifacts found at: {args.path}", file=sys.stderr)
        return 1

    objects: List[Any] = []
    parsed = 0
    for file_path in files:
        try:
            loaded = load_file(file_path)
        except RuntimeError as e:
            print(f"WARN: {e}", file=sys.stderr)
            continue
        objects.extend(loaded)
        parsed += 1

    if parsed == 0:
        print("No parseable artifacts were found.", file=sys.stderr)
        return 1

    source = args.source
    if source == "auto":
        source = infer_source(files, objects)

    summary = collect_metrics(objects)
    budget = build_budget(summary, args)
    scores = score_summary(summary, len(files), parsed, budget)

    report: Dict[str, Any] = {
        "report_id": f"session-review-{uuid.uuid4().hex[:8]}",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": source,
        "sessions_analyzed": parsed,
        "summary": summary,
        "scores": scores,
        "top_token_drivers": build_drivers(summary),
        "recommendations": build_recommendations(summary, budget),
    }
    if budget is not None:
        report["budget"] = budget

    output = json.dumps(report, indent=2) if args.format == "json" else to_markdown(report)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
            if not output.endswith("\n"):
                f.write("\n")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
