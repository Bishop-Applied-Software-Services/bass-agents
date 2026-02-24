# Memory Analytics Dashboard

The Memory Analytics Dashboard provides real-time visualization of your durable memory system's activity, health, and usage patterns. This guide covers how to launch the dashboard, interpret its metrics, and use the statistics API for programmatic access.

## Table of Contents

- [Dashboard Command](#dashboard-command)
- [Dashboard Layout](#dashboard-layout)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Statistics API](#statistics-api)
- [Examples](#examples)
- [Interpreting Metrics](#interpreting-metrics)
- [Troubleshooting](#troubleshooting)

## Dashboard Command

### Basic Usage

Launch the dashboard for a specific project:

```bash
bass-agents memory dashboard <project>
```

Generate a web dashboard instead of launching TUI:

```bash
bass-agents memory dashboard <project> --web
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `[project]` | Project name to display | `global` |
| `--all` | Show statistics for all projects | `false` |
| `--refresh <seconds>` | Auto-refresh interval in seconds | `30` |
| `--range <7d\|30d\|all>` | Date range filter | `all` |
| `--no-cache` | Bypass statistics cache | `false` |
| `--web` | Generate static HTML dashboard | `false` |
| `--out <path>` | Output path for `--web` mode | `ai-memory/<project>-dashboard.html` |

### Examples

```bash
# Launch dashboard for auth-service project
bass-agents memory dashboard auth-service

# Show all projects with 7-day range
bass-agents memory dashboard --all --range 7d

# Custom refresh interval (60 seconds)
bass-agents memory dashboard auth-service --refresh 60

# Generate web dashboard for one project
bass-agents memory dashboard auth-service --web

# Generate web dashboard for all projects
bass-agents memory dashboard --all --web --out ai-memory/dashboard.html

# Bypass cache for real-time data
bass-agents memory dashboard auth-service --no-cache

# Last 30 days with 15-second refresh
bass-agents memory dashboard auth-service --range 30d --refresh 15
```

## Dashboard Layout

The dashboard uses a three-column layout with multiple panels displaying different aspects of your memory system.

### Left Column

#### Summary Panel
Displays key health metrics with color-coded indicators:

- **Total Entries**: Total number of memory entries
- **Active Entries**: Entries with status="active"
- **Average Confidence**: Mean confidence score (0.0-1.0)
  - 🟢 Green: ≥ 0.7 (healthy)
  - 🟡 Yellow: 0.5-0.7 (warning)
  - 🔴 Red: < 0.5 (needs attention)
- **Low Confidence**: Count of entries with confidence < 0.5
- **Stale Evidence**: Count of entries with unreachable evidence URIs
  - 🟢 Green: ≤ 5 (healthy)
  - 🟡 Yellow: 6-20 (warning)
  - 🔴 Red: > 20 (needs attention)
- **Superseded**: Count and percentage of superseded entries
- **Compaction Needed**: Number of entries eligible for consolidation

#### Growth Trend Chart
ASCII line chart showing entries created per day over the last 14 days. Helps identify:
- Growth patterns and trends
- Spikes in memory creation
- Periods of low activity

### Middle Column

#### Entries by Section
Pie chart showing distribution across the four memory sections:
- **decisions**: Architectural choices and trade-offs
- **state**: Current project status and configuration
- **observations**: Findings from agent runs and tests
- **learnings**: Patterns discovered and optimization insights

#### Confidence Distribution
Bar chart showing confidence score distribution in five ranges:
- 0.0-0.2: Very low confidence
- 0.2-0.4: Low confidence
- 0.4-0.6: Medium confidence
- 0.6-0.8: Good confidence
- 0.8-1.0: High confidence

#### Evidence Types
Bar chart showing distribution of evidence types:
- **code**: Git permalinks and file paths
- **artifact**: Build artifacts and test results
- **ticket**: Issue tracker references
- **doc**: Documentation references
- **log**: Log files and queries
- **screenshot**: Image references
- **assumption**: Reasoning without external proof

### Right Column

#### Most Active Agents (Top 10)
Table showing agents that have created the most memory entries. Useful for:
- Identifying which agents are most active
- Understanding agent contribution patterns
- Tracking agent behavior over time

#### Entries Approaching Expiry
Table showing state entries expiring within 7 days:
- **Entry ID**: Memory entry identifier
- **Days Remaining**: Time until expiry
- **Summary**: Brief description

Color coding:
- 🔴 Red: ≤ 2 days remaining (urgent)
- 🟡 Yellow: 3-5 days remaining (warning)
- ⚪ White: 6-7 days remaining (notice)

#### Recent Operations (Last 20)
Table showing the most recent memory operations:
- **Time**: Timestamp (HH:MM)
- **Operation**: create, supersede, or deprecate
- **Entry ID**: Memory entry identifier
- **Summary**: Brief description

## Keyboard Shortcuts

The dashboard supports the following keyboard shortcuts:

| Key | Action |
|-----|--------|
| `q` | Quit dashboard |
| `Ctrl+C` | Quit dashboard |
| `r` | Manual refresh (bypasses cache) |
| `h` or `?` | Show help overlay |
| `↑` / `↓` | Scroll through tables (future) |

### Help Overlay

Press `h` or `?` to display a help overlay with all available keyboard shortcuts. Press any key to close the help overlay.

## Statistics API

For programmatic access to memory statistics, use the `stats` command.

### Stats Command

```bash
bass-agents memory stats [project] [options]
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `[project]` | Project name to analyze | `global` |
| `--all` | Show statistics for all projects | `false` |
| `--range <7d\|30d\|all>` | Date range filter | `all` |
| `--no-cache` | Bypass statistics cache | `false` |
| `--json` | Output JSON format | `false` |

### Human-Readable Output

By default, the stats command outputs a human-readable summary:

```bash
bass-agents memory stats auth-service --range 30d
```

Output:
```
Memory Statistics for auth-service
Date Range: 30d
============================================================

Total Entries: 156
Active Entries: 142
Average Confidence: 0.73
Low Confidence Entries: 8
Stale Evidence: 3

Entries by Section:
  decisions: 45
  state: 32
  observations: 51
  learnings: 28

Entries by Status:
  active: 142
  superseded: 12
  deprecated: 2

Confidence Distribution:
  0.0-0.2: 2
  0.2-0.4: 6
  0.4-0.6: 18
  0.6-0.8: 67
  0.8-1.0: 63

Evidence Types:
  code: 89
  artifact: 34
  ticket: 21
  doc: 18
  assumption: 12

Most Active Agents (Top 5):
  context-gatherer: 45 entries
  feature-design-first-workflow: 32 entries
  spec-task-execution: 28 entries
  general-task-execution: 24 entries
  bugfix-workflow: 15 entries

Lifecycle Metrics:
  Superseded: 7.7%
  Compaction Candidates: 12
  Entries Approaching Expiry: 3

Recent Operations (Last 5):
  2026-02-22 14:32:15 | create | agent-123 | Added authentication decision
  2026-02-22 14:28:42 | supersede | agent-456 | Updated API endpoint state
  2026-02-22 14:15:03 | create | agent-789 | Observed performance issue
  2026-02-22 13:58:21 | create | agent-123 | Learned caching pattern
  2026-02-22 13:42:09 | deprecate | agent-456 | Deprecated old config
```

### JSON Output

For programmatic access, use the `--json` flag:

```bash
bass-agents memory stats auth-service --json
```

Output:
```json
{
  "total_entries": 156,
  "entries_by_section": {
    "decisions": 45,
    "state": 32,
    "observations": 51,
    "learnings": 28
  },
  "entries_by_status": {
    "active": 142,
    "superseded": 12,
    "deprecated": 2
  },
  "entries_by_kind": {
    "decision": 38,
    "requirement": 12,
    "invariant": 8,
    "incident": 15,
    "metric": 24,
    "hypothesis": 9,
    "runbook_step": 6,
    "other": 44
  },
  "avg_confidence": 0.73,
  "confidence_distribution": {
    "0.0-0.2": 2,
    "0.2-0.4": 6,
    "0.4-0.6": 18,
    "0.6-0.8": 67,
    "0.8-1.0": 63
  },
  "evidence_type_distribution": {
    "code": 89,
    "artifact": 34,
    "ticket": 21,
    "doc": 18,
    "log": 8,
    "screenshot": 4,
    "assumption": 12
  },
  "low_confidence_count": 8,
  "stale_evidence_count": 3,
  "entries_created_over_time": [
    { "date": "2026-02-15", "count": 12 },
    { "date": "2026-02-16", "count": 8 },
    { "date": "2026-02-17", "count": 15 }
  ],
  "entries_superseded_over_time": [
    { "date": "2026-02-18", "count": 2 },
    { "date": "2026-02-20", "count": 1 }
  ],
  "entries_by_agent": {
    "context-gatherer": 45,
    "feature-design-first-workflow": 32,
    "spec-task-execution": 28
  },
  "most_active_agents": [
    { "agent": "context-gatherer", "count": 45 },
    { "agent": "feature-design-first-workflow", "count": 32 }
  ],
  "recent_operations": [
    {
      "timestamp": "2026-02-22T14:32:15Z",
      "operation": "create",
      "entry_id": "bd-a1b2c3",
      "agent": "agent-123",
      "summary": "Added authentication decision"
    }
  ],
  "superseded_percentage": 7.7,
  "entries_approaching_expiry": [
    {
      "entry_id": "bd-x1y2z3",
      "summary": "API rate limit configuration",
      "valid_to": "2026-02-28T00:00:00Z",
      "days_remaining": 5
    }
  ],
  "compaction_candidates": 12
}
```

## Examples

### Example 1: Launching Dashboard for a Project

Monitor the auth-service project's memory system:

```bash
bass-agents memory dashboard auth-service
```

**What you'll see:**
- Real-time statistics about auth-service memory entries
- Growth trends showing how memory is accumulating
- Distribution of entries across sections
- Active agents creating memory entries
- Any entries approaching expiry

**When to use:**
- During active development to monitor memory growth
- After major changes to verify memory is being created correctly
- To identify which agents are most active
- To check for entries needing attention (low confidence, expiring soon)

### Example 2: Using Stats Command for Programmatic Access

Get statistics in JSON format for integration with monitoring tools:

```bash
bass-agents memory stats auth-service --json > stats.json
```

**What you'll get:**
- Complete statistics in machine-readable JSON format
- Can be parsed by scripts or monitoring tools
- Suitable for CI/CD pipelines or automated reporting

**When to use:**
- Building custom dashboards or reports
- Integrating with monitoring systems (Grafana, Datadog, etc.)
- Automated quality checks in CI/CD
- Generating periodic reports

### Example 3: Interpreting Dashboard Metrics

**Scenario:** You notice the average confidence is 0.45 (yellow/red)

**What it means:**
- Many entries have low confidence scores
- Memory quality may be degrading
- Agents might be creating speculative entries

**Actions to take:**
1. Review low-confidence entries: `bass-agents memory list --min-confidence 0 | grep "0\.[0-4]"`
2. Check evidence quality for these entries
3. Consider deprecating or superseding low-confidence entries
4. Investigate why agents are creating low-confidence entries

**Scenario:** You see 25 entries approaching expiry (red indicator)

**What it means:**
- Many state entries will expire soon
- These entries may need review and renewal
- System state knowledge may become stale

**Actions to take:**
1. Check expiring entries: `bass-agents memory check-freshness auth-service`
2. Review each entry to determine if it's still valid
3. Update `valid_to` timestamps for entries that should continue
4. Deprecate entries that are no longer relevant

### Example 4: Identifying Issues from Dashboard

**Issue 1: Stale Evidence Count is High (> 20)**

**Symptoms:**
- Red indicator on "Stale Evidence" metric
- Many evidence URIs are unreachable

**Diagnosis:**
```bash
bass-agents memory validate-evidence auth-service
```

**Resolution:**
- Update evidence URIs to point to current locations
- Remove entries with permanently broken evidence
- Consider using more stable evidence types (code permalinks vs. relative paths)

**Issue 2: Compaction Candidates Growing**

**Symptoms:**
- "Compaction Needed" count is high (> 50)
- Many superseded entries accumulating

**Diagnosis:**
```bash
bass-agents memory compact auth-service --dry-run
```

**Resolution:**
```bash
# Review the compaction plan
bass-agents memory compact auth-service --dry-run

# Apply compaction if plan looks good
bass-agents memory compact auth-service
```

**Issue 3: Low Agent Activity**

**Symptoms:**
- Growth trend chart shows flat line
- Few recent operations
- Most active agents list is short

**Diagnosis:**
- Check if agents have `memory_enabled: true` in their tasks
- Verify memory is initialized: `bass-agents memory list auth-service`
- Review agent logs for memory-related errors

**Resolution:**
- Enable memory in agent tasks
- Initialize memory if needed: `bass-agents memory init auth-service`
- Check agent configuration and permissions

## Interpreting Metrics

### Health Indicators

#### Average Confidence
- **0.8-1.0 (Green)**: Excellent - High-quality, well-evidenced entries
- **0.6-0.8 (Green)**: Good - Reliable entries with solid evidence
- **0.5-0.6 (Yellow)**: Fair - Some entries may need review
- **< 0.5 (Red)**: Poor - Many low-confidence entries need attention

#### Stale Evidence
- **0-5 (Green)**: Excellent - All evidence is reachable
- **6-20 (Yellow)**: Fair - Some evidence needs updating
- **> 20 (Red)**: Poor - Many broken evidence links

### Growth Patterns

#### Steady Growth
- Consistent daily entry creation
- Indicates healthy agent activity
- Normal for active projects

#### Spikes
- Sudden increase in entries
- May indicate:
  - Major feature development
  - Bulk import
  - Agent configuration change

#### Flat Line
- No new entries being created
- May indicate:
  - Project inactivity
  - Memory not enabled for agents
  - Configuration issue

### Section Distribution

#### Balanced Distribution
- Entries spread across all four sections
- Indicates comprehensive memory usage
- Healthy pattern for most projects

#### Skewed Distribution
- Most entries in one section
- May indicate:
  - **Heavy decisions**: Architecture-focused project
  - **Heavy state**: Configuration-heavy project
  - **Heavy observations**: Testing/debugging phase
  - **Heavy learnings**: Optimization/refinement phase

### Lifecycle Metrics

#### Superseded Percentage
- **< 10%**: Healthy - Most entries are current
- **10-25%**: Normal - Regular knowledge evolution
- **> 25%**: High - Consider running compaction

#### Compaction Candidates
- **< 20**: Low - No immediate action needed
- **20-50**: Medium - Consider compaction soon
- **> 50**: High - Run compaction to clean up

## Troubleshooting

### Dashboard Won't Launch

**Error:** "Project not found" or "Memory not initialized"

**Solution:**
```bash
# Initialize memory for the project
bass-agents memory init <project>

# Verify initialization
bass-agents memory list <project>
```

### Dashboard Shows No Data

**Possible causes:**
1. No memory entries exist yet
2. Date range filter excludes all entries
3. Project name is incorrect

**Solutions:**
```bash
# Check if entries exist
bass-agents memory list <project>

# Try without date range filter
bass-agents memory dashboard <project> --range all

# List all projects
ls ai-memory/
```

### Statistics Are Stale

**Symptom:** Dashboard shows old data despite recent changes

**Solution:**
```bash
# Bypass cache for fresh data
bass-agents memory dashboard <project> --no-cache

# Or press 'r' in the dashboard to refresh
```

### Dashboard Performance Issues

**Symptom:** Dashboard is slow to load or refresh

**Possible causes:**
1. Too many entries (> 1000)
2. Complex evidence validation
3. Large date range

**Solutions:**
```bash
# Use shorter date range
bass-agents memory dashboard <project> --range 7d

# Run compaction to reduce entry count
bass-agents memory compact <project>

# Use stats command instead for quick checks
bass-agents memory stats <project> --range 7d
```

### JSON Output Parsing Errors

**Symptom:** JSON output is malformed or incomplete

**Solution:**
```bash
# Ensure you're using --json flag
bass-agents memory stats <project> --json

# Redirect to file for inspection
bass-agents memory stats <project> --json > stats.json

# Validate JSON
cat stats.json | jq .
```

## Best Practices

### Regular Monitoring

1. **Daily Check**: Quick dashboard review during standup
   ```bash
   bass-agents memory dashboard <project> --range 7d
   ```

2. **Weekly Review**: Detailed analysis of trends
   ```bash
   bass-agents memory stats <project> --range 30d
   ```

3. **Monthly Cleanup**: Run compaction and evidence validation
   ```bash
   bass-agents memory compact <project>
   bass-agents memory validate-evidence <project>
   ```

### Automation

Integrate statistics into CI/CD:

```bash
#!/bin/bash
# check-memory-health.sh

PROJECT="auth-service"
STATS=$(bass-agents memory stats $PROJECT --json)

# Extract metrics
AVG_CONF=$(echo $STATS | jq -r '.avg_confidence')
STALE_COUNT=$(echo $STATS | jq -r '.stale_evidence_count')

# Check thresholds
if (( $(echo "$AVG_CONF < 0.6" | bc -l) )); then
  echo "WARNING: Average confidence is low: $AVG_CONF"
  exit 1
fi

if [ "$STALE_COUNT" -gt 20 ]; then
  echo "WARNING: Too many stale evidence entries: $STALE_COUNT"
  exit 1
fi

echo "Memory health check passed"
```

### Dashboard Workflows

**Development Workflow:**
1. Launch dashboard at start of day
2. Monitor growth trends during development
3. Check for low-confidence entries before commits
4. Review recent operations to understand agent behavior

**Maintenance Workflow:**
1. Check expiring entries weekly
2. Validate evidence monthly
3. Run compaction when candidates > 50
4. Review agent activity for anomalies

**Debugging Workflow:**
1. Use dashboard to identify issues (low confidence, stale evidence)
2. Use `show` command to inspect specific entries
3. Use `query` command to find related entries
4. Update or deprecate problematic entries

## Related Commands

- `bass-agents memory list` - List memory entries with filters
- `bass-agents memory show <id>` - Show full entry details
- `bass-agents memory query <text>` - Search memory content
- `bass-agents memory compact` - Consolidate superseded entries
- `bass-agents memory validate-evidence` - Check evidence URIs
- `bass-agents memory check-freshness` - List expiring entries

For complete command reference, see the main memory system documentation.
