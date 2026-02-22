#!/usr/bin/env python3
"""review-session.py - Analyze recent Claude/Codex sessions via agtrace + ccusage.

This script intentionally leverages upstream CLIs instead of maintaining custom
provider log parsers in bass-agents.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import statistics
import subprocess
import sys
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

DOC_REFS = {
    "agtrace": "https://github.com/lanegrid/agtrace",
    "ccusage_json": "https://ccusage.com/guide/json-output",
    "openai_prompt_optimizer": "https://platform.openai.com/docs/guides/prompt-optimizer/",
    "anthropic_best_practices": "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices",
}

RETRY_TOKENS = ("retry", "again", "failed", "error", "didn't work", "did not work")
ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


class ToolError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Analyze session artifacts and generate scored review report")
    p.add_argument("--path", required=True, help="Path hint for source/project compatibility")
    p.add_argument("--source", default="auto", choices=["auto", "codex", "claude"], help="Session source")
    p.add_argument("--run-type", default="real", choices=["smoke", "workflow", "real"], help="Run category")
    p.add_argument("--project", help="Project slug/name for trend grouping")
    p.add_argument("--trend-file", help="Optional trend CSV path for baseline deltas and append")
    p.add_argument("--session-id", help="Explicit session id to analyze (avoids latest-session selection)")
    p.add_argument("--session-reference-id", help="Stable caller-provided reference id for this review run")
    p.add_argument("--format", default="json", choices=["json", "markdown"], help="Output format")
    p.add_argument("--out", help="Optional output path")
    p.add_argument("--max-tokens", type=int, help="Optional token budget")
    p.add_argument("--max-cost-usd", type=float, help="Optional cost budget")
    p.add_argument("--timebox-minutes", type=float, help="Optional time budget")
    p.add_argument("--elapsed-minutes", type=float, help="Optional observed elapsed minutes")
    p.add_argument(
        "--agtrace-data-dir",
        help="Optional agtrace data dir override (defaults to AGTRACE_PATH or <repo>/.agtrace)",
    )
    p.add_argument(
        "--project-root",
        help="Optional project root for agtrace filtering (defaults to current directory)",
    )
    return p.parse_args()


def normalize_slug(raw: str) -> str:
    out = re.sub(r"[^a-z0-9._-]+", "-", raw.strip().lower()).strip("-")
    return out or "unknown-project"


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def walk(node: Any):
    yield node
    if isinstance(node, dict):
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def maybe_json(text: str) -> Any:
    text = ANSI_ESCAPE_RE.sub("", text).replace("\r", "").strip()
    if not text:
        raise ValueError("empty output")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Tools may emit progress lines before/after JSON.
    starts = [idx for idx, ch in enumerate(text) if ch in "{["]
    if not starts:
        raise ValueError("no JSON found in tool output")

    decoder = json.JSONDecoder()
    for start in starts:
        try:
            parsed, _ = decoder.raw_decode(text[start:])
            return parsed
        except json.JSONDecodeError:
            continue
    raise ValueError("no decodable JSON found in tool output")


def run_json_command(cmd: List[str]) -> Any:
    try:
        proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise ToolError(f"missing dependency: {cmd[0]} not found in PATH") from exc

    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip()
        raise ToolError(f"command failed ({' '.join(cmd)}): {msg}")

    errors: List[Exception] = []
    for candidate in (proc.stdout, proc.stderr, f"{proc.stdout}\n{proc.stderr}"):
        if not candidate or not candidate.strip():
            continue
        try:
            return maybe_json(candidate)
        except Exception as exc:
            errors.append(exc)

    err = errors[-1] if errors else ValueError("empty stdout/stderr")
    raise ToolError(f"invalid JSON from {' '.join(cmd)}") from err


def run_command(cmd: List[str]) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise ToolError(f"missing dependency: {cmd[0]} not found in PATH") from exc
    return proc.returncode, proc.stdout, proc.stderr


def detect_source(args: argparse.Namespace) -> str:
    if args.source != "auto":
        return args.source
    hint = args.path.lower()
    if "claude" in hint:
        return "claude"
    if "codex" in hint:
        return "codex"
    return "claude"


def agtrace_base_cmd(args: argparse.Namespace) -> List[str]:
    cmd = ["agtrace"]
    script_repo_root = Path(__file__).resolve().parents[1]
    data_dir = args.agtrace_data_dir or os.environ.get("AGTRACE_PATH") or str(script_repo_root / ".agtrace")
    cmd.extend(["--data-dir", data_dir])
    project_root = args.project_root or os.getcwd()
    cmd.extend(["--project", project_root])
    return cmd


def ensure_agtrace_ready(args: argparse.Namespace) -> None:
    base = agtrace_base_cmd(args)
    probe_cmd = base + ["session", "list", "--limit", "1", "--format", "json"]
    code, _, _ = run_command(probe_cmd)
    if code == 0:
        return

    # Initialize once if not ready.
    init_cmd = base + ["init", "--format", "json"]
    init_code, _, init_err = run_command(init_cmd)
    if init_code != 0:
        raise ToolError(f"agtrace init failed: {init_err.strip()}")


def agtrace_session(args: argparse.Namespace, provider: str, session_id: str | None) -> Dict[str, Any]:
    ensure_agtrace_ready(args)
    base = agtrace_base_cmd(args)
    resolved_id = session_id
    if not resolved_id:
        listed = run_json_command(base + ["session", "list", "--provider", provider, "--limit", "1", "--format", "json"])
        sessions = listed.get("content", {}).get("sessions", [])
        if not sessions:
            raise ToolError(f"no {provider} sessions found in agtrace index")
        resolved_id = sessions[0].get("id")
        if not resolved_id:
            raise ToolError("agtrace session list returned missing session id")

    shown = run_json_command(base + ["session", "show", resolved_id, "--format", "json"])
    shown_provider = shown.get("content", {}).get("header", {}).get("provider")
    if shown_provider and shown_provider != provider:
        raise ToolError(
            f"session id {resolved_id} is provider={shown_provider}, expected provider={provider}"
        )
    return shown


def pick_most_common(items: List[str]) -> str | None:
    if not items:
        return None
    counts = Counter(items)
    return counts.most_common(1)[0][0]


def infer_codex_model_from_logs(agtrace_show: Dict[str, Any]) -> str | None:
    header = agtrace_show.get("content", {}).get("header", {})
    log_files = header.get("log_files", [])
    if not isinstance(log_files, list):
        return None

    candidates: List[str] = []
    for log_file in log_files:
        if not isinstance(log_file, str) or not os.path.isfile(log_file):
            continue
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    for n in walk(obj):
                        if not isinstance(n, dict):
                            continue
                        v = n.get("model")
                        if not isinstance(v, str):
                            continue
                        model = v.strip()
                        # Restrict to model-id-like tokens, not prose labels.
                        if " " in model:
                            continue
                        if model.startswith("gpt-") or model.startswith("o") or "codex" in model:
                            candidates.append(model)
        except OSError:
            continue

    return pick_most_common(candidates)


def summarize_from_agtrace(show_json: Dict[str, Any]) -> Dict[str, Any]:
    content = show_json.get("content", {})
    turns = content.get("turns", []) or []

    input_tokens = 0
    output_tokens = 0
    cache_read_tokens = 0
    messages = 0
    tool_calls = 0
    retry_loops = 0
    user_queries: List[str] = []

    for turn in turns:
        metrics = turn.get("metrics", {}) or {}
        input_tokens += int(metrics.get("input_tokens", 0) or 0)
        output_tokens += int(metrics.get("output_tokens", 0) or 0)
        cache_read_tokens += int(metrics.get("cache_read_tokens", 0) or 0)

        user_query = turn.get("user_query")
        if isinstance(user_query, str) and user_query.strip():
            messages += 1
            norm = normalize_text(user_query)
            user_queries.append(norm)
            if any(tok in norm for tok in RETRY_TOKENS):
                retry_loops += 1

        for step in turn.get("steps", []) or []:
            kind = step.get("kind")
            if kind == "Message":
                messages += 1
                text = step.get("text")
                if isinstance(text, str):
                    norm = normalize_text(text)
                    if any(tok in norm for tok in RETRY_TOKENS):
                        retry_loops += 1
            elif kind == "ToolCall":
                tool_calls += 1
            elif kind == "ToolCallSequence":
                tool_calls += int(step.get("count", 0) or 0)

    total_tokens = input_tokens + output_tokens + cache_read_tokens
    avg_tokens_per_message = (total_tokens / messages) if messages > 0 else 0.0

    repeated_context_ratio = 0.0
    if user_queries:
        unique = len(set(user_queries))
        repeated_context_ratio = max(0.0, min(1.0, 1.0 - (unique / len(user_queries))))

    return {
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "uncached_tokens": int(input_tokens + output_tokens),
        "cache_creation_tokens": 0,
        "cache_read_tokens": int(cache_read_tokens),
        "total_tokens": int(total_tokens),
        "messages": int(messages),
        "avg_tokens_per_message": round(avg_tokens_per_message, 2),
        "tool_calls": int(tool_calls),
        "retry_loops": int(retry_loops),
        "repeated_context_ratio": round(repeated_context_ratio, 3),
    }


def ccusage_session(session_id: str | None) -> Dict[str, Any]:
    if session_id:
        payload = run_json_command(["ccusage", "session", "--json", "--id", session_id])
        # Some ccusage versions return a single session object for --id.
        if isinstance(payload, dict) and payload.get("sessionId"):
            return payload
        sessions = payload.get("sessions", []) if isinstance(payload, dict) else []
        if not sessions:
            raise ToolError(f"ccusage returned no session for --id {session_id}")
        return sessions[0]

    payload = run_json_command(["ccusage", "session", "--json", "--order", "desc"])
    sessions = payload.get("sessions", []) if isinstance(payload, dict) else []
    if not sessions:
        raise ToolError("ccusage returned no sessions")
    return sessions[0]


def merge_claude_summary(ccusage_session: Dict[str, Any], agtrace_summary: Dict[str, Any]) -> Dict[str, Any]:
    input_tokens = int(ccusage_session.get("inputTokens", 0) or 0)
    output_tokens = int(ccusage_session.get("outputTokens", 0) or 0)
    cache_read_tokens = int(ccusage_session.get("cacheReadTokens", 0) or 0)
    cache_creation_tokens = int(ccusage_session.get("cacheCreationTokens", 0) or 0)
    total_tokens = int(ccusage_session.get("totalTokens", 0) or 0)

    # Some ccusage versions return token details under entries for --id.
    if isinstance(ccusage_session.get("entries"), list):
        entries = ccusage_session["entries"]
        entry_input = sum(int(e.get("inputTokens", 0) or 0) for e in entries if isinstance(e, dict))
        entry_output = sum(int(e.get("outputTokens", 0) or 0) for e in entries if isinstance(e, dict))
        entry_cache_creation = sum(int(e.get("cacheCreationTokens", 0) or 0) for e in entries if isinstance(e, dict))
        entry_cache_read = sum(int(e.get("cacheReadTokens", 0) or 0) for e in entries if isinstance(e, dict))
        if input_tokens == 0:
            input_tokens = entry_input
        if output_tokens == 0:
            output_tokens = entry_output
        if cache_creation_tokens == 0:
            cache_creation_tokens = entry_cache_creation
        if cache_read_tokens == 0:
            cache_read_tokens = entry_cache_read

    if total_tokens == 0:
        total_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens

    summary = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "uncached_tokens": int(input_tokens + output_tokens + cache_creation_tokens),
        "cache_creation_tokens": cache_creation_tokens,
        "cache_read_tokens": cache_read_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd": round(float(ccusage_session.get("totalCost", 0.0) or 0.0), 6),
        "messages": int(agtrace_summary.get("messages", 0)),
        "avg_tokens_per_message": 0.0,
        "tool_calls": int(agtrace_summary.get("tool_calls", 0)),
        "retry_loops": int(agtrace_summary.get("retry_loops", 0)),
        "repeated_context_ratio": float(agtrace_summary.get("repeated_context_ratio", 0.0)),
    }
    if summary["messages"] > 0:
        summary["avg_tokens_per_message"] = round(total_tokens / summary["messages"], 2)
    return summary


def infer_model_used(source: str, agtrace_show: Dict[str, Any], ccusage_data: Dict[str, Any] | None) -> str:
    if source == "claude" and ccusage_data is not None:
        models = ccusage_data.get("modelsUsed", [])
        if isinstance(models, list):
            normalized = [m for m in models if isinstance(m, str) and m.strip()]
            if normalized:
                return ", ".join(normalized)

    if source == "codex":
        codex_model = infer_codex_model_from_logs(agtrace_show)
        if codex_model:
            return codex_model
        header_model = agtrace_show.get("content", {}).get("header", {}).get("model")
        if isinstance(header_model, str):
            normalized = header_model.strip()
            if normalized and "claude" not in normalized.lower():
                return normalized
        return "unknown"

    header_model = agtrace_show.get("content", {}).get("header", {}).get("model")
    if isinstance(header_model, str) and header_model.strip():
        return header_model.strip()
    return "unknown"


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
        "uncached_tokens": int(summary.get("uncached_tokens", summary["total_tokens"])),
    }
    if "cache_creation_tokens" in summary:
        usage["cache_creation_tokens"] = int(summary.get("cache_creation_tokens", 0))
    if "cache_read_tokens" in summary:
        usage["cache_read_tokens"] = int(summary.get("cache_read_tokens", 0))
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
    budget: Dict[str, Any] | None,
    source_reliability: float,
) -> Dict[str, Any]:
    total_tokens = float(summary["total_tokens"])
    uncached_tokens = float(summary.get("uncached_tokens", total_tokens))
    cache_read_tokens = float(summary.get("cache_read_tokens", 0.0))
    avg_tpm = float(summary.get("avg_tokens_per_message", 0.0))
    retry_loops = float(summary.get("retry_loops", 0))
    tool_calls = float(summary.get("tool_calls", 0))
    repeated = float(summary.get("repeated_context_ratio", 0.0))
    effective_tokens = uncached_tokens + (cache_read_tokens * 0.1)

    eff = 100.0
    eff -= min(40.0, (effective_tokens / 20000.0) * 40.0)
    uncached_avg_tpm = (uncached_tokens / max(1.0, float(summary.get("messages", 0) or 0)))
    eff -= min(20.0, max(0.0, (uncached_avg_tpm - 250.0) / 500.0 * 20.0))
    eff -= min(20.0, retry_loops * 6.0)
    eff -= min(10.0, max(0.0, tool_calls - 15.0) * 0.5)
    eff -= repeated * 10.0

    if budget is not None:
        adh = budget.get("adherence", {})
        over_tokens = float(adh.get("tokens_over_budget", 0))
        over_cost = float(adh.get("cost_over_budget_usd", 0.0))
        over_minutes = float(adh.get("minutes_over_budget", 0.0))
        eff -= min(20.0, over_tokens / 1000.0 * 4.0)
        eff -= min(10.0, over_cost * 100.0)
        eff -= min(10.0, over_minutes / 10.0 * 5.0)

    eff = clamp(eff)

    has_token_signal = 1.0 if total_tokens > 0 else 0.0
    rel = (source_reliability * 80.0) + (has_token_signal * 20.0)
    rel = clamp(rel)

    quality_est = clamp(100.0 - (retry_loops * 8.0) - (repeated * 25.0))
    composite = clamp((0.45 * quality_est) + (0.35 * eff) + (0.20 * rel))

    confidence = "low"
    if source_reliability >= 0.75 and total_tokens > 0:
        confidence = "medium"
    if source_reliability >= 0.9 and total_tokens > 10000:
        confidence = "high"

    return {
        "efficiency": round(eff, 2),
        "reliability": round(rel, 2),
        "quality_estimate": round(quality_est, 2),
        "composite": round(composite, 2),
        "confidence": confidence,
        "score_method": "tool-integrated-v2-uncached-weighted",
    }


def build_drivers(summary: Dict[str, Any]) -> List[Dict[str, Any]]:
    drivers: List[Tuple[str, int, str]] = []
    total = int(summary["total_tokens"])
    uncached = int(summary.get("uncached_tokens", total))
    cache_read = int(summary.get("cache_read_tokens", 0))
    messages = max(1, int(summary.get("messages", 0) or 0))
    uncached_avg = float(uncached) / float(messages)
    tools = int(summary.get("tool_calls", 0))
    retries = int(summary.get("retry_loops", 0))
    repeated = float(summary.get("repeated_context_ratio", 0.0))

    drivers.append((
        "Session size",
        uncached,
        f"Uncached tokens were {uncached} (of {total} total), the primary controllable token driver.",
    ))

    if cache_read > 0:
        drivers.append((
            "Cache read volume",
            int(cache_read * 0.1),
            f"Cache-read tokens were {cache_read}; they inflate totals but are weighted lower for optimization scoring.",
        ))

    if uncached_avg > 400:
        impact = int((uncached_avg - 400) * max(1, summary.get("messages", 0) * 0.2))
        drivers.append((
            "High tokens per message",
            max(0, impact),
            f"Average uncached tokens/message was {uncached_avg:.1f}; longer turns increase controllable token spend.",
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
            "details": "Tool output had limited detail; collect richer session traces for better attribution.",
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
            DOC_REFS["anthropic_best_practices"],
            DOC_REFS["openai_prompt_optimizer"],
        ],
    })

    if summary.get("retry_loops", 0) > 0:
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

    recs.append({
        "id": "R-003",
        "action": "Use agtrace and ccusage as standard diagnostics before tuning prompts manually.",
        "expected_impact": "medium",
        "rationale": "Consistent instrumentation improves attribution and recommendation quality.",
        "doc_refs": [DOC_REFS["agtrace"], DOC_REFS["ccusage_json"]],
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


def run_type_thresholds(run_type: str) -> Dict[str, float]:
    if run_type == "smoke":
        return {
            "warn_uncached_tokens": 50.0,
            "fail_uncached_tokens": 500.0,
            "warn_cost_usd": 0.02,
            "fail_cost_usd": 0.05,
            "warn_retry_loops": 1.0,
            "fail_retry_loops": 2.0,
        }
    if run_type == "workflow":
        return {
            "warn_uncached_tokens": 50000.0,
            "fail_uncached_tokens": 120000.0,
            "warn_cost_usd": 10.0,
            "fail_cost_usd": 25.0,
            "warn_retry_loops": 3.0,
            "fail_retry_loops": 6.0,
        }
    return {
        "warn_uncached_tokens": 120000.0,
        "fail_uncached_tokens": 300000.0,
        "warn_cost_usd": 20.0,
        "fail_cost_usd": 50.0,
        "warn_retry_loops": 4.0,
        "fail_retry_loops": 8.0,
    }


def evaluate_run(summary: Dict[str, Any], run_type: str) -> Dict[str, Any]:
    thresholds = run_type_thresholds(run_type)
    checks: List[Dict[str, Any]] = []

    def add_check(metric: str, value: float, warn_limit: float, fail_limit: float, unit: str = "") -> None:
        status = "pass"
        if value > fail_limit:
            status = "fail"
        elif value > warn_limit:
            status = "warn"
        checks.append({
            "metric": metric,
            "value": round(value, 6) if isinstance(value, float) else value,
            "warn_limit": warn_limit,
            "fail_limit": fail_limit,
            "status": status,
            "unit": unit,
        })

    add_check(
        "uncached_tokens",
        float(summary.get("uncached_tokens", summary.get("total_tokens", 0))),
        thresholds["warn_uncached_tokens"],
        thresholds["fail_uncached_tokens"],
        "tokens",
    )
    add_check(
        "estimated_cost_usd",
        float(summary.get("estimated_cost_usd", 0.0)),
        thresholds["warn_cost_usd"],
        thresholds["fail_cost_usd"],
        "usd",
    )
    add_check(
        "retry_loops",
        float(summary.get("retry_loops", 0)),
        thresholds["warn_retry_loops"],
        thresholds["fail_retry_loops"],
        "count",
    )

    verdict = "pass"
    if any(c["status"] == "fail" for c in checks):
        verdict = "fail"
    elif any(c["status"] == "warn" for c in checks):
        verdict = "warn"

    return {
        "run_type": run_type,
        "verdict": verdict,
        "checks": checks,
        "thresholds": thresholds,
    }


def read_trend_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


def to_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def baseline_delta(
    trend_rows: List[Dict[str, str]],
    project_slug: str,
    source: str,
    run_type: str,
    summary: Dict[str, Any],
    scores: Dict[str, Any],
) -> Dict[str, Any] | None:
    similar = [
        r for r in trend_rows
        if (r.get("project", "") == project_slug and r.get("source", "") == source and r.get("run_type", "real") == run_type)
    ]
    if not similar:
        return None
    last = similar[-5:]
    baseline_uncached = [to_float(r.get("uncached_tokens"), to_float(r.get("total_tokens"))) for r in last]
    baseline_cost = [to_float(r.get("estimated_cost_usd")) for r in last]
    baseline_eff = [to_float(r.get("efficiency")) for r in last]

    uncached = float(summary.get("uncached_tokens", summary.get("total_tokens", 0)))
    cost = float(summary.get("estimated_cost_usd", 0.0))
    eff = float(scores.get("efficiency", 0.0))

    uncached_median = statistics.median(baseline_uncached) if baseline_uncached else 0.0
    cost_median = statistics.median(baseline_cost) if baseline_cost else 0.0
    eff_median = statistics.median(baseline_eff) if baseline_eff else 0.0

    def pct_delta(current: float, base: float) -> float:
        if base == 0:
            return 0.0
        return ((current - base) / base) * 100.0

    return {
        "sample_size": len(last),
        "uncached_tokens": {
            "current": round(uncached, 2),
            "baseline_median": round(uncached_median, 2),
            "delta": round(uncached - uncached_median, 2),
            "delta_percent": round(pct_delta(uncached, uncached_median), 2),
        },
        "estimated_cost_usd": {
            "current": round(cost, 6),
            "baseline_median": round(cost_median, 6),
            "delta": round(cost - cost_median, 6),
            "delta_percent": round(pct_delta(cost, cost_median), 2),
        },
        "efficiency": {
            "current": round(eff, 2),
            "baseline_median": round(eff_median, 2),
            "delta": round(eff - eff_median, 2),
            "delta_percent": round(pct_delta(eff, eff_median), 2),
        },
    }


def to_markdown(report: Dict[str, Any]) -> str:
    s = report["summary"]
    scores = report["scores"]
    lines = [
        "# Session Review Report",
        "",
        f"- Report ID: `{report['report_id']}`",
        f"- Session Ref ID: `{report['session_reference_id']}`",
        f"- Generated: `{report['generated_at']}`",
        f"- Source: `{report['source']}`",
        f"- Run Type: `{report.get('run_type', 'real')}`",
        f"- Model Used: `{report['model_used']}`",
        f"- Sessions analyzed: `{report['sessions_analyzed']}`",
        "",
        "## Summary",
        "",
        f"- Input tokens: {s['input_tokens']}",
        f"- Output tokens: {s['output_tokens']}",
        f"- Uncached tokens: {s.get('uncached_tokens', s['total_tokens'])}",
        f"- Cache creation tokens: {s.get('cache_creation_tokens', 0)}",
        f"- Cache read tokens: {s.get('cache_read_tokens', 0)}",
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

    evaluation = report.get("evaluation")
    if evaluation:
        lines.extend(["", "## Evaluation", ""])
        lines.append(f"- Verdict: **{evaluation.get('verdict', 'unknown')}**")
        lines.append(f"- Run type: {evaluation.get('run_type', 'real')}")
        for check in evaluation.get("checks", []):
            unit = check.get("unit", "")
            suffix = f" {unit}" if unit else ""
            lines.append(
                f"- {check.get('metric')}: {check.get('value')}{suffix} (warn>{check.get('warn_limit')}, fail>{check.get('fail_limit')}) => {check.get('status')}"
            )

    baseline = report.get("baseline_delta")
    if baseline:
        lines.extend(["", "## Baseline Delta (Last 5 Similar Runs)", ""])
        lines.append(f"- Sample size: {baseline.get('sample_size', 0)}")
        uncached = baseline.get("uncached_tokens", {})
        cost = baseline.get("estimated_cost_usd", {})
        eff = baseline.get("efficiency", {})
        lines.append(
            f"- Uncached tokens: {uncached.get('current')} vs {uncached.get('baseline_median')} (delta {uncached.get('delta')}, {uncached.get('delta_percent')}%)"
        )
        lines.append(
            f"- Estimated cost (USD): {cost.get('current')} vs {cost.get('baseline_median')} (delta {cost.get('delta')}, {cost.get('delta_percent')}%)"
        )
        lines.append(
            f"- Efficiency: {eff.get('current')} vs {eff.get('baseline_median')} (delta {eff.get('delta')}, {eff.get('delta_percent')}%)"
        )

    raw_sources = report.get("raw_sources", {})
    if raw_sources:
        lines.extend(["", "## Appendix: Raw Tool Output", ""])
        agtrace_raw = raw_sources.get("agtrace")
        if agtrace_raw is not None:
            lines.append("### agtrace")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(agtrace_raw, indent=2))
            lines.append("```")
            lines.append("")

        ccusage_raw = raw_sources.get("ccusage")
        if ccusage_raw is not None:
            lines.append("### ccusage")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(ccusage_raw, indent=2))
            lines.append("```")
            lines.append("")
    lines.append("")
    return "\n".join(lines)


def append_trend_row(trend_path: Path, report: Dict[str, Any], report_path: str, project_slug: str) -> None:
    header = [
        "date",
        "project",
        "source",
        "run_type",
        "session_reference_id",
        "session_id",
        "uncached_tokens",
        "total_tokens",
        "input_tokens",
        "output_tokens",
        "tool_calls",
        "retry_loops",
        "efficiency",
        "reliability",
        "composite",
        "estimated_cost_usd",
        "verdict",
        "report_path",
    ]
    trend_path.parent.mkdir(parents=True, exist_ok=True)

    existing_rows = read_trend_rows(trend_path)
    if not trend_path.exists() or not existing_rows:
        with trend_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=header)
            writer.writeheader()
    else:
        with trend_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            current_fields = reader.fieldnames or []
        if current_fields != header:
            migrated: List[Dict[str, str]] = []
            for row in existing_rows:
                migrated.append({
                    "date": row.get("date", ""),
                    "project": row.get("project", ""),
                    "source": row.get("source", ""),
                    "run_type": row.get("run_type", "real"),
                    "session_reference_id": row.get("session_reference_id", ""),
                    "session_id": row.get("session_id", ""),
                    "uncached_tokens": row.get("uncached_tokens", row.get("total_tokens", "0")),
                    "total_tokens": row.get("total_tokens", "0"),
                    "input_tokens": row.get("input_tokens", "0"),
                    "output_tokens": row.get("output_tokens", "0"),
                    "tool_calls": row.get("tool_calls", "0"),
                    "retry_loops": row.get("retry_loops", "0"),
                    "efficiency": row.get("efficiency", "0"),
                    "reliability": row.get("reliability", "0"),
                    "composite": row.get("composite", "0"),
                    "estimated_cost_usd": row.get("estimated_cost_usd", "0"),
                    "verdict": row.get("verdict", ""),
                    "report_path": row.get("report_path", ""),
                })
            with trend_path.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=header)
                writer.writeheader()
                writer.writerows(migrated)

    session_id = (
        report.get("raw_sources", {})
        .get("agtrace", {})
        .get("content", {})
        .get("header", {})
        .get("session_id", "")
    )
    row = {
        "date": dt.datetime.now(dt.timezone.utc).date().isoformat(),
        "project": project_slug,
        "source": report.get("source", ""),
        "run_type": report.get("run_type", "real"),
        "session_reference_id": report.get("session_reference_id", ""),
        "session_id": session_id,
        "uncached_tokens": str(report.get("summary", {}).get("uncached_tokens", 0)),
        "total_tokens": str(report.get("summary", {}).get("total_tokens", 0)),
        "input_tokens": str(report.get("summary", {}).get("input_tokens", 0)),
        "output_tokens": str(report.get("summary", {}).get("output_tokens", 0)),
        "tool_calls": str(report.get("summary", {}).get("tool_calls", 0)),
        "retry_loops": str(report.get("summary", {}).get("retry_loops", 0)),
        "efficiency": str(report.get("scores", {}).get("efficiency", 0)),
        "reliability": str(report.get("scores", {}).get("reliability", 0)),
        "composite": str(report.get("scores", {}).get("composite", 0)),
        "estimated_cost_usd": str(report.get("summary", {}).get("estimated_cost_usd", 0)),
        "verdict": str(report.get("evaluation", {}).get("verdict", "")),
        "report_path": report_path,
    }
    with trend_path.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writerow(row)


def main() -> int:
    args = parse_args()
    run_type = args.run_type
    project_raw = args.project or Path(args.path).name
    project_slug = normalize_slug(project_raw)
    trend_path = Path(args.trend_file) if args.trend_file else None
    session_reference_id = args.session_reference_id
    if not session_reference_id:
        if args.session_id:
            session_reference_id = f"sid-{args.session_id}"
        else:
            session_reference_id = f"auto-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    try:
        source = detect_source(args)
        raw_sources: Dict[str, Any] = {}
        model_used = "unknown"

        if source == "codex":
            agtrace_show = agtrace_session(args, provider="codex", session_id=args.session_id)
            raw_sources["agtrace"] = agtrace_show
            summary = summarize_from_agtrace(agtrace_show)
            model_used = infer_model_used(source, agtrace_show, ccusage_data=None)
            source_reliability = 0.8
        elif source == "claude":
            agtrace_show = agtrace_session(args, provider="claude_code", session_id=args.session_id)
            raw_sources["agtrace"] = agtrace_show
            agtrace_summary = summarize_from_agtrace(agtrace_show)
            claude_session_id = args.session_id or agtrace_show.get("content", {}).get("header", {}).get("session_id")
            ccusage_data = ccusage_session(claude_session_id)
            raw_sources["ccusage"] = ccusage_data
            summary = merge_claude_summary(ccusage_data, agtrace_summary)
            model_used = infer_model_used(source, agtrace_show, ccusage_data=ccusage_data)
            source_reliability = 0.95
        else:
            raise ToolError(f"unsupported source: {source}")

    except ToolError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("Install requirements:", file=sys.stderr)
        print("  npm install -g @lanegrid/agtrace ccusage", file=sys.stderr)
        return 1

    budget = build_budget(summary, args)
    scores = score_summary(summary, budget, source_reliability)
    evaluation = evaluate_run(summary, run_type)
    baseline = None
    if trend_path is not None:
        baseline = baseline_delta(
            read_trend_rows(trend_path),
            project_slug=project_slug,
            source=source,
            run_type=run_type,
            summary=summary,
            scores=scores,
        )

    report: Dict[str, Any] = {
        "report_id": f"session-review-{uuid.uuid4().hex[:8]}",
        "session_reference_id": session_reference_id,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project": project_slug,
        "run_type": run_type,
        "model_used": model_used,
        "source": source,
        "sessions_analyzed": 1,
        "summary": summary,
        "scores": scores,
        "evaluation": evaluation,
        "top_token_drivers": build_drivers(summary),
        "recommendations": build_recommendations(summary, budget),
        "raw_sources": raw_sources,
    }
    if budget is not None:
        report["budget"] = budget
    if baseline is not None:
        report["baseline_delta"] = baseline

    output = json.dumps(report, indent=2) if args.format == "json" else to_markdown(report)

    out_path: Path | None = None
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output + ("" if output.endswith("\n") else "\n"), encoding="utf-8")
    else:
        print(output)

    if trend_path is not None:
        report_path_for_trend = str(out_path) if out_path is not None else ""
        append_trend_row(trend_path, report, report_path_for_trend, project_slug)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
