---
inclusion: always
---
---
inclusion: always
---

# Tool Usage Guidelines

## Allowed Tools

All default Kiro tools are enabled for this workspace:
- File operations (read, write, search, list)
- Code analysis (diagnostics, symbol search)
- Shell commands (bash execution, process management)
- Web tools (search, fetch)
- Git operations (read, write, PR management)
- Spec workflow tools (task status, subagent invocation)

## Tool Usage Principles

### Token Efficiency
- Use targeted searches (`grepSearch`) over full file reads when exploring
- Prefer `readCode` for code files to get structured analysis
- Read multiple related files together with `readMultipleFiles`
- Avoid redundant reads of unchanged files

### File Operations
- Use `readFile` for documentation and config files
- Use `readCode` for source code to leverage AST parsing
- Use `fileSearch` when you know part of a filename but not its location
- Use `grepSearch` for content-based searches across the codebase

### Shell Commands
- Never use long-running commands (dev servers, watchers) directly
- Use `controlBashProcess` for background processes (start/stop)
- Use `getProcessOutput` to monitor background process logs
- Prefer `getDiagnostics` over bash commands for checking code issues

### Workflow Tools
- Use `invokeSubAgent` for delegating complex tasks to specialized agents
- Use `taskStatus` when executing spec tasks to track progress
- Use `userInput` when you need explicit user decisions or clarifications

## Project-Specific Patterns

### Agent Development
When working with `.agent` files in `agents/`:
- These are markdown files defining agent behavior
- Read them with `readFile` to understand agent specifications
- Follow the schema defined in `bass-agents-spec-v0.md`

### Field Notes
When creating or updating field notes in `field-notes/`:
- Use the template at `field-notes/TEMPLATE.md`
- Follow naming convention: `YYYY-MM-DD-<slug>.md`
- Organize by project folder

### Schema Validation
When working with JSON schemas in `schemas/`:
- Validate agent tasks against `agent-task.schema.json`
- Validate agent results against `agent-result.schema.json`
- Validate session reviews against `session-review-report.schema.json`

## Token Discipline

### Scope Control
- Work only in relevant directories for the current task
- Do not scan entire repo unless explicitly requested
- Use targeted searches instead of broad exploration

### Read Efficiency
- Prefer partial reads and searches over full-file dumps
- Reuse prior context instead of rereading unchanged files
- Keep command outputs minimal unless needed for decisions

### Retry Limits
- Maximum 2 retries for the same failing pattern
- After repeated failure, report blocker and propose alternative

### Stop Conditions
If token usage spikes without progress:
1. Pause and provide diagnostic
2. Identify what is consuming tokens
3. Propose a tighter, more focused plan 