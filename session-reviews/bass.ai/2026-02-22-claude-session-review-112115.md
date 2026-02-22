# Session Review Report

- Report ID: `session-review-5decdb05`
- Generated: `2026-02-22T16:44:58.639476+00:00`
- Source: `claude`
- Sessions analyzed: `1`

## Summary

- Input tokens: 125
- Output tokens: 4990
- Total tokens: 5115
- Messages: 183
- Avg tokens/message: 27.95
- Tool calls: 0
- Retry loops: 2
- Repeated context ratio: 0.0

## Budget

- Constraint max_tokens: 20000
- Constraint timebox_minutes: 60.0
- Usage total_tokens: 5115
- Usage elapsed_minutes: 23.7
- Adherence tokens_percent_of_budget: 25.57
- Adherence tokens_over_budget: 0
- Adherence time_percent_of_budget: 39.5
- Adherence minutes_over_budget: 0.0

## Scores

- Efficiency: 77.77
- Reliability: 96.0
- Quality estimate: 84.0
- Composite: 84.22
- Confidence: low
- Method: heuristic-v1

## Top Token Drivers

1. Session size (impact: 5115)
   - Total tokens were 5115, which is the primary overall cost driver.
2. Retry/rewrite loops (impact: 700)
   - Detected 2 retry-like turns, which likely repeated context and output.

## Recommendations

- R-001 [high]: Use a tighter initial task contract and avoid re-sending unchanged full context every turn.
  rationale: Reduces repeated prompt overhead and prevents context bloat.
  refs: https://platform.openai.com/docs/guides/prompt-engineering/prompt-engineering-best-practices.pdf, https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices
- R-002 [high]: Add explicit acceptance criteria and stop conditions to reduce retry loops.
  rationale: Retry patterns are strongly correlated with avoidable token spend.
  refs: https://platform.openai.com/docs/guides/prompt-optimizer/
- R-003 [low]: Preserve the current tool-call discipline and avoid unnecessary exploratory loops.
  rationale: Maintains current efficiency levels as task complexity grows.
  refs: https://platform.openai.com/docs/guides/prompt-engineering/prompt-engineering-best-practices.pdf
