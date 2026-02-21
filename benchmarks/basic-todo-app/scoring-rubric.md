# Basic Todo App Scoring Rubric

## Dimensions

Score each run on a 0-100 scale per dimension.

### 1) Quality (0-100)

- Acceptance criteria pass rate (70 points max)
- Reviewer defect penalty (30 points max)

Formula:

```text
quality = (passed_criteria / total_criteria) * 70
quality += max(0, 30 - defect_penalty)
```

Suggested `defect_penalty`:

- blocker: 15 each
- major: 8 each
- minor: 3 each
- info: 1 each

### 2) Efficiency (0-100)

Use baseline medians as reference after first sample batch.

- token efficiency (50 points)
- time efficiency (30 points)
- iteration efficiency (20 points)

Example normalized components:

```text
token_component = min(50, 50 * baseline_median_tokens / run_tokens)
time_component = min(30, 30 * baseline_median_minutes / run_minutes)
iter_component = min(20, 20 * baseline_median_iterations / run_iterations)
efficiency = token_component + time_component + iter_component
```

### 3) Reliability (0-100)

- Schema/contract compliance (50 points)
- Execution stability (30 points)
- Reproducibility notes completeness (20 points)

Guidance:

- full pass on all required artifacts: 100
- partial pass/missing evidence: reduce proportionally

## Composite

Use weighted composite:

```text
composite = 0.45 * quality + 0.35 * efficiency + 0.20 * reliability
```

## Decision Gate

Claim improvement only if:

1. Median composite improves by >= 10 points
2. Quality does not regress
3. Reliability does not regress
