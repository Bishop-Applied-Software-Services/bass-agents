# Requirements Document: Durable Memory for bass-agents

## Introduction

This document defines requirements for a durable memory system for bass-agents. The system enables agents to maintain evolving knowledge across sessions while keeping immediate context minimal. Memory is accessed on-demand rather than included in every agent run, allowing agents to build and refine long-term knowledge about projects, decisions, and state.

The durable memory system complements the existing ai-context/ folder (immediate context for all runs) by providing ai-memory/ (durable-but-evolving knowledge accessed when needed). All paths are workspace-relative and stored within the repository root.

This document contains 23 requirements covering memory storage, query operations, lifecycle management, CLI commands, integration with AgentTask/AgentResult, and analytics dashboard capabilities.

## Glossary

- **Memory_System**: The durable memory subsystem that stores and retrieves evolving knowledge
- **Context_System**: The existing ai-context/ folder that provides immediate context for all agent runs
- **Memory_Entry**: A single unit of stored knowledge with metadata (see Data Schemas section)
- **Memory_Section**: A logical grouping of memory entries (decisions, state, observations, learnings)
- **Memory_Kind**: A type classification for memory entries (decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other)
- **Memory_Subject**: A canonical entity key identifying what the memory is about (service name, repo module, team, customer segment, policy area)
- **Memory_Scope**: The context boundary for a memory entry (repo, service:<name>, org, customer, environment:<prod|staging>)
- **Memory_Status**: The lifecycle state of a memory entry (active, superseded, deprecated, draft)
- **Evidence_Reference**: A structured reference to supporting material for a memory entry, including type, URI, and contextual note
- **Agent_Run**: A single execution of an agent with an AgentTask input
- **CLI**: Command-line interface for bass-agents
- **Project_Memory**: Memory scoped to a specific project, stored at ai-memory/{project-name}/
- **Global_Memory**: Memory available across all projects, stored at ai-memory/global/
- **Memory_Query**: A request from an agent to retrieve relevant memory entries
- **Memory_Update**: An operation that creates or modifies memory entries (see Data Schemas section)
- **Memory_ID**: A unique identifier for a memory entry
- **Workspace_Root**: The root directory of the repository where ai-context/ and ai-memory/ reside
- **Dashboard**: A terminal-based analytics interface that visualizes memory system activity and metrics
- **Statistics**: Aggregated metrics about memory entries including counts, distributions, trends, and quality indicators

## Data Schemas

### Memory_Entry Schema

```json
{
  "id": "string (unique identifier, format determined by implementation)",
  "section": "string (one of: decisions, state, observations, learnings)",
  "kind": "string (one of: decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other)",
  "subject": "string (canonical entity key: service name, repo module, team, customer segment, policy area)",
  "scope": "string (repo | service:<name> | org | customer | environment:<prod|staging>)",
  "summary": "string (1-2 sentence distilled version, max 300 characters)",
  "content": "string (max 2000 characters)",
  "tags": "array of strings (flexible categorization)",
  "confidence": "number (0.0 to 1.0)",
  "evidence": "array of objects [{type, uri, note}] where type is one of: artifact, code, log, screenshot, assumption, ticket, doc",
  "status": "string (one of: active, superseded, deprecated, draft)",
  "superseded_by": "string | null (Memory_ID of replacement entry)",
  "related_entries": "array of strings (Memory_IDs of related entries)",
  "valid_from": "string | null (ISO 8601 timestamp, when entry becomes valid)",
  "valid_to": "string | null (ISO 8601 timestamp, when entry expires)",
  "created_by": "string (agent identifier)",
  "created_at": "string (ISO 8601 timestamp)",
  "updated_at": "string (ISO 8601 timestamp)"
}
```

### Memory_Update Schema

```json
{
  "operation": "string (one of: create, supersede, deprecate)",
  "entry": {
    "section": "string (required for create)",
    "kind": "string (required for create, one of: decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other)",
    "subject": "string (required for create, canonical entity key)",
    "scope": "string (required for create, repo | service:<name> | org | customer | environment:<prod|staging>)",
    "summary": "string (required for create, max 300 characters)",
    "content": "string (required, max 2000 characters)",
    "tags": "array of strings (optional)",
    "confidence": "number (required, 0.0 to 1.0)",
    "evidence": "array of objects (required, [{type, uri, note}])",
    "status": "string (optional, defaults to active for create)",
    "valid_from": "string | null (optional, ISO 8601 timestamp)",
    "valid_to": "string | null (optional, ISO 8601 timestamp)",
    "related_entries": "array of strings (optional, Memory_IDs)"
  },
  "target_id": "string (required for supersede/deprecate, Memory_ID to update)"
}
```

### AgentTask Extension

The AgentTask schema SHALL be extended with these optional fields:

```json
{
  "memory_enabled": "boolean (default: false)",
  "memory_context": "array of Memory_Entry objects (max 10 entries)"
}
```

### AgentResult Extension

The AgentResult schema SHALL be extended with this optional field:

```json
{
  "memory_updates": "array of Memory_Update objects"
}
```

## Requirements

### Requirement 1: Memory vs Context Separation

**User Story:** As a developer, I want clear guidance on when to use memory vs context, so that I can organize agent knowledge effectively.

#### Acceptance Criteria

1. THE Documentation SHALL define context as "minimum stable knowledge included in every agent run"
2. THE Documentation SHALL define memory as "durable evolving knowledge accessed only when needed"
3. THE Documentation SHALL provide decision criteria: use context for stable contracts and schemas, use memory for project-specific decisions and evolving state
4. THE Documentation SHALL specify that context files are read-only during agent runs, while memory entries can be updated by agents
5. THE Documentation SHALL state that context changes require manual updates, while memory evolves automatically through agent operations

### Requirement 2: Memory Storage Structure

**User Story:** As an agent, I want memory organized into clear sections, so that I can efficiently store and retrieve different types of knowledge.

#### Acceptance Criteria

1. THE Memory_System SHALL organize memory entries into four sections: decisions, state, observations, learnings
2. THE Memory_System SHALL store Project_Memory at workspace-relative path ai-memory/{project-name}/
3. THE Memory_System SHALL store Global_Memory at workspace-relative path ai-memory/global/
4. THE Memory_System SHALL assign each Memory_Entry a unique Memory_ID
5. THE Memory_System SHALL store all Memory_Entry fields defined in the Data Schemas section including: id, section, kind, subject, scope, summary, content, tags, confidence, evidence, status, superseded_by, related_entries, valid_from, valid_to, created_by, created_at, updated_at
6. THE Memory_System SHALL support relationships between memory entries via the related_entries field
7. THE Memory_System SHALL NOT write memory data outside the workspace root directory
8. THE Memory_System SHALL index entries by subject, scope, kind, and tags for efficient querying

### Requirement 3: Memory Entry Quality

**User Story:** As a developer, I want memory entries to include confidence and evidence metadata, so that I can assess reliability of stored knowledge.

#### Acceptance Criteria

1. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require a confidence score between 0.0 and 1.0
2. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require at least one evidence object in the evidence array
3. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require kind field from: decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other
4. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require subject field as a canonical entity key
5. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require scope field matching pattern: repo | service:<name> | org | customer | environment:<prod|staging>
6. WHEN an agent creates a Memory_Entry, THE Memory_System SHALL require summary field with max 300 characters
7. THE Memory_System SHALL store the creating agent identifier in the created_by field
8. THE Memory_System SHALL store creation timestamp in ISO 8601 format in the created_at field
9. THE Memory_System SHALL store modification timestamp in ISO 8601 format in the updated_at field
10. WHEN a Memory_Entry confidence is below 0.5, THE Memory_System SHALL mark it as low-confidence in query results

### Requirement 4: Memory Query Operations

**User Story:** As an agent, I want to query memory, so that I can make informed decisions based on past learnings.

#### Acceptance Criteria

1. WHEN an agent issues a Memory_Query, THE Memory_System SHALL retrieve matching Memory_Entry records
2. WHEN an agent issues a Memory_Query with section filter, THE Memory_System SHALL return only entries from specified sections
3. WHEN an agent issues a Memory_Query with kind filter, THE Memory_System SHALL return only entries matching the specified kind
4. WHEN an agent issues a Memory_Query with scope filter, THE Memory_System SHALL return only entries matching the specified scope
5. WHEN an agent issues a Memory_Query with subject filter, THE Memory_System SHALL return only entries matching the specified subject
6. WHEN an agent issues a Memory_Query with tags filter, THE Memory_System SHALL return only entries containing all specified tags
7. WHEN an agent issues a Memory_Query with recency filter, THE Memory_System SHALL filter by created_at or updated_at timestamps
8. THE Memory_System SHALL return Memory_Entry results as JSON conforming to the Memory_Entry schema
9. WHEN no entries match a Memory_Query, THE Memory_System SHALL return an empty array without error
10. THE Memory_System SHALL limit query results to 50 entries maximum to prevent token bloat
11. WHEN an agent requests related entries, THE Memory_System SHALL follow related_entries links and include connected entries
12. WHEN an agent requests summary-only results, THE Memory_System SHALL return only id, summary, subject, scope, kind, and confidence fields to reduce token usage

### Requirement 5: Memory Update Operations

**User Story:** As an agent, I want to add and update memory entries, so that I can record decisions and learnings for future runs.

#### Acceptance Criteria

1. WHEN an agent completes an Agent_Run, THE Memory_System SHALL create new Memory_Entry records from Memory_Update operations with operation "create"
2. WHEN an agent identifies outdated knowledge, THE Memory_System SHALL mark entries as superseded via Memory_Update operations with operation "supersede"
3. WHEN an agent identifies historically relevant but no longer current knowledge, THE Memory_System SHALL mark entries as deprecated via Memory_Update operations with operation "deprecate"
4. WHEN an agent marks an entry as superseded, THE Memory_System SHALL set the status field to "superseded" and populate superseded_by with the replacement Memory_ID
5. WHEN an agent marks an entry as deprecated, THE Memory_System SHALL set the status field to "deprecated" without requiring a replacement entry
6. THE Memory_System SHALL preserve superseded and deprecated entries for audit trail (no deletion)
7. WHEN an agent submits a Memory_Update, THE Memory_System SHALL validate that confidence, evidence array, kind, subject, scope, and summary are provided
8. THE Memory_System SHALL reject Memory_Update operations with content exceeding 2000 characters
9. THE Memory_System SHALL reject Memory_Update operations with summary exceeding 300 characters
10. THE Memory_System SHALL update the updated_at timestamp when modifying existing entries
11. WHEN an agent submits a Memory_Update with status "draft", THE Memory_System SHALL exclude the entry from default queries until status changes to "active"

### Requirement 6: Memory Lifecycle Management

**User Story:** As a developer, I want memory to evolve and stay compact, so that it remains useful without growing unbounded.

#### Acceptance Criteria

1. THE Memory_System SHALL support consolidation of old superseded memory entries
2. WHEN memory for a project exceeds 100 entries, THE Memory_System SHALL provide a warning suggesting consolidation
3. WHEN consolidation runs, THE Memory_System SHALL preserve original entries in history
4. THE Memory_System SHALL provide a log of what was consolidated and when
5. THE Memory_System SHALL allow manual review before applying consolidation changes
6. WHEN a Memory_Entry is marked as superseded, THE Memory_System SHALL mark it as candidate for consolidation
7. THE Memory_System SHALL exclude superseded entries from default query results unless explicitly requested
8. THE Memory_System SHALL exclude deprecated entries from default query results unless explicitly requested
9. THE Memory_System SHALL exclude draft entries from default query results unless explicitly requested
10. WHEN querying memory, THE Memory_System SHALL default to status="active" and confidence>=0.6 unless overridden

### Requirement 7: CLI Memory Management

**User Story:** As a developer, I want CLI commands to inspect and manage memory, so that I can understand and control what agents remember.

#### Acceptance Criteria

1. THE CLI SHALL provide command `bass-agents memory list [project]` to display memory entries
2. THE CLI SHALL provide command `bass-agents memory show <entry-id>` to display full entry details
3. THE CLI SHALL provide command `bass-agents memory query <text>` to search memory content
4. THE CLI SHALL provide command `bass-agents memory compact [project]` to trigger consolidation
5. THE CLI SHALL provide command `bass-agents memory init <project>` to initialize memory storage for a new project
6. THE CLI SHALL provide command `bass-agents memory validate-evidence [project]` to check all evidence URIs
7. THE CLI SHALL provide command `bass-agents memory check-freshness [project]` to list entries approaching expiry
8. THE CLI SHALL provide command `bass-agents memory sync-context <project>` to generate ai-context/ summaries from high-confidence memory entries
9. WHEN listing memory, THE CLI SHALL display: Memory_ID, timestamp, section, kind, subject, scope, confidence, and first 80 characters of summary
10. WHEN showing memory details, THE CLI SHALL display all Memory_Entry fields including evidence array, status, tags, and valid_from/valid_to
11. WHEN initializing memory, THE CLI SHALL create directory ai-memory/{project-name}/ at workspace root
12. WHEN initializing memory, THE CLI SHALL create configuration metadata with project name and creation timestamp
13. WHEN querying memory, THE CLI SHALL support filters: --section, --kind, --scope, --subject, --tags, --status, --min-confidence

### Requirement 8: Memory Integration with AgentTask

**User Story:** As an agent orchestrator, I want to optionally include relevant memory in AgentTask, so that agents receive necessary context without manual intervention.

#### Acceptance Criteria

1. WHEN creating an AgentTask with memory_enabled set to true, THE Memory_System SHALL query relevant entries based on project, goal, scope, and subject
2. THE Memory_System SHALL populate the memory_context field with up to 10 Memory_Entry objects
3. THE Memory_System SHALL select entries with highest confidence scores when limiting results
4. THE Memory_System SHALL exclude entries with status="superseded", status="deprecated", or status="draft" from memory_context
5. THE Memory_System SHALL exclude entries where valid_to is expired from memory_context
6. WHEN an AgentTask includes memory_context, THE agent SHALL have read access to those entries
7. WHEN memory_enabled is false or omitted, THE Memory_System SHALL NOT populate memory_context
8. WHEN populating memory_context, THE Memory_System SHALL prefer entries with evidence type "code" or "artifact" over other evidence types
9. WHEN populating memory_context, THE Memory_System SHALL include summary field to reduce token usage, with full content available on-demand

### Requirement 9: Memory Integration with AgentResult

**User Story:** As an agent, I want to record memory updates in AgentResult, so that learnings are captured automatically after each run.

#### Acceptance Criteria

1. WHEN an agent produces an AgentResult with memory_updates, THE Memory_System SHALL apply those updates after validation
2. THE Memory_System SHALL validate each Memory_Update for required fields (operation, entry.content, entry.confidence, entry.evidence, entry.kind, entry.subject, entry.scope, entry.summary) before applying
3. IF a Memory_Update validation fails, THEN THE Memory_System SHALL log the error and skip that update without failing the entire result
4. THE Memory_System SHALL record which Agent_Run produced each Memory_Entry by storing the agent identifier in created_by
5. THE Memory_System SHALL allow agent runs to proceed even if memory is not initialized (graceful degradation)
6. WHEN an agent attempts Memory_Update on uninitialized memory, THE Memory_System SHALL auto-initialize with default configuration
7. WHEN an agent creates a Memory_Entry with section="state", THE Memory_System SHALL validate that valid_from and valid_to are provided

### Requirement 10: Memory Section Semantics

**User Story:** As an agent, I want clear semantics for each memory section, so that I store knowledge in the appropriate location.

#### Acceptance Criteria

1. THE Documentation SHALL define "decisions" section as: architectural choices, trade-offs, and rationale
2. THE Documentation SHALL define "state" section as: current project status, active issues, and configuration
3. THE Documentation SHALL define "observations" section as: findings from agent runs, test results, and empirical data
4. THE Documentation SHALL define "learnings" section as: patterns discovered, failure modes, and optimization insights
5. THE Memory_System SHALL validate that Memory_Entry section field matches one of the four defined sections
6. THE Documentation SHALL provide examples of appropriate entries for each section
7. THE Documentation SHALL provide guidance on choosing kind values: use "decision" for architectural choices, "requirement" for functional needs, "invariant" for system properties, "incident" for production issues, "metric" for performance data, "hypothesis" for unproven theories, "runbook_step" for operational procedures
8. THE Documentation SHALL provide guidance on choosing subject values: use canonical entity keys like "service-name.module-name" or "team-name.policy-area"
9. THE Documentation SHALL provide guidance on choosing scope values: use "repo" for cross-cutting concerns, "service:<name>" for service-specific knowledge, "org" for organization-wide policies, "environment:<prod|staging>" for environment-specific state

### Requirement 11: Memory Query Performance

**User Story:** As an agent, I want memory queries to complete quickly, so that they don't slow down agent runs significantly.

#### Acceptance Criteria

1. THE Memory_System SHALL optimize query operations for fast retrieval
2. WHEN query performance degrades, THE Memory_System SHALL log a performance warning
3. THE Memory_System SHALL provide query statistics (execution time, entries scanned, entries returned) in debug mode

### Requirement 12: Memory Conflict Resolution

**User Story:** As a developer, I want conflict-free memory updates when multiple agents work concurrently, so that knowledge remains consistent.

#### Acceptance Criteria

1. THE Memory_System SHALL handle concurrent memory writes without data corruption
2. WHEN multiple agents create entries simultaneously, THE Memory_System SHALL assign unique Memory_IDs to each
3. IF a write conflict occurs, THEN THE Memory_System SHALL use a conflict resolution strategy (last-write-wins or merge)
4. THE Memory_System SHALL log all concurrent write attempts for debugging
5. THE Memory_System SHALL provide version history for memory entries to track changes over time

### Requirement 13: Memory Privacy and Security

**User Story:** As a developer, I want memory to exclude sensitive data, so that I can safely share or export memory without leaking secrets.

#### Acceptance Criteria

1. THE Memory_System SHALL reject Memory_Entry content containing detected secrets
2. THE Memory_System SHALL reject Memory_Entry evidence URIs containing detected secrets
3. THE Memory_System SHALL integrate with established secret detection tools or libraries (e.g., detect-secrets, truffleHog patterns)
4. THE Memory_System SHALL scan for common secret patterns including: API keys, tokens, passwords, private keys, connection strings, OAuth secrets
5. WHEN a Memory_Entry contains detected secrets, THE Memory_System SHALL reject the entry and return a descriptive error
6. THE Documentation SHALL instruct agents to use placeholder values like [API_KEY] instead of actual secrets
7. THE Memory_System SHALL provide a validation function that agents can call before submitting Memory_Update operations
8. THE Memory_System SHALL log secret detection events (without logging the secret itself) for security auditing
9. THE Memory_System SHALL validate that evidence URIs do not expose sensitive paths or credentials

### Requirement 14: Memory Export and Import

**User Story:** As a developer, I want to export and import memory, so that I can back up knowledge or share it across environments.

#### Acceptance Criteria

1. THE CLI SHALL provide command `bass-agents memory export <project> <output-path>` to save memory to a file
2. THE CLI SHALL provide command `bass-agents memory import <project> <input-path>` to load memory from a file
3. WHEN exporting memory, THE Memory_System SHALL write all Memory_Entry records to JSON format
4. WHEN importing memory, THE Memory_System SHALL validate each Memory_Entry against the schema before loading
5. WHEN importing memory with conflicting entry IDs, THE Memory_System SHALL use a conflict resolution strategy (skip, overwrite, or merge)
6. THE Memory_System SHALL support exporting memory to git-compatible formats for version control
7. THE Memory_System SHALL provide export filtering options (by section, by date range, by confidence threshold)

### Requirement 15: Smart Retrieval Rules

**User Story:** As an agent, I want memory queries to return the most relevant and reliable entries, so that I can make decisions based on high-quality context.

#### Acceptance Criteria

1. WHEN an agent issues a Memory_Query without explicit filters, THE Memory_System SHALL default to status="active" and confidence>=0.6
2. WHEN an agent queries section="state", THE Memory_System SHALL exclude entries where valid_to is expired (current timestamp > valid_to)
3. WHEN an agent queries section="state", THE Memory_System SHALL down-rank entries where valid_to is within 7 days of expiry
4. WHEN ranking query results, THE Memory_System SHALL prefer entries with evidence type "code" or "artifact" over evidence type "assumption"
5. WHEN an agent provides scope and subject filters, THE Memory_System SHALL apply those filters before semantic search to reduce noise
6. WHEN an agent queries without scope filter, THE Memory_System SHALL include entries with scope="repo" and scope="org" by default
7. WHEN an agent queries with scope="service:<name>", THE Memory_System SHALL include entries with scope="service:<name>", scope="repo", and scope="org"
8. THE Memory_System SHALL sort query results by: confidence (descending), then evidence quality (code/artifact > ticket/doc > log/screenshot > assumption), then recency (updated_at descending)

### Requirement 16: Memory Write Policy

**User Story:** As a system administrator, I want clear policies for what agents can write to memory, so that memory remains high-quality and doesn't become a junk drawer.

#### Acceptance Criteria

1. THE Documentation SHALL define write policy: agents MAY create entries with status="draft" without evidence requirements
2. THE Documentation SHALL define write policy: agents MUST provide at least one evidence object to create entries with status="active"
3. THE Documentation SHALL define write policy: agents MUST provide evidence with type "code", "artifact", "ticket", or "doc" for kind="decision", kind="requirement", or kind="invariant"
4. THE Documentation SHALL define write policy: agents SHOULD mark entries as superseded when creating a replacement entry, not deprecated
5. THE Documentation SHALL define write policy: agents SHOULD mark entries as deprecated when knowledge is no longer current but historically relevant
6. THE Documentation SHALL define write policy: agents MUST NOT create duplicate entries with identical subject, scope, and summary
7. WHEN an agent attempts to create a Memory_Entry violating write policy, THE Memory_System SHALL reject the entry and return a descriptive error
8. THE Memory_System SHALL provide a validation function that agents can call before submitting Memory_Update operations

### Requirement 17: Scope-Based Access Control

**User Story:** As an agent, I want to filter memory by scope, so that I only see relevant context and avoid pollution from unrelated memories.

#### Acceptance Criteria

1. WHEN an agent queries memory with scope="service:<name>", THE Memory_System SHALL return only entries matching that scope plus repo and org scopes
2. WHEN an agent queries memory with scope="environment:<prod>", THE Memory_System SHALL return only entries matching that environment plus repo and org scopes
3. WHEN an agent queries memory with scope="customer", THE Memory_System SHALL return only entries with scope="customer", scope="repo", and scope="org"
4. THE Memory_System SHALL support scope hierarchy: org > repo > service:<name> > environment:<env>
5. THE Memory_System SHALL allow agents to explicitly request all scopes by omitting scope filter
6. THE Documentation SHALL provide guidance on choosing appropriate scope for different types of knowledge
7. THE Documentation SHALL provide examples: service-specific decisions use scope="service:<name>", cross-cutting concerns use scope="repo"

### Requirement 18: Evidence Validation

**User Story:** As a developer, I want evidence references to be validated, so that memory entries link to reachable and well-formed sources.

#### Acceptance Criteria

1. WHEN an agent creates a Memory_Entry with evidence, THE Memory_System SHALL validate that each evidence object contains type, uri, and note fields
2. WHEN an agent creates a Memory_Entry with evidence type "code", THE Memory_System SHALL validate that uri is a git permalink or file path
3. WHEN an agent creates a Memory_Entry with evidence type "ticket", THE Memory_System SHALL validate that uri matches a ticket URL pattern
4. WHEN an agent creates a Memory_Entry with evidence type "doc", THE Memory_System SHALL validate that uri is a valid URL or file path
5. THE Memory_System SHALL log when evidence URIs become unreachable (404, file not found) during periodic validation
6. THE Memory_System SHALL provide a command `bass-agents memory validate-evidence [project]` to check all evidence URIs
7. WHEN evidence validation detects stale URIs, THE Memory_System SHALL mark affected entries with a warning flag
8. THE Memory_System SHALL down-rank entries with stale evidence in query results

### Requirement 19: Freshness Management

**User Story:** As an agent, I want memory entries to have freshness controls, so that stale state doesn't mislead future decisions.

#### Acceptance Criteria

1. WHEN an agent creates a Memory_Entry with section="state", THE Memory_System SHALL require valid_from and valid_to timestamps
2. WHEN querying section="state", THE Memory_System SHALL automatically exclude entries where current timestamp > valid_to
3. WHEN querying section="state", THE Memory_System SHALL down-rank entries where valid_to is within 7 days of current timestamp
4. THE Memory_System SHALL provide a command `bass-agents memory check-freshness [project]` to list entries approaching expiry
5. WHEN an entry is within 7 days of expiry, THE Memory_System SHALL include a warning in query results
6. THE Memory_System SHALL support review_interval metadata for periodic validation of state entries
7. THE Documentation SHALL provide guidance: state entries should have valid_to set, other sections may omit freshness controls
8. WHEN an agent updates a Memory_Entry, THE Memory_System SHALL allow extending valid_to to reflect renewed validity

### Requirement 20: Integration with Repository Layout

**User Story:** As a developer, I want memory to integrate with existing repository conventions, so that knowledge is organized consistently.

#### Acceptance Criteria

1. THE Documentation SHALL define ai-context/ as always-loaded curated context, potentially generated from top memory subjects
2. THE Documentation SHALL define ai-memory/ as durable evolving knowledge accessed on-demand
3. THE Memory_System SHALL support storing human-readable memory exports at ai-memory/entries/*.json or ai-memory/memory.jsonl
4. THE Memory_System SHALL support referencing ADRs and RFCs as evidence URIs in Memory_Entry evidence arrays
5. THE Documentation SHALL provide examples of evidence URIs: git permalinks, ADR file paths, RFC file paths, ticket URLs
6. THE Memory_System SHALL provide a command `bass-agents memory sync-context <project>` to generate ai-context/ summaries from high-confidence memory entries
7. WHEN syncing context, THE Memory_System SHALL select entries with confidence>=0.8, status="active", and evidence type "code" or "artifact"


### Requirement 21: Memory Analytics Dashboard

**User Story:** As a developer, I want a dashboard to visualize memory system activity, so that I can understand what the system is doing and validate it's working correctly.

#### Acceptance Criteria

1. THE CLI SHALL provide command `bass-agents memory dashboard [project]` to launch an analytics dashboard
2. THE Dashboard SHALL display memory statistics: total entries, entries by section, entries by status, average confidence score
3. THE Dashboard SHALL display memory growth trends: entries created over time, entries superseded over time
4. THE Dashboard SHALL display memory quality metrics: confidence score distribution, evidence type distribution, low-confidence entry count
5. THE Dashboard SHALL display agent activity: entries created by agent, most active agents, recent agent operations
6. THE Dashboard SHALL display query patterns: most queried subjects, most queried scopes, query frequency over time
7. THE Dashboard SHALL display lifecycle metrics: superseded entry percentage, entries approaching expiry, stale evidence count
8. THE Dashboard SHALL auto-refresh data every 30 seconds when running
9. THE Dashboard SHALL support filtering by date range (last 7 days, last 30 days, all time)
10. THE Dashboard SHALL support filtering by project (single project or all projects)

### Requirement 22: Memory Statistics API

**User Story:** As a developer, I want programmatic access to memory statistics, so that I can build custom analytics or integrate with monitoring tools.

#### Acceptance Criteria

1. THE Memory_System SHALL provide a getStatistics(project, dateRange) method
2. THE Statistics SHALL include: total_entries, entries_by_section, entries_by_status, entries_by_kind, avg_confidence, confidence_distribution
3. THE Statistics SHALL include: entries_created_over_time (time series), entries_superseded_over_time (time series)
4. THE Statistics SHALL include: evidence_type_distribution, low_confidence_count, stale_evidence_count
5. THE Statistics SHALL include: entries_by_agent, most_active_agents, recent_operations
6. THE Statistics SHALL include: most_queried_subjects, most_queried_scopes, query_frequency_over_time
7. THE Statistics SHALL include: superseded_percentage, entries_approaching_expiry, compaction_candidates
8. THE Statistics SHALL be returned as JSON conforming to a Statistics schema
9. THE Statistics SHALL be computed efficiently without scanning all entries for every request
10. THE Statistics SHALL support date range filtering (start_date, end_date)

### Requirement 23: Dashboard Visualization

**User Story:** As a developer, I want clear visualizations of memory metrics, so that I can quickly identify trends and issues.

#### Acceptance Criteria

1. THE Dashboard SHALL display a summary panel with key metrics: total entries, active entries, avg confidence, stale evidence count
2. THE Dashboard SHALL display a line chart showing memory growth over time (entries created per day)
3. THE Dashboard SHALL display a pie chart showing entries by section (decisions, state, observations, learnings)
4. THE Dashboard SHALL display a bar chart showing confidence score distribution (0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
5. THE Dashboard SHALL display a bar chart showing evidence type distribution
6. THE Dashboard SHALL display a table showing top 10 most active agents with entry counts
7. THE Dashboard SHALL display a table showing entries approaching expiry (within 7 days)
8. THE Dashboard SHALL display a table showing recent operations (last 20 create/supersede/deprecate operations)
9. THE Dashboard SHALL use color coding: green for healthy metrics, yellow for warnings, red for issues
10. THE Dashboard SHALL be responsive and work in terminal environments
