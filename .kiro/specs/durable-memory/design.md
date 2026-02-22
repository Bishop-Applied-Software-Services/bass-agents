# Technical Design: Durable Memory for bass-agents

## Overview

The durable memory system provides production-grade persistent knowledge storage for bass-agents, enabling agents to maintain and evolve understanding across sessions. The system uses Beads (https://github.com/steveyegge/beads) as the underlying storage layer, mapping sophisticated Memory_Entry schemas to Beads' issue tracking structure.

### Design Philosophy

The design leverages Beads' native capabilities wherever possible rather than building custom abstractions:

- Beads' hash-based IDs provide conflict-free distributed writes
- Beads' dependency graph models memory relationships naturally
- Beads' labels/tags enable flexible categorization
- Beads' git integration provides version history and export/import
- Beads' issue structure maps cleanly to Memory_Entry fields

The system provides a thin CLI wrapper that translates between Memory_Entry JSON and Beads commands, maintaining simplicity while meeting all requirements.

### Key Capabilities

- Workspace-relative storage at ai-memory/{project-name}/
- Four memory sections: decisions, state, observations, learnings
- Rich metadata: confidence, evidence, scope, subject, kind
- Smart retrieval with filtering and ranking
- Lifecycle management: active, superseded, deprecated, draft
- Conflict-free concurrent writes via Beads' hash-based IDs
- Git-based export/import and version history
- Secret detection and validation
- Integration with AgentTask/AgentResult schemas

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     bass-agents CLI                          │
│  (memory list, show, query, compact, init, validate, etc.)  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Memory Adapter Layer                        │
│  - Memory_Entry ↔ Beads Issue translation                   │
│  - Query translation (filters → bd commands)                 │
│  - Validation (schema, secrets, evidence)                    │
│  - Smart retrieval rules                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Beads Storage Layer                       │
│  - bd init, create, list, show, update                       │
│  - Hash-based IDs (bd-XXXX)                                  │
│  - Dependency graph (related_entries, superseded_by)         │
│  - Labels/tags (section, kind, scope, status)                │
│  - Custom fields (confidence, evidence, valid_from/to)       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Git Repository (ai-memory/)                     │
│  - ai-memory/{project-name}/.beads/                          │
│  - ai-memory/{project-name}/memory.jsonl (export)            │
│  - Version history, branching, merging                       │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**bass-agents CLI**: User-facing commands for memory operations. Parses arguments, invokes Memory Adapter, formats output.

**Memory Adapter Layer**: Core business logic. Translates between Memory_Entry JSON and Beads issue format. Implements validation, smart retrieval rules, and write policies.

**Beads Storage Layer**: Persistent storage using Beads issue tracking. Provides CRUD operations, dependency management, and git integration.

**Git Repository**: Version control and export format. Enables backup, sharing, and conflict resolution.

### Data Flow: Memory Write

```
Agent produces AgentResult with memory_updates
         ↓
Memory Adapter validates Memory_Update
         ↓
Memory Adapter checks for secrets
         ↓
Memory Adapter checks for duplicates
         ↓
Memory Adapter translates to Beads issue format
         ↓
Memory Adapter calls: bd create --title "..." --body "..." --label "..."
         ↓
Beads creates issue with hash-based ID (bd-XXXX)
         ↓
Memory Adapter stores ID mapping
         ↓
Git commit (automatic via Beads)
```

### Data Flow: Memory Query

```
Agent issues Memory_Query with filters
         ↓
Memory Adapter applies smart retrieval rules
         ↓
Memory Adapter translates filters to bd list command
         ↓
Memory Adapter calls: bd list --label "section:decisions" --label "status:active"
         ↓
Beads returns matching issues
         ↓
Memory Adapter translates Beads issues to Memory_Entry JSON
         ↓
Memory Adapter ranks by confidence, evidence quality, recency
         ↓
Memory Adapter limits to 50 entries
         ↓
Return Memory_Entry array to agent
```

## Components and Interfaces

### Memory Adapter API

The Memory Adapter provides the core API for memory operations:

```typescript
interface MemoryAdapter {
  // Initialization
  init(project: string): Promise<void>;
  
  // Query operations
  query(filters: MemoryQueryFilters): Promise<MemoryEntry[]>;
  get(id: string): Promise<MemoryEntry | null>;
  getRelated(id: string): Promise<MemoryEntry[]>;
  
  // Write operations
  create(entry: MemoryEntryInput): Promise<string>; // returns Memory_ID
  supersede(targetId: string, replacementEntry: MemoryEntryInput): Promise<string>;
  deprecate(targetId: string): Promise<void>;
  
  // Validation
  validate(entry: MemoryEntryInput): ValidationResult;
  validateEvidence(project: string): Promise<EvidenceValidationReport>;
  
  // Lifecycle
  compact(project: string, dryRun: boolean): Promise<CompactionReport>;
  checkFreshness(project: string): Promise<FreshnessReport>;
  
  // Export/Import
  export(project: string, outputPath: string, filters?: ExportFilters): Promise<void>;
  import(project: string, inputPath: string, conflictStrategy: ConflictStrategy): Promise<ImportReport>;
  
  // Context sync
  syncContext(project: string): Promise<void>;
}

interface MemoryQueryFilters {
  section?: string[];
  kind?: string[];
  scope?: string[];
  subject?: string[];
  tags?: string[];
  status?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  createdAfter?: string; // ISO 8601
  createdBefore?: string; // ISO 8601
  updatedAfter?: string; // ISO 8601
  updatedBefore?: string; // ISO 8601
  summaryOnly?: boolean;
  includeRelated?: boolean;
  limit?: number; // max 50
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### Beads Command Wrapper

The Beads wrapper provides a typed interface to bd commands:

```typescript
interface BeadsWrapper {
  // Repository operations
  init(path: string): Promise<void>;
  
  // Issue operations
  create(issue: BeadsIssue): Promise<string>; // returns bd-XXXX ID
  update(id: string, updates: Partial<BeadsIssue>): Promise<void>;
  get(id: string): Promise<BeadsIssue | null>;
  list(filters: BeadsListFilters): Promise<BeadsIssue[]>;
  
  // Dependency operations
  addDependency(fromId: string, toId: string, type: DependencyType): Promise<void>;
  getDependencies(id: string): Promise<Dependency[]>;
  
  // Label operations
  addLabel(id: string, label: string): Promise<void>;
  removeLabel(id: string, label: string): Promise<void>;
}

interface BeadsIssue {
  id?: string; // bd-XXXX, assigned by Beads
  title: string;
  body: string;
  labels: string[];
  customFields: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface BeadsListFilters {
  labels?: string[];
  customFields?: Record<string, any>;
  createdAfter?: string;
  createdBefore?: string;
}

type DependencyType = 'supersedes' | 'relates_to';
```

### CLI Command Interface

Each CLI command maps to Memory Adapter operations:

```bash
# Initialize memory for a project
bass-agents memory init <project>
  → MemoryAdapter.init(project)

# List memory entries
bass-agents memory list [project] [--section <s>] [--kind <k>] [--scope <sc>] [--status <st>] [--min-confidence <c>]
  → MemoryAdapter.query(filters)

# Show full entry details
bass-agents memory show <entry-id>
  → MemoryAdapter.get(id)

# Query memory content
bass-agents memory query <text> [--section <s>] [--kind <k>] [--scope <sc>]
  → MemoryAdapter.query(filters with text search)

# Compact/consolidate memory
bass-agents memory compact [project] [--dry-run]
  → MemoryAdapter.compact(project, dryRun)

# Validate evidence URIs
bass-agents memory validate-evidence [project]
  → MemoryAdapter.validateEvidence(project)

# Check freshness
bass-agents memory check-freshness [project]
  → MemoryAdapter.checkFreshness(project)

# Sync to ai-context/
bass-agents memory sync-context <project>
  → MemoryAdapter.syncContext(project)

# Export memory
bass-agents memory export <project> <output-path> [--section <s>] [--min-confidence <c>]
  → MemoryAdapter.export(project, outputPath, filters)

# Import memory
bass-agents memory import <project> <input-path> [--conflict-strategy <skip|overwrite|merge>]
  → MemoryAdapter.import(project, inputPath, strategy)
```

## Data Models

### Memory_Entry to Beads Issue Mapping

The mapping leverages Beads' native fields and adds custom fields where needed:

| Memory_Entry Field | Beads Mapping | Notes |
|-------------------|---------------|-------|
| id | Beads issue ID (bd-XXXX) | Hash-based, conflict-free |
| section | Label: `section:<value>` | decisions, state, observations, learnings |
| kind | Label: `kind:<value>` | decision, requirement, invariant, etc. |
| subject | Custom field: `subject` | Canonical entity key |
| scope | Label: `scope:<value>` | repo, service:name, org, customer, environment:prod |
| summary | Beads title | Max 300 chars |
| content | Beads body | Max 2000 chars |
| tags | Labels: `tag:<value>` | Flexible categorization |
| confidence | Custom field: `confidence` | Float 0.0-1.0 |
| evidence | Custom field: `evidence` | JSON array of evidence objects |
| status | Label: `status:<value>` | active, superseded, deprecated, draft |
| superseded_by | Dependency: `supersedes` | Beads dependency link |
| related_entries | Dependency: `relates_to` | Beads dependency links |
| valid_from | Custom field: `valid_from` | ISO 8601 timestamp |
| valid_to | Custom field: `valid_to` | ISO 8601 timestamp |
| created_by | Beads native: `created_by` | Agent identifier |
| created_at | Beads native: `created_at` | ISO 8601 timestamp |
| updated_at | Beads native: `updated_at` | ISO 8601 timestamp |

### Beads Label Conventions

Labels provide fast filtering without custom field queries:

- `section:decisions`, `section:state`, `section:observations`, `section:learnings`
- `kind:decision`, `kind:requirement`, `kind:invariant`, `kind:incident`, `kind:metric`, `kind:hypothesis`, `kind:runbook_step`, `kind:other`
- `scope:repo`, `scope:service:auth`, `scope:org`, `scope:customer`, `scope:environment:prod`
- `status:active`, `status:superseded`, `status:deprecated`, `status:draft`
- `tag:performance`, `tag:security`, `tag:api`, etc. (user-defined)

### Storage Layout

```
workspace-root/
├── ai-context/              # Immediate context (existing)
│   └── ...
├── ai-memory/               # Durable memory (new)
│   ├── global/              # Cross-project memory
│   │   ├── .beads/          # Beads repository
│   │   └── memory.jsonl     # JSONL export (optional)
│   └── {project-name}/      # Project-specific memory
│       ├── .beads/          # Beads repository
│       ├── .config.json     # Project metadata
│       └── memory.jsonl     # JSONL export (optional)
```

### Evidence Object Schema

```json
{
  "type": "code | artifact | log | screenshot | assumption | ticket | doc",
  "uri": "string (git permalink, file path, URL)",
  "note": "string (contextual explanation)"
}
```

Evidence types and validation rules:

- `code`: Git permalink or file path (e.g., `https://github.com/org/repo/blob/abc123/src/file.ts#L10-L20`)
- `artifact`: File path or URL to build artifact, test result, or generated output
- `log`: File path or URL to log file or log aggregation query
- `screenshot`: File path or URL to image
- `assumption`: No URI validation (documents reasoning without external proof)
- `ticket`: URL matching ticket pattern (e.g., `https://github.com/org/repo/issues/123`)
- `doc`: URL or file path to documentation (e.g., ADR, RFC, wiki page)

### Query Result Ranking

Query results are sorted by composite score:

1. **Confidence score** (0.0-1.0): Higher is better
2. **Evidence quality**: code/artifact (1.0) > ticket/doc (0.8) > log/screenshot (0.6) > assumption (0.4)
3. **Recency**: More recent updated_at is better (decay function)
4. **Scope match**: Exact scope match > hierarchical match

Composite score formula:

```
score = (confidence * 0.5) + (evidence_quality * 0.3) + (recency_score * 0.1) + (scope_match * 0.1)
```

### Smart Retrieval Rules

Default query behavior (applied unless explicitly overridden):

1. **Status filter**: Include only `status:active` (exclude superseded, deprecated, draft)
2. **Confidence threshold**: Include only `confidence >= 0.6`
3. **Freshness check** (for section:state): Exclude entries where `current_time > valid_to`
4. **Freshness warning** (for section:state): Down-rank entries where `valid_to - current_time < 7 days`
5. **Scope hierarchy**: When querying `scope:service:auth`, include `scope:repo` and `scope:org`
6. **Result limit**: Maximum 50 entries
7. **Summary-only mode**: Return only id, summary, subject, scope, kind, confidence (reduces tokens)

### Write Policy Validation

Before creating a Memory_Entry, validate:

1. **Required fields**: section, kind, subject, scope, summary, content, confidence, evidence
2. **Field constraints**:
   - summary: max 300 characters
   - content: max 2000 characters
   - confidence: 0.0-1.0
   - section: one of [decisions, state, observations, learnings]
   - kind: one of [decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other]
   - scope: matches pattern `repo | service:<name> | org | customer | environment:<prod|staging>`
   - status: one of [active, superseded, deprecated, draft]
3. **Evidence requirements**:
   - At least one evidence object
   - For kind=[decision, requirement, invariant]: require evidence type in [code, artifact, ticket, doc]
   - For status=draft: evidence requirements relaxed
4. **State-specific requirements**:
   - For section=state: require valid_from and valid_to
5. **Secret detection**: Scan content and evidence URIs for secrets
6. **Duplicate detection**: Check for existing entry with same subject, scope, and summary

### Conflict Resolution Strategy

Beads' hash-based IDs provide conflict-free writes. When multiple agents write simultaneously:

1. **Create operations**: Each gets unique ID (bd-XXXX), no conflict
2. **Update operations**: Last-write-wins on custom fields, git merge on Beads metadata
3. **Dependency operations**: Additive (multiple agents can add different dependencies)
4. **Label operations**: Additive (multiple agents can add different labels)

For import conflicts (same ID from different sources):

- `skip`: Keep existing entry, ignore import
- `overwrite`: Replace existing entry with import
- `merge`: Combine fields (prefer higher confidence, merge evidence arrays, union tags)

### Secret Detection Patterns

Integrate with established patterns (e.g., truffleHog, detect-secrets):

- API keys: `[A-Za-z0-9_-]{20,}`
- AWS keys: `AKIA[0-9A-Z]{16}`
- Private keys: `-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----`
- Tokens: `(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}`
- Connection strings: `(mongodb|postgres|mysql)://[^@]+:[^@]+@`
- OAuth secrets: `client_secret=[A-Za-z0-9_-]+`

When detected, reject the Memory_Update and return descriptive error without logging the secret.

## Error Handling

### Error Categories

**Validation Errors**: Invalid Memory_Entry fields, schema violations, constraint failures
- Return descriptive error message
- Do not create partial entries
- Log validation failure for debugging

**Storage Errors**: Beads command failures, git conflicts, filesystem issues
- Retry transient failures (max 3 attempts)
- Return error to caller for persistent failures
- Preserve existing data (no partial writes)

**Secret Detection Errors**: Detected secrets in content or evidence URIs
- Reject Memory_Update immediately
- Return error without logging secret
- Log detection event for security audit

**Evidence Validation Errors**: Unreachable URIs, malformed evidence objects
- For create operations: reject entry
- For periodic validation: mark entry with warning, down-rank in queries
- Log validation failures

**Query Errors**: Invalid filters, malformed queries, timeout
- Return empty array for invalid filters (graceful degradation)
- Log error for debugging
- Suggest valid filter values in error message

**Conflict Errors**: Import conflicts, concurrent write collisions
- Apply configured conflict resolution strategy
- Log conflict details
- Return conflict report to caller

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | STORAGE_ERROR | SECRET_DETECTED | EVIDENCE_INVALID | QUERY_ERROR | CONFLICT_ERROR",
    "message": "Human-readable error description",
    "details": {
      "field": "field_name",
      "constraint": "constraint_description",
      "value": "sanitized_value"
    }
  }
}
```

### Graceful Degradation

The system degrades gracefully when memory is unavailable:

1. **Uninitialized memory**: Auto-initialize on first write, return empty array on query
2. **Beads unavailable**: Log error, return empty memory_context, allow agent to proceed
3. **Query timeout**: Return partial results with warning
4. **Storage full**: Reject new entries, suggest compaction, allow queries
5. **Git conflicts**: Use last-write-wins, log conflict for manual review

### Retry Logic

Transient failures are retried with exponential backoff:

- Beads command failures: 3 retries, 100ms/200ms/400ms delays
- Evidence URI validation: 2 retries, 500ms/1000ms delays
- Git operations: 3 retries, 200ms/400ms/800ms delays

Persistent failures are logged and returned to caller without further retries.

### Logging Strategy

**Info level**: Successful operations, initialization, compaction
**Warn level**: Low confidence entries, stale evidence, approaching expiry
**Error level**: Validation failures, storage errors, secret detection
**Debug level**: Query execution time, entries scanned, ranking scores

Log format:

```
[timestamp] [level] [component] message {context}
```

Example:

```
2026-02-22T10:30:45Z INFO MemoryAdapter Memory initialized for project=auth-service
2026-02-22T10:31:12Z WARN MemoryAdapter Low confidence entry created id=bd-a1b2c3 confidence=0.4
2026-02-22T10:32:05Z ERROR MemoryAdapter Secret detected in memory entry operation=create field=content
```

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests and property-based tests for comprehensive coverage:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Specific Memory_Entry creation scenarios
- Integration points between components
- Edge cases (empty queries, malformed input, boundary values)
- Error handling paths

**Property-Based Tests**: Verify universal properties across all inputs
- Universal properties that hold for all Memory_Entry instances
- Comprehensive input coverage through randomization
- Invariants preserved across operations
- Round-trip properties for serialization

Both approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across the input space.

### Property-Based Testing Configuration

**Library Selection**: Use fast-check (JavaScript/TypeScript) or Hypothesis (Python) depending on implementation language

**Test Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test references its design document property
- Tag format: `Feature: durable-memory, Property {number}: {property_text}`

**Generator Strategy**:
- Generate valid Memory_Entry instances with random fields
- Generate edge cases: empty strings, boundary values, special characters
- Generate invalid inputs for validation testing
- Generate concurrent operations for conflict testing

### Unit Test Coverage

**Memory Adapter Layer**:
- Memory_Entry to Beads issue translation (both directions)
- Query filter translation to bd commands
- Validation logic (schema, secrets, evidence, duplicates)
- Smart retrieval rules (status, confidence, freshness, scope hierarchy)
- Write policy enforcement
- Error handling and graceful degradation

**Beads Wrapper Layer**:
- bd command execution and parsing
- Dependency management (supersedes, relates_to)
- Label operations (add, remove, query)
- Custom field storage and retrieval

**CLI Layer**:
- Argument parsing for each command
- Output formatting (table, JSON, summary)
- Error message display
- Interactive prompts (compaction, import conflicts)

**Integration Tests**:
- End-to-end memory write and query
- AgentTask/AgentResult integration
- Export/import round-trip
- Concurrent write handling
- Git conflict resolution

### Test Data Strategy

**Fixtures**: Predefined Memory_Entry instances for common scenarios
- High-confidence decision with code evidence
- Low-confidence observation with assumption evidence
- State entry with valid_from/valid_to
- Superseded entry with replacement link
- Draft entry without evidence

**Generators**: Random Memory_Entry instances for property tests
- Random section, kind, scope, subject
- Random confidence (0.0-1.0)
- Random evidence arrays (1-5 objects)
- Random tags (0-10 tags)
- Random timestamps (past 365 days)

**Edge Cases**: Boundary values and special inputs
- Empty strings, max length strings
- Confidence 0.0, 0.5, 1.0
- Expired valid_to, future valid_from
- Missing optional fields
- Malformed URIs, unreachable evidence

### Performance Testing

**Query Performance**:
- Measure query execution time for 10, 100, 1000 entries
- Verify query time < 100ms for 100 entries
- Verify query time < 500ms for 1000 entries

**Write Performance**:
- Measure create operation time
- Verify create time < 50ms per entry
- Verify concurrent writes don't block

**Memory Usage**:
- Measure memory footprint for 1000 entries
- Verify memory usage < 100MB for 1000 entries

**Scalability**:
- Test with 10,000 entries (stress test)
- Verify graceful degradation (pagination, timeouts)

### Security Testing

**Secret Detection**:
- Test with known secret patterns (API keys, tokens, passwords)
- Verify rejection of entries containing secrets
- Verify no secrets logged in error messages

**Evidence Validation**:
- Test with malformed URIs
- Test with unreachable URIs (404, DNS failure)
- Verify stale evidence detection

**Input Sanitization**:
- Test with SQL injection patterns (should be irrelevant for Beads, but verify)
- Test with path traversal patterns (../../../etc/passwd)
- Test with command injection patterns (; rm -rf /)

### Continuous Integration

**Pre-commit Hooks**:
- Run unit tests
- Run linter and type checker
- Run secret detection on test fixtures

**CI Pipeline**:
- Run full unit test suite
- Run property-based tests (100 iterations)
- Run integration tests
- Run performance tests (baseline comparison)
- Generate coverage report (target: 80% line coverage)

**Nightly Tests**:
- Run property-based tests (1000 iterations)
- Run stress tests (10,000 entries)
- Run evidence validation on real projects
- Generate performance trend report


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Section Validation

For any Memory_Entry creation attempt, if the section field is not one of [decisions, state, observations, learnings], then the system shall reject the entry with a validation error.

**Validates: Requirements 2.1**

### Property 2: Unique Memory IDs

For any set of Memory_Entry creation operations, the system shall assign a unique Memory_ID to each entry such that no two entries share the same ID.

**Validates: Requirements 2.4**

### Property 3: Memory Entry Round-Trip

For any valid Memory_Entry with all required fields, creating the entry and then retrieving it by ID shall return an equivalent entry with all fields preserved including id, section, kind, subject, scope, summary, content, tags, confidence, evidence, status, superseded_by, related_entries, valid_from, valid_to, created_by, created_at, and updated_at.

**Validates: Requirements 2.5, 3.7, 3.8, 3.9**

### Property 4: Related Entries Traversal

For any Memory_Entry with related_entries field containing Memory_IDs, querying with includeRelated flag shall return the original entry plus all entries referenced in related_entries.

**Validates: Requirements 2.6, 4.11**

### Property 5: Workspace Boundary Enforcement

For any memory operation (init, create, update, query, export), all file system writes shall occur within the workspace root directory, and no writes shall occur outside this boundary.

**Validates: Requirements 2.7**

### Property 6: Query Filter Correctness

For any Memory_Query with filters (section, kind, scope, subject, tags, status, confidence range, timestamp range), all returned entries shall match all specified filters, and no entries violating any filter shall be returned.

**Validates: Requirements 2.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

### Property 7: Input Validation Rejection

For any Memory_Entry creation attempt with invalid fields (confidence outside 0.0-1.0, empty evidence array, invalid kind value, missing subject, invalid scope pattern, summary exceeding 300 chars, content exceeding 2000 chars), the system shall reject the entry and return a descriptive validation error.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.7, 5.8, 5.9**

### Property 8: Low Confidence Marking

For any Memory_Query result containing entries with confidence < 0.5, those entries shall be marked with a low-confidence indicator in the query results.

**Validates: Requirements 3.10**

### Property 9: Schema Conformance

For any Memory_Query result, all returned entries shall conform to the Memory_Entry JSON schema with all required fields present and correctly typed.

**Validates: Requirements 4.8**

### Property 10: Result Limit Enforcement

For any Memory_Query, regardless of how many entries match the filters, the system shall return at most 50 entries.

**Validates: Requirements 4.10**

### Property 11: Summary-Only Field Exclusion

For any Memory_Query with summaryOnly flag set to true, all returned entries shall include only the fields [id, summary, subject, scope, kind, confidence] and shall exclude the content field.

**Validates: Requirements 4.12**

### Property 12: Create Operation Success

For any Memory_Update with operation="create" and valid entry fields, the system shall create a new Memory_Entry and return a unique Memory_ID, and subsequent queries shall be able to retrieve the created entry.

**Validates: Requirements 5.1**

### Property 13: Supersede Operation Correctness

For any Memory_Update with operation="supersede", target_id pointing to an existing entry, and a valid replacement entry, the system shall set the target entry's status to "superseded", populate superseded_by with the new entry's ID, and create the replacement entry with status="active".

**Validates: Requirements 5.2, 5.4**

### Property 14: Deprecate Operation Correctness

For any Memory_Update with operation="deprecate" and target_id pointing to an existing entry, the system shall set the target entry's status to "deprecated" without requiring or setting a superseded_by field.

**Validates: Requirements 5.3, 5.5**

### Property 15: Audit Trail Preservation

For any Memory_Entry that has been superseded or deprecated, the entry shall remain retrievable via explicit query with status filter, and shall not be deleted from storage.

**Validates: Requirements 5.6**

### Property 16: Updated Timestamp Modification

For any Memory_Entry update operation (supersede, deprecate, or field modification), the system shall update the updated_at timestamp to reflect the current time, and the new timestamp shall be greater than the previous updated_at value.

**Validates: Requirements 5.10**

### Property 17: Default Query Filtering

For any Memory_Query without explicit status or confidence filters, the system shall default to returning only entries with status="active" and confidence >= 0.6, excluding superseded, deprecated, and draft entries, and excluding low-confidence entries.

**Validates: Requirements 5.11, 6.7, 6.8, 6.9, 6.10**

### Property 18: Consolidation Candidate Identification

For any Memory_Entry with status="superseded", the entry shall appear in the list of consolidation candidates when running the compact operation.

**Validates: Requirements 6.6**

### Property 19: AgentTask Memory Context Limit

For any AgentTask with memory_enabled=true, the populated memory_context field shall contain at most 10 Memory_Entry objects, regardless of how many entries match the query criteria.

**Validates: Requirements 8.2**

### Property 20: AgentTask Memory Context Ranking

For any AgentTask with memory_enabled=true, the memory_context field shall contain the entries with the highest confidence scores among all matching entries, sorted in descending order by confidence.

**Validates: Requirements 8.3**

### Property 21: AgentTask Memory Context Status Filtering

For any AgentTask with memory_enabled=true, all entries in memory_context shall have status="active", and no entries with status="superseded", status="deprecated", or status="draft" shall be included.

**Validates: Requirements 8.4**

### Property 22: AgentTask Memory Context Freshness Filtering

For any AgentTask with memory_enabled=true, all entries in memory_context shall have valid_to either null or greater than the current timestamp, and no expired entries shall be included.

**Validates: Requirements 8.5**

### Property 23: AgentTask Memory Disabled Behavior

For any AgentTask with memory_enabled=false or memory_enabled omitted, the memory_context field shall be empty or null, and no memory queries shall be executed.

**Validates: Requirements 8.7**

### Property 24: AgentTask Evidence Preference

For any AgentTask with memory_enabled=true, when ranking entries for memory_context, entries with evidence type "code" or "artifact" shall be ranked higher than entries with evidence type "assumption", given equal confidence scores.

**Validates: Requirements 8.8**

### Property 25: AgentResult Memory Updates Application

For any AgentResult with memory_updates array containing valid Memory_Update objects, the system shall apply each update in order, and subsequent queries shall reflect the applied updates.

**Validates: Requirements 9.1**

### Property 26: AgentResult Partial Failure Handling

For any AgentResult with memory_updates array containing both valid and invalid Memory_Update objects, the system shall apply all valid updates successfully, skip invalid updates with logged errors, and not fail the entire operation.

**Validates: Requirements 9.3**

### Property 27: Graceful Uninitialized Memory Handling

For any memory query operation on an uninitialized project, the system shall return an empty array without error, allowing the agent run to proceed.

**Validates: Requirements 9.5**

### Property 28: Auto-Initialization on First Write

For any Memory_Update operation on an uninitialized project, the system shall automatically initialize memory storage with default configuration before applying the update.

**Validates: Requirements 9.6**

### Property 29: State Entry Freshness Validation

For any Memory_Entry creation with section="state", the system shall require both valid_from and valid_to fields to be present and valid ISO 8601 timestamps, and shall reject entries missing these fields.

**Validates: Requirements 9.7**

### Property 30: Concurrent Write ID Uniqueness

For any set of concurrent Memory_Entry creation operations executed simultaneously by multiple agents, the system shall assign unique Memory_IDs to each entry without collisions or data corruption.

**Validates: Requirements 12.1, 12.2**

### Property 31: Version History Preservation

For any Memory_Entry that undergoes updates (supersede, deprecate, field modifications), the system shall maintain version history accessible via git, allowing retrieval of previous versions.

**Validates: Requirements 12.5**

### Property 32: Secret Detection in Content

For any Memory_Entry creation attempt with content containing detected secret patterns (API keys, tokens, passwords, private keys, connection strings, OAuth secrets), the system shall reject the entry and return a descriptive error without logging the secret.

**Validates: Requirements 13.1, 13.4, 13.5**

### Property 33: Secret Detection in Evidence URIs

For any Memory_Entry creation attempt with evidence URIs containing detected secret patterns or sensitive paths, the system shall reject the entry and return a descriptive error.

**Validates: Requirements 13.2, 13.9**

### Property 34: Export Round-Trip

For any project memory, exporting to JSON format and then importing from that export shall result in equivalent memory entries with all fields preserved.

**Validates: Requirements 14.3, 14.4**

### Property 35: Export Filtering

For any memory export operation with filters (section, date range, confidence threshold), the exported JSON shall contain only entries matching all specified filters.

**Validates: Requirements 14.7**

### Property 36: State Entry Expiry Exclusion

For any Memory_Query with section="state" filter, all returned entries shall have valid_to either null or greater than the current timestamp, and entries with expired valid_to shall be excluded.

**Validates: Requirements 15.2**

### Property 37: State Entry Near-Expiry Down-Ranking

For any Memory_Query with section="state" filter, entries where valid_to is within 7 days of the current timestamp shall be ranked lower than entries with valid_to more than 7 days in the future, given equal confidence scores.

**Validates: Requirements 15.3**

### Property 38: Evidence Quality Ranking

For any Memory_Query result, entries with evidence type "code" or "artifact" shall be ranked higher than entries with evidence type "assumption", given equal confidence scores and recency.

**Validates: Requirements 15.4**

### Property 39: Scope Hierarchy Inclusion

For any Memory_Query with scope filter, the system shall include entries matching the specified scope plus hierarchical parent scopes: queries with scope="service:auth" shall include scope="repo" and scope="org"; queries with scope="environment:prod" shall include scope="repo" and scope="org"; queries with scope="customer" shall include scope="repo" and scope="org"; queries without scope filter shall include all scopes.

**Validates: Requirements 15.6, 15.7, 17.1, 17.2, 17.3, 17.5**

### Property 40: Query Result Sorting

For any Memory_Query result, entries shall be sorted by composite score calculated as: (confidence * 0.5) + (evidence_quality * 0.3) + (recency_score * 0.1) + (scope_match * 0.1), in descending order.

**Validates: Requirements 15.8**

### Property 41: Evidence Field Validation

For any Memory_Entry creation with evidence array, each evidence object shall contain type, uri, and note fields, and entries with evidence objects missing any of these fields shall be rejected.

**Validates: Requirements 18.1**

### Property 42: Evidence Type-Specific URI Validation

For any Memory_Entry creation with evidence, the system shall validate URIs according to evidence type: type="code" requires git permalink or file path, type="ticket" requires ticket URL pattern, type="doc" requires valid URL or file path, and entries with invalid URIs for their type shall be rejected.

**Validates: Requirements 18.2, 18.3, 18.4**

### Property 43: Stale Evidence Down-Ranking

For any Memory_Query result, entries marked with stale evidence warnings (unreachable URIs detected during periodic validation) shall be ranked lower than entries with valid evidence, given equal confidence scores.

**Validates: Requirements 18.7, 18.8**

### Property 44: Near-Expiry Warning Annotation

For any Memory_Query with section="state" filter, entries where valid_to is within 7 days of the current timestamp shall include a warning annotation in the query results indicating approaching expiry.

**Validates: Requirements 19.5**

### Property 45: Review Interval Metadata Persistence

For any Memory_Entry with review_interval metadata field, creating the entry and then retrieving it shall return the entry with review_interval preserved.

**Validates: Requirements 19.6**

### Property 46: Valid_To Extension on Update

For any Memory_Entry update operation that modifies the valid_to field to a later timestamp, the update shall succeed and subsequent queries shall reflect the extended validity period.

**Validates: Requirements 19.8**


## Analytics Dashboard Design

### Statistics API

The Memory Adapter provides a statistics API for programmatic access to memory metrics:

```typescript
interface MemoryStatistics {
  // Basic counts
  total_entries: number;
  entries_by_section: Record<string, number>; // {decisions: 10, state: 5, ...}
  entries_by_status: Record<string, number>; // {active: 20, superseded: 5, ...}
  entries_by_kind: Record<string, number>; // {decision: 8, requirement: 3, ...}
  
  // Quality metrics
  avg_confidence: number;
  confidence_distribution: Record<string, number>; // {"0.0-0.2": 2, "0.2-0.4": 5, ...}
  evidence_type_distribution: Record<string, number>; // {code: 15, artifact: 8, ...}
  low_confidence_count: number; // confidence < 0.5
  stale_evidence_count: number;
  
  // Growth trends (time series)
  entries_created_over_time: Array<{date: string, count: number}>;
  entries_superseded_over_time: Array<{date: string, count: number}>;
  
  // Agent activity
  entries_by_agent: Record<string, number>; // {agent-1: 15, agent-2: 8, ...}
  most_active_agents: Array<{agent: string, count: number}>; // top 10
  recent_operations: Array<{
    timestamp: string,
    operation: string, // create, supersede, deprecate
    entry_id: string,
    agent: string,
    summary: string
  }>; // last 20
  
  // Query patterns (requires query logging)
  most_queried_subjects: Array<{subject: string, count: number}>; // top 10
  most_queried_scopes: Array<{scope: string, count: number}>; // top 10
  query_frequency_over_time: Array<{date: string, count: number}>;
  
  // Lifecycle metrics
  superseded_percentage: number; // superseded / total
  entries_approaching_expiry: Array<{
    entry_id: string,
    summary: string,
    valid_to: string,
    days_remaining: number
  }>; // within 7 days
  compaction_candidates: number; // superseded entries
}

interface StatisticsOptions {
  project?: string; // specific project or "all"
  start_date?: string; // ISO 8601
  end_date?: string; // ISO 8601
}

// Memory Adapter method
getStatistics(options: StatisticsOptions): Promise<MemoryStatistics>;
```

### Dashboard Architecture

The dashboard is a CLI-based terminal UI using a library like blessed (Node.js) or rich (Python):

**Technology Choice**: blessed (Node.js) or rich (Python) for terminal UI
- blessed: Full-featured terminal UI library with widgets, layouts, and event handling
- rich: Modern Python library with tables, charts, and live updates
- Both support responsive layouts and color coding

**Dashboard Layout**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Memory Analytics Dashboard - Project: auth-service                      │
│ Last updated: 2026-02-22 10:30:45 | Auto-refresh: 30s | Filter: 7 days │
├─────────────────────────────────────────────────────────────────────────┤
│ Summary                                                                  │
│ Total Entries: 125 | Active: 98 | Avg Confidence: 0.72 | Stale: 3      │
├─────────────────────────────────────────────────────────────────────────┤
│ Memory Growth (Last 7 Days)          │ Entries by Section              │
│                                       │                                 │
│  15 ┤                            ╭─   │ Decisions:    45 (36%)         │
│  10 ┤                      ╭─────╯    │ State:        30 (24%)         │
│   5 ┤            ╭─────────╯          │ Observations: 28 (22%)         │
│   0 ┼────────────╯                    │ Learnings:    22 (18%)         │
│     └─────────────────────────────    │                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Confidence Distribution               │ Evidence Type Distribution      │
│                                       │                                 │
│ 0.8-1.0: ████████████████ 45          │ code:       ████████ 35        │
│ 0.6-0.8: ████████████ 32              │ artifact:   ██████ 22          │
│ 0.4-0.6: ██████ 18                    │ ticket:     ████ 15            │
│ 0.2-0.4: ███ 8                        │ doc:        ███ 12             │
│ 0.0-0.2: █ 2                          │ assumption: ██ 8               │
├─────────────────────────────────────────────────────────────────────────┤
│ Most Active Agents                    │ Entries Approaching Expiry      │
│                                       │                                 │
│ agent-1:        45 entries            │ bd-a1b2: Auth token config (2d) │
│ agent-2:        32 entries            │ bd-c3d4: DB connection (5d)     │
│ agent-3:        18 entries            │ bd-e5f6: API rate limit (6d)    │
├─────────────────────────────────────────────────────────────────────────┤
│ Recent Operations (Last 20)                                             │
│                                                                          │
│ 10:28 | create    | bd-x1y2 | agent-1 | Added auth flow decision       │
│ 10:25 | supersede | bd-a1b2 | agent-2 | Updated API versioning         │
│ 10:20 | create    | bd-z3w4 | agent-1 | Recorded performance metric    │
└─────────────────────────────────────────────────────────────────────────┘
Press 'q' to quit | 'r' to refresh | 'f' to change filter | 'p' to change project
```

**Dashboard Components**:

1. **Header**: Project name, last update time, auto-refresh interval, active filter
2. **Summary Panel**: Key metrics (total, active, avg confidence, stale count)
3. **Growth Chart**: Line chart showing entries created per day
4. **Section Pie Chart**: Distribution across four sections
5. **Confidence Bar Chart**: Distribution across confidence ranges
6. **Evidence Bar Chart**: Distribution across evidence types
7. **Active Agents Table**: Top 10 agents by entry count
8. **Expiry Table**: Entries expiring within 7 days
9. **Recent Operations Table**: Last 20 create/supersede/deprecate operations
10. **Footer**: Keyboard shortcuts

**Color Coding**:
- Green: Healthy metrics (avg confidence > 0.7, stale count = 0)
- Yellow: Warnings (avg confidence 0.5-0.7, stale count 1-5, entries expiring soon)
- Red: Issues (avg confidence < 0.5, stale count > 5, expired entries)

### Statistics Caching Strategy

To avoid recomputing statistics on every dashboard refresh, implement caching:

**Cache Structure**:

```typescript
interface StatisticsCache {
  project: string;
  computed_at: string; // ISO 8601 timestamp
  expires_at: string; // computed_at + 5 minutes
  statistics: MemoryStatistics;
}
```

**Cache Location**: In-memory cache (Map<project, StatisticsCache>) or filesystem cache at ai-memory/{project}/.stats-cache.json

**Cache Invalidation**:
- Time-based: Expire after 5 minutes
- Event-based: Invalidate on memory write operations (create, supersede, deprecate)
- Manual: Provide `--no-cache` flag to force recomputation

**Cache Strategy**:

1. **On dashboard launch**: Check cache, use if valid (< 5 minutes old), otherwise compute
2. **On auto-refresh**: Check cache, use if valid, otherwise compute
3. **On memory write**: Invalidate cache for affected project
4. **On manual refresh**: Optionally bypass cache with `--no-cache`

**Incremental Updates** (optimization for future):
- Maintain running totals for basic counts (total_entries, entries_by_section, etc.)
- Update incrementally on write operations instead of full recomputation
- Store incremental state in ai-memory/{project}/.stats-state.json

### Data Aggregation Approach

Two approaches for computing statistics:

**Approach 1: Compute on-demand** (initial implementation)
- Scan all Memory_Entry records when statistics are requested
- Apply filters (date range, project)
- Aggregate counts, compute averages, build distributions
- Cache result for 5 minutes
- Pros: Simple, no additional storage, always accurate
- Cons: Slower for large datasets (1000+ entries)

**Approach 2: Maintain statistics incrementally** (future optimization)
- Update running totals on every write operation
- Store aggregated state in ai-memory/{project}/.stats-state.json
- Recompute only affected metrics on write
- Pros: Fast statistics retrieval, scales to large datasets
- Cons: More complex, requires careful state management, potential for drift

**Recommended**: Start with Approach 1 (compute on-demand with caching), migrate to Approach 2 if performance becomes an issue.

### Query Logging for Pattern Analysis

To support query pattern metrics (most_queried_subjects, most_queried_scopes, query_frequency_over_time), implement query logging:

**Query Log Structure**:

```typescript
interface QueryLogEntry {
  timestamp: string; // ISO 8601
  project: string;
  filters: MemoryQueryFilters;
  result_count: number;
  execution_time_ms: number;
}
```

**Query Log Storage**: Append-only log at ai-memory/{project}/.query-log.jsonl (JSONL format)

**Query Log Rotation**: Rotate log when it exceeds 10MB or 10,000 entries, archive old logs

**Privacy Considerations**: Query logs may contain sensitive filter values (subjects, scopes). Ensure logs are stored within workspace and not exported by default.

**Query Log Analysis**:
- Parse query log to extract subjects and scopes from filters
- Count occurrences of each subject and scope
- Group by date to compute query frequency over time
- Cache analysis results for 5 minutes

### CLI Command Implementation

```bash
# Launch dashboard for specific project
bass-agents memory dashboard auth-service

# Launch dashboard for all projects
bass-agents memory dashboard --all

# Launch dashboard with custom refresh interval
bass-agents memory dashboard auth-service --refresh 60

# Launch dashboard with date range filter
bass-agents memory dashboard auth-service --range 30d

# Launch dashboard without cache
bass-agents memory dashboard auth-service --no-cache
```

**Dashboard Keyboard Shortcuts**:
- `q`: Quit dashboard
- `r`: Manual refresh (bypass cache)
- `f`: Change date range filter (7d, 30d, all)
- `p`: Change project (if launched with --all)
- `↑/↓`: Scroll through tables
- `h`: Show help overlay

### Statistics API CLI Access

For programmatic access without launching the dashboard:

```bash
# Get statistics as JSON
bass-agents memory stats auth-service --json

# Get statistics with date range
bass-agents memory stats auth-service --range 30d --json

# Get statistics for all projects
bass-agents memory stats --all --json
```

Output format:

```json
{
  "project": "auth-service",
  "computed_at": "2026-02-22T10:30:45Z",
  "statistics": {
    "total_entries": 125,
    "entries_by_section": {"decisions": 45, "state": 30, ...},
    ...
  }
}
```

### Dashboard Testing Strategy

**Unit Tests**:
- Statistics computation correctness (counts, averages, distributions)
- Cache invalidation logic
- Query log parsing and analysis
- Date range filtering

**Integration Tests**:
- End-to-end statistics retrieval with real memory data
- Dashboard rendering with mock statistics
- Auto-refresh behavior
- Keyboard shortcut handling

**Performance Tests**:
- Statistics computation time for 100, 1000, 10000 entries
- Cache hit/miss performance
- Query log analysis performance

**Visual Tests** (manual):
- Dashboard layout on different terminal sizes
- Color coding correctness
- Chart rendering accuracy

### Correctness Properties for Analytics

### Property 47: Statistics Accuracy

For any project memory, the statistics returned by getStatistics shall accurately reflect the current state of memory entries: total_entries shall equal the count of all entries, entries_by_section shall sum to total_entries, avg_confidence shall equal the mean of all confidence scores.

**Validates: Requirements 22.2**

### Property 48: Statistics Date Range Filtering

For any getStatistics call with start_date and end_date filters, all statistics shall be computed only from entries where created_at falls within the specified date range, and entries outside the range shall be excluded.

**Validates: Requirements 22.10**

### Property 49: Dashboard Auto-Refresh

For any running dashboard instance, the displayed statistics shall automatically refresh every 30 seconds by calling getStatistics and updating the display.

**Validates: Requirements 21.8**

### Property 50: Dashboard Project Filtering

For any dashboard instance launched with a specific project filter, all displayed statistics shall reflect only entries from that project, and entries from other projects shall be excluded.

**Validates: Requirements 21.10**

### Property 51: Dashboard Color Coding

For any dashboard display, metrics shall be color-coded according to health thresholds: green for avg_confidence > 0.7 and stale_evidence_count = 0, yellow for avg_confidence 0.5-0.7 or stale_evidence_count 1-5, red for avg_confidence < 0.5 or stale_evidence_count > 5.

**Validates: Requirements 23.9**
