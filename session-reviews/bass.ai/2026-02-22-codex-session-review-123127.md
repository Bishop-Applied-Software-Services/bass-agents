# Session Review Report

- Report ID: `session-review-11827857`
- Generated: `2026-02-22T17:31:53.506878+00:00`
- Source: `codex`
- Sessions analyzed: `1`

## Summary

- Input tokens: 192058
- Output tokens: 34637
- Total tokens: 1932679
- Messages: 30
- Avg tokens/message: 64422.63
- Tool calls: 78
- Retry loops: 3
- Repeated context ratio: 0.0

## Budget

- Usage total_tokens: 1932679
- Usage elapsed_minutes: 0.42

## Scores

- Efficiency: 12.0
- Reliability: 84.0
- Quality estimate: 76.0
- Composite: 55.2
- Confidence: medium
- Method: tool-integrated-v1

## Top Token Drivers

1. Session size (impact: 1932679)
   - Total tokens were 1932679, which is the primary overall cost driver.
2. High tokens per message (impact: 384135)
   - Average tokens/message was 64422.6; longer turns increase cumulative token spend.
3. High tool-call volume (impact: 6960)
   - Detected 78 tool-call markers; orchestration overhead can amplify total tokens.
4. Retry/rewrite loops (impact: 1050)
   - Detected 3 retry-like turns, which likely repeated context and output.

## Recommendations

- R-001 [high]: Use a tighter initial task contract and avoid re-sending unchanged full context every turn.
  rationale: Reduces repeated prompt overhead and prevents context bloat.
  refs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices, https://platform.openai.com/docs/guides/prompt-optimizer/
- R-002 [high]: Add explicit acceptance criteria and stop conditions to reduce retry loops.
  rationale: Retry patterns are strongly correlated with avoidable token spend.
  refs: https://platform.openai.com/docs/guides/prompt-optimizer/
- R-003 [medium]: Use agtrace and ccusage as standard diagnostics before tuning prompts manually.
  rationale: Consistent instrumentation improves attribution and recommendation quality.
  refs: https://github.com/lanegrid/agtrace, https://ccusage.com/guide/json-output
