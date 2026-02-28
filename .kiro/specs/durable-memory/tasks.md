# Implementation Plan: Durable Memory for bass-agents

## Overview

This plan implements a production-grade durable memory system using Beads as the storage layer. The implementation provides workspace-relative persistent knowledge storage with four memory sections (decisions, state, observations, learnings), rich metadata, smart retrieval, lifecycle management, and integration with AgentTask/AgentResult schemas.

The implementation follows a layered architecture: CLI commands → Memory Adapter (business logic) → Beads Wrapper (storage interface) → Beads storage layer. All code will be written in TypeScript to match the existing bass-agents codebase.

## Tasks

- [x] 1. Extend JSON schemas for AgentTask and AgentResult
  - [x] 1.1 Add memory fields to AgentTask schema
    - Extend schemas/agent-task.schema.json with memory_enabled (boolean, default false) and memory_context (array of Memory_Entry, max 10)
    - _Requirements: 8.1, 8.2, 8.7_
  
  - [ ]* 1.2 Write property test for AgentTask schema extension
    - **Property 19: AgentTask Memory Context Limit**
    - **Property 23: AgentTask Memory Disabled Behavior**
    - **Validates: Requirements 8.2, 8.7**
  
  - [x] 1.3 Add memory_updates field to AgentResult schema
    - Extend schemas/agent-result.schema.json with memory_updates (array of Memory_Update objects)
    - _Requirements: 9.1, 9.2_
  
  - [ ]* 1.4 Write property test for AgentResult schema extension
    - **Property 25: AgentResult Memory Updates Application**
    - **Validates: Requirements 9.1**


- [x] 2. Implement Beads command wrapper
  - [x] 2.1 Create BeadsWrapper interface and implementation
    - Create src/memory/beads-wrapper.ts with BeadsWrapper class
    - Implement init(), create(), update(), get(), list() methods wrapping bd commands
    - Implement addDependency(), getDependencies() for relationship management
    - Implement addLabel(), removeLabel() for label operations
    - _Requirements: 2.2, 2.3, 2.4, 2.6_
  
  - [x] 2.2 Implement Beads issue to Memory_Entry translation
    - Create translation functions: beadsIssueToMemoryEntry() and memoryEntryToBeadsIssue()
    - Map Memory_Entry fields to Beads labels (section, kind, scope, status, tags)
    - Map Memory_Entry fields to Beads custom fields (confidence, evidence, subject, valid_from, valid_to)
    - Handle dependency links for superseded_by and related_entries
    - _Requirements: 2.5, 2.6, 5.4_
  
  - [ ]* 2.3 Write property test for Beads wrapper
    - **Property 3: Memory Entry Round-Trip**
    - **Validates: Requirements 2.5, 3.7, 3.8, 3.9**
  
  - [ ]* 2.4 Write unit tests for Beads command execution
    - Test bd init, create, list, show, update command generation
    - Test error handling for failed bd commands
    - Test label and custom field parsing
    - _Requirements: 2.2, 2.4_

- [x] 3. Implement core validation logic
  - [x] 3.1 Create validation module
    - Create src/memory/validation.ts with validateMemoryEntry() function
    - Validate required fields: section, kind, subject, scope, summary, content, confidence, evidence
    - Validate field constraints: confidence 0.0-1.0, summary max 300 chars, content max 2000 chars
    - Validate section enum: decisions, state, observations, learnings
    - Validate kind enum: decision, requirement, invariant, incident, metric, hypothesis, runbook_step, other
    - Validate scope pattern: repo | service:<name> | org | customer | environment:<prod|staging>
    - Validate status enum: active, superseded, deprecated, draft
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.7, 5.8, 5.9_
  
  - [ ]* 3.2 Write property test for validation
    - **Property 1: Section Validation**
    - **Property 7: Input Validation Rejection**
    - **Validates: Requirements 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.7, 5.8, 5.9**
  
  - [x] 3.3 Implement state-specific validation
    - Add validation for section="state" requiring valid_from and valid_to
    - Validate ISO 8601 timestamp format
    - _Requirements: 9.7, 19.1_
  
  - [ ]* 3.4 Write property test for state validation
    - **Property 29: State Entry Freshness Validation**
    - **Validates: Requirements 9.7**


- [x] 4. Implement secret detection
  - [x] 4.1 Create secret detection module
    - Create src/memory/secret-detection.ts with detectSecrets() function
    - Implement patterns for: API keys, AWS keys, private keys, tokens, connection strings, OAuth secrets
    - Scan content and evidence URIs for secret patterns
    - Return descriptive errors without logging detected secrets
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.9_
  
  - [ ]* 4.2 Write property test for secret detection
    - **Property 32: Secret Detection in Content**
    - **Property 33: Secret Detection in Evidence URIs**
    - **Validates: Requirements 13.1, 13.2, 13.4, 13.5, 13.9**
  
  - [ ]* 4.3 Write unit tests for secret patterns
    - Test detection of API keys, AWS keys, private keys, tokens, connection strings, OAuth secrets
    - Test that errors don't leak secrets
    - _Requirements: 13.4, 13.5_

- [x] 5. Implement evidence validation
  - [x] 5.1 Create evidence validation module
    - Create src/memory/evidence-validation.ts with validateEvidence() function
    - Validate evidence object structure: type, uri, note fields required
    - Validate type-specific URI patterns: code (git permalink/file path), ticket (URL pattern), doc (URL/file path)
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  
  - [x] 5.2 Implement periodic evidence URI validation
    - Create validateEvidenceURIs() function to check URI reachability
    - Check file paths exist, URLs return 200 status
    - Mark entries with stale evidence
    - _Requirements: 18.5, 18.6, 18.7_
  
  - [ ]* 5.3 Write property test for evidence validation
    - **Property 41: Evidence Field Validation**
    - **Property 42: Evidence Type-Specific URI Validation**
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4**
  
  - [ ]* 5.4 Write unit tests for evidence validation
    - Test valid and invalid evidence objects
    - Test URI reachability checks
    - Test stale evidence marking
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.7_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Implement Memory Adapter core operations
  - [x] 7.1 Create MemoryAdapter class with initialization
    - Create src/memory/memory-adapter.ts with MemoryAdapter class
    - Implement init(project) to initialize Beads repository at ai-memory/{project}/
    - Create .config.json with project metadata
    - _Requirements: 2.2, 2.3, 7.5, 7.11, 7.12_
  
  - [x] 7.2 Implement create operation
    - Implement create(entry) method
    - Validate entry using validation module
    - Check for secrets using secret detection module
    - Check for duplicates (same subject, scope, summary)
    - Translate to Beads issue and call BeadsWrapper.create()
    - Return Memory_ID
    - _Requirements: 5.1, 5.7, 16.6_
  
  - [ ]* 7.3 Write property test for create operation
    - **Property 2: Unique Memory IDs**
    - **Property 12: Create Operation Success**
    - **Validates: Requirements 2.4, 5.1**
  
  - [x] 7.4 Implement supersede operation
    - Implement supersede(targetId, replacementEntry) method
    - Update target entry status to "superseded"
    - Set target entry superseded_by to new entry ID
    - Create replacement entry with status="active"
    - _Requirements: 5.2, 5.4_
  
  - [ ]* 7.5 Write property test for supersede operation
    - **Property 13: Supersede Operation Correctness**
    - **Validates: Requirements 5.2, 5.4**
  
  - [x] 7.6 Implement deprecate operation
    - Implement deprecate(targetId) method
    - Update target entry status to "deprecated"
    - Do not require or set superseded_by field
    - _Requirements: 5.3, 5.5_
  
  - [ ]* 7.7 Write property test for deprecate operation
    - **Property 14: Deprecate Operation Correctness**
    - **Validates: Requirements 5.3, 5.5**
  
  - [ ]* 7.8 Write property test for audit trail
    - **Property 15: Audit Trail Preservation**
    - **Property 16: Updated Timestamp Modification**
    - **Validates: Requirements 5.6, 5.10**


- [x] 8. Implement Memory Adapter query operations
  - [x] 8.1 Implement basic query with filters
    - Implement query(filters) method
    - Translate MemoryQueryFilters to Beads list command with labels and custom field filters
    - Support filters: section, kind, scope, subject, tags, status, confidence range, timestamp range
    - Translate Beads issues back to Memory_Entry objects
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  
  - [ ]* 8.2 Write property test for query filtering
    - **Property 6: Query Filter Correctness**
    - **Property 9: Schema Conformance**
    - **Validates: Requirements 2.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**
  
  - [x] 8.3 Implement smart retrieval rules
    - Apply default filters: status="active", confidence>=0.6
    - Exclude expired entries for section="state" (current_time > valid_to)
    - Down-rank near-expiry entries (valid_to within 7 days)
    - Implement scope hierarchy: service:<name> includes repo and org scopes
    - _Requirements: 5.11, 6.7, 6.8, 6.9, 6.10, 15.1, 15.2, 15.3, 15.6, 15.7, 17.1, 17.2, 17.3, 17.5_
  
  - [ ]* 8.4 Write property test for smart retrieval
    - **Property 17: Default Query Filtering**
    - **Property 36: State Entry Expiry Exclusion**
    - **Property 37: State Entry Near-Expiry Down-Ranking**
    - **Property 39: Scope Hierarchy Inclusion**
    - **Validates: Requirements 5.11, 6.7, 6.8, 6.9, 6.10, 15.1, 15.2, 15.3, 15.6, 15.7, 17.1, 17.2, 17.3, 17.5**
  
  - [x] 8.5 Implement query result ranking
    - Calculate composite score: (confidence * 0.5) + (evidence_quality * 0.3) + (recency_score * 0.1) + (scope_match * 0.1)
    - Evidence quality: code/artifact=1.0, ticket/doc=0.8, log/screenshot=0.6, assumption=0.4
    - Sort results by composite score descending
    - Mark low-confidence entries (confidence < 0.5)
    - Down-rank entries with stale evidence
    - _Requirements: 3.10, 15.4, 15.8, 18.8_
  
  - [ ]* 8.6 Write property test for ranking
    - **Property 8: Low Confidence Marking**
    - **Property 38: Evidence Quality Ranking**
    - **Property 40: Query Result Sorting**
    - **Property 43: Stale Evidence Down-Ranking**
    - **Validates: Requirements 3.10, 15.4, 15.8, 18.7, 18.8**
  
  - [x] 8.7 Implement result limiting and summary-only mode
    - Limit results to 50 entries maximum
    - Implement summaryOnly flag to return only id, summary, subject, scope, kind, confidence
    - _Requirements: 4.10, 4.12_
  
  - [ ]* 8.8 Write property test for result limits
    - **Property 10: Result Limit Enforcement**
    - **Property 11: Summary-Only Field Exclusion**
    - **Validates: Requirements 4.10, 4.12**
  
  - [x] 8.9 Implement related entries traversal
    - Implement get(id) method to retrieve single entry
    - Implement getRelated(id) method to follow related_entries links
    - Support includeRelated flag in query
    - _Requirements: 2.6, 4.11_
  
  - [ ]* 8.10 Write property test for related entries
    - **Property 4: Related Entries Traversal**
    - **Validates: Requirements 2.6, 4.11**


- [x] 9. Implement lifecycle management operations
  - [x] 9.1 Implement consolidation/compaction
    - Implement compact(project, dryRun) method
    - Identify consolidation candidates (status="superseded")
    - Generate consolidation report with entries to be archived
    - Support dry-run mode for preview
    - Preserve original entries in git history
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_
  
  - [ ]* 9.2 Write property test for consolidation
    - **Property 18: Consolidation Candidate Identification**
    - **Validates: Requirements 6.6**
  
  - [x] 9.3 Implement freshness checking
    - Implement checkFreshness(project) method
    - List entries where valid_to is within 7 days
    - Generate freshness report with warnings
    - _Requirements: 7.7, 19.4_
  
  - [ ]* 9.4 Write property test for freshness
    - **Property 44: Near-Expiry Warning Annotation**
    - **Validates: Requirements 19.5**
  
  - [x] 9.5 Implement evidence validation command
    - Implement validateEvidence(project) method
    - Check all evidence URIs for reachability
    - Generate validation report with stale URIs
    - Mark affected entries with warning flag
    - _Requirements: 7.6, 18.6, 18.7_
  
  - [ ]* 9.6 Write unit tests for lifecycle operations
    - Test compaction with superseded entries
    - Test freshness checking with near-expiry entries
    - Test evidence validation with unreachable URIs
    - _Requirements: 6.1, 7.6, 7.7_

- [x] 10. Implement export and import operations
  - [x] 10.1 Implement memory export
    - Implement export(project, outputPath, filters) method
    - Write Memory_Entry records to JSONL format
    - Support filtering by section, date range, confidence threshold
    - _Requirements: 14.1, 14.3, 14.7_
  
  - [ ]* 10.2 Write property test for export
    - **Property 34: Export Round-Trip**
    - **Property 35: Export Filtering**
    - **Validates: Requirements 14.3, 14.4, 14.7**
  
  - [x] 10.3 Implement memory import
    - Implement import(project, inputPath, conflictStrategy) method
    - Validate each Memory_Entry against schema
    - Handle conflicts with strategies: skip, overwrite, merge
    - Generate import report with success/failure counts
    - _Requirements: 14.2, 14.4, 14.5_
  
  - [ ]* 10.4 Write unit tests for import
    - Test import with valid entries
    - Test import with invalid entries (partial failure)
    - Test conflict resolution strategies
    - _Requirements: 14.2, 14.4, 14.5_


- [x] 11. Implement context sync operation
  - [x] 11.1 Implement sync-context command
    - Implement syncContext(project) method
    - Query entries with confidence>=0.8, status="active", evidence type "code" or "artifact"
    - Group by subject and generate summaries
    - Write summaries to ai-context/ directory
    - _Requirements: 7.8, 20.6, 20.7_
  
  - [ ]* 11.2 Write unit tests for context sync
    - Test filtering high-confidence entries
    - Test summary generation
    - Test ai-context/ file creation
    - _Requirements: 7.8, 20.6, 20.7_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement CLI commands
  - [x] 13.1 Create CLI command structure
    - Create src/cli/memory-commands.ts with command definitions
    - Set up argument parsing for all memory commands
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  
  - [x] 13.2 Implement memory init command
    - Command: bass-agents memory init <project>
    - Call MemoryAdapter.init(project)
    - Display success message with storage path
    - _Requirements: 7.5, 7.11, 7.12_
  
  - [x] 13.3 Implement memory list command
    - Command: bass-agents memory list [project] [--section] [--kind] [--scope] [--status] [--min-confidence]
    - Call MemoryAdapter.query(filters)
    - Display table with: Memory_ID, timestamp, section, kind, subject, scope, confidence, summary (first 80 chars)
    - _Requirements: 7.1, 7.9, 7.13_
  
  - [x] 13.4 Implement memory show command
    - Command: bass-agents memory show <entry-id>
    - Call MemoryAdapter.get(id)
    - Display all Memory_Entry fields including evidence array, status, tags, valid_from/valid_to
    - _Requirements: 7.2, 7.10_
  
  - [x] 13.5 Implement memory query command
    - Command: bass-agents memory query <text> [--section] [--kind] [--scope]
    - Call MemoryAdapter.query(filters with text search)
    - Display results with relevance ranking
    - _Requirements: 7.3, 7.13_
  
  - [x] 13.6 Implement memory compact command
    - Command: bass-agents memory compact [project] [--dry-run]
    - Call MemoryAdapter.compact(project, dryRun)
    - Display consolidation report
    - Prompt for confirmation if not dry-run
    - _Requirements: 7.4_
  
  - [x] 13.7 Implement memory validate-evidence command
    - Command: bass-agents memory validate-evidence [project]
    - Call MemoryAdapter.validateEvidence(project)
    - Display validation report with stale URIs
    - _Requirements: 7.6_
  
  - [x] 13.8 Implement memory check-freshness command
    - Command: bass-agents memory check-freshness [project]
    - Call MemoryAdapter.checkFreshness(project)
    - Display entries approaching expiry
    - _Requirements: 7.7_
  
  - [x] 13.9 Implement memory sync-context command
    - Command: bass-agents memory sync-context <project>
    - Call MemoryAdapter.syncContext(project)
    - Display summary of generated context files
    - _Requirements: 7.8_
  
  - [x] 13.10 Implement memory export command
    - Command: bass-agents memory export <project> <output-path> [--section] [--min-confidence]
    - Call MemoryAdapter.export(project, outputPath, filters)
    - Display export summary
    - _Requirements: 14.1_
  
  - [x] 13.11 Implement memory import command
    - Command: bass-agents memory import <project> <input-path> [--conflict-strategy]
    - Call MemoryAdapter.import(project, inputPath, strategy)
    - Display import report
    - _Requirements: 14.2_
  
  - [x]* 13.12 Write integration tests for CLI commands
    - Test each command with valid and invalid arguments
    - Test output formatting
    - Test error handling
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_


- [x] 14. Integrate memory with AgentTask execution
  - [x] 14.1 Implement memory context population for AgentTask
    - Create src/memory/agent-task-integration.ts
    - Implement populateMemoryContext(task) function
    - Query relevant entries based on project, goal, scope, subject
    - Limit to 10 entries with highest confidence
    - Filter: status="active", exclude expired entries, prefer code/artifact evidence
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9_
  
  - [ ]* 14.2 Write property test for AgentTask integration
    - **Property 19: AgentTask Memory Context Limit**
    - **Property 20: AgentTask Memory Context Ranking**
    - **Property 21: AgentTask Memory Context Status Filtering**
    - **Property 22: AgentTask Memory Context Freshness Filtering**
    - **Property 24: AgentTask Evidence Preference**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.8**
  
  - [x] 14.3 Implement graceful degradation for uninitialized memory
    - Handle uninitialized memory by returning empty memory_context
    - Log warning but allow agent run to proceed
    - _Requirements: 9.5_
  
  - [ ]* 14.4 Write property test for graceful degradation
    - **Property 27: Graceful Uninitialized Memory Handling**
    - **Validates: Requirements 9.5**

- [x] 15. Integrate memory with AgentResult processing
  - [x] 15.1 Implement memory updates from AgentResult
    - Create src/memory/agent-result-integration.ts
    - Implement applyMemoryUpdates(result) function
    - Validate each Memory_Update before applying
    - Apply create, supersede, deprecate operations
    - Record agent identifier in created_by field
    - _Requirements: 9.1, 9.2, 9.4_
  
  - [ ]* 15.2 Write property test for AgentResult integration
    - **Property 25: AgentResult Memory Updates Application**
    - **Property 26: AgentResult Partial Failure Handling**
    - **Validates: Requirements 9.1, 9.3**
  
  - [x] 15.3 Implement auto-initialization on first write
    - Detect uninitialized memory on Memory_Update
    - Auto-initialize with default configuration
    - Apply update after initialization
    - _Requirements: 9.6_
  
  - [ ]* 15.4 Write property test for auto-initialization
    - **Property 28: Auto-Initialization on First Write**
    - **Validates: Requirements 9.6**


- [x] 16. Implement concurrent write handling
  - [x] 16.1 Implement concurrent write safety
    - Leverage Beads hash-based IDs for conflict-free creates
    - Implement last-write-wins for update operations
    - Log concurrent write attempts
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [ ]* 16.2 Write property test for concurrent writes
    - **Property 30: Concurrent Write ID Uniqueness**
    - **Validates: Requirements 12.1, 12.2**
  
  - [x] 16.3 Implement version history access
    - Leverage git for version history
    - Document how to retrieve previous versions via git
    - _Requirements: 12.5_
  
  - [ ]* 16.4 Write property test for version history
    - **Property 31: Version History Preservation**
    - **Validates: Requirements 12.5**

- [x] 17. Implement workspace boundary enforcement
  - [x] 17.1 Add workspace boundary checks
    - Validate all file operations stay within workspace root
    - Reject operations attempting to write outside workspace
    - _Requirements: 2.7_
  
  - [ ]* 17.2 Write property test for workspace boundaries
    - **Property 5: Workspace Boundary Enforcement**
    - **Validates: Requirements 2.7**

- [x] 18. Implement error handling and logging
  - [x] 18.1 Create error handling module
    - Create src/memory/errors.ts with error types
    - Define error codes: VALIDATION_ERROR, STORAGE_ERROR, SECRET_DETECTED, EVIDENCE_INVALID, QUERY_ERROR, CONFLICT_ERROR
    - Implement error response format with code, message, details
    - _Requirements: 9.3_
  
  - [x] 18.2 Implement retry logic
    - Add retry logic for transient failures: Beads commands (3 retries), evidence validation (2 retries), git operations (3 retries)
    - Use exponential backoff
    - Log persistent failures
    - _Requirements: 11.1, 11.2_
  
  - [x] 18.3 Implement logging strategy
    - Set up logging with levels: INFO, WARN, ERROR, DEBUG
    - Log successful operations, validation failures, storage errors, secret detection, query performance
    - Include context in log messages
    - _Requirements: 11.2, 11.3_
  
  - [ ]* 18.4 Write unit tests for error handling
    - Test error response format
    - Test retry logic with transient failures
    - Test logging output
    - _Requirements: 9.3, 11.1, 11.2_

- [x] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 20. Implement performance optimizations
  - [ ] 20.1 Add query performance monitoring
    - Track query execution time
    - Log performance warnings when queries exceed thresholds
    - Provide query statistics in debug mode: execution time, entries scanned, entries returned
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [ ]* 20.2 Write performance tests
    - Test query performance with 10, 100, 1000 entries
    - Verify query time < 100ms for 100 entries
    - Verify query time < 500ms for 1000 entries
    - Test create operation time < 50ms
    - _Requirements: 11.1_
  
  - [ ] 20.3 Optimize indexing for common queries
    - Ensure Beads labels are used for fast filtering
    - Optimize subject, scope, kind, tags indexing
    - _Requirements: 2.8, 11.1_

- [ ] 21. Write documentation
  - [ ] 21.1 Create user guide
    - Document memory vs context decision criteria
    - Document memory sections and their semantics
    - Document CLI commands with examples
    - Document Memory_Entry schema and fields
    - Document evidence types and validation rules
    - Document smart retrieval rules and ranking
    - Document write policies and validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 16.1, 16.2, 16.3, 17.6, 17.7, 19.7_
  
  - [ ] 21.2 Create API documentation
    - Document MemoryAdapter interface
    - Document BeadsWrapper interface
    - Document validation functions
    - Document error types and handling
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  
  - [ ] 21.3 Create integration examples
    - Example: Creating memory entries from agent runs
    - Example: Querying memory with filters
    - Example: Superseding outdated entries
    - Example: Exporting and importing memory
    - Example: Evidence URI formats
    - _Requirements: 20.4, 20.5_

- [ ] 22. Write remaining property-based tests
  - [ ]* 22.1 Write property test for review interval metadata
    - **Property 45: Review Interval Metadata Persistence**
    - **Validates: Requirements 19.6**
  
  - [ ]* 22.2 Write property test for valid_to extension
    - **Property 46: Valid_To Extension on Update**
    - **Validates: Requirements 19.8**


- [ ] 23. Integration and wiring
  - [ ] 23.1 Wire memory system to agent execution pipeline
    - Integrate populateMemoryContext() into AgentTask creation flow
    - Integrate applyMemoryUpdates() into AgentResult processing flow
    - Ensure memory operations don't block agent execution
    - _Requirements: 8.1, 9.1_
  
  - [ ] 23.2 Register CLI commands with bass-agents CLI
    - Register all memory commands in CLI router
    - Ensure commands are accessible via bass-agents CLI
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  
  - [ ] 23.3 Create storage directory structure
    - Ensure ai-memory/ directory is created at workspace root
    - Create .gitignore entries if needed
    - Document storage layout
    - _Requirements: 2.2, 2.3, 20.3_
  
  - [ ]* 23.4 Write end-to-end integration tests
    - Test complete flow: AgentTask with memory_enabled → query → AgentResult with memory_updates → apply updates
    - Test CLI commands end-to-end
    - Test export/import round-trip
    - Test concurrent agent runs with memory
    - _Requirements: 8.1, 9.1, 14.1, 14.2_

- [ ] 24. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (46 total)
- Unit tests validate specific examples and edge cases
- All property tests should run with minimum 100 iterations
- Implementation uses TypeScript to match existing bass-agents codebase
- Beads storage layer provides conflict-free distributed writes via hash-based IDs
- Memory system gracefully degrades when unavailable (doesn't block agent execution)


- [x] 25. Implement Statistics API
  - [x] 25.1 Create statistics computation module
    - Create src/memory/statistics.ts with getStatistics() function
    - Implement basic counts: total_entries, entries_by_section, entries_by_status, entries_by_kind
    - Implement quality metrics: avg_confidence, confidence_distribution, evidence_type_distribution, low_confidence_count, stale_evidence_count
    - Implement growth trends: entries_created_over_time, entries_superseded_over_time (time series)
    - Implement agent activity: entries_by_agent, most_active_agents, recent_operations
    - Implement lifecycle metrics: superseded_percentage, entries_approaching_expiry, compaction_candidates
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.7, 22.8_
  
  - [x] 25.2 Implement query pattern tracking
    - Create query logging module to track query patterns
    - Log queries to ai-memory/{project}/.query-log.jsonl
    - Implement query log analysis: most_queried_subjects, most_queried_scopes, query_frequency_over_time
    - Implement log rotation (10MB or 10,000 entries)
    - _Requirements: 22.6_
  
  - [x] 25.3 Implement date range filtering for statistics
    - Add start_date and end_date filtering to getStatistics()
    - Filter entries by created_at timestamp
    - _Requirements: 22.10_
  
  - [ ]* 25.4 Write property test for statistics accuracy
    - **Property 47: Statistics Accuracy**
    - **Property 48: Statistics Date Range Filtering**
    - **Validates: Requirements 22.2, 22.10**
  
  - [ ]* 25.5 Write unit tests for statistics computation
    - Test basic counts with sample data
    - Test quality metrics calculation
    - Test time series aggregation
    - Test date range filtering
    - _Requirements: 22.2, 22.3, 22.4, 22.5, 22.7, 22.10_

- [x] 26. Implement Statistics Caching
  - [x] 26.1 Create statistics cache module
    - Create src/memory/statistics-cache.ts with cache management
    - Implement in-memory cache (Map<project, StatisticsCache>)
    - Cache structure: project, computed_at, expires_at (5 minutes), statistics
    - _Requirements: 22.9_
  
  - [x] 26.2 Implement cache invalidation
    - Time-based expiry: 5 minutes
    - Event-based invalidation: on memory write operations (create, supersede, deprecate)
    - Manual bypass: --no-cache flag
    - _Requirements: 22.9_
  
  - [x]* 26.3 Write unit tests for caching
    - Test cache hit/miss behavior
    - Test time-based expiry
    - Test event-based invalidation
    - Test cache bypass
    - _Requirements: 22.9_

- [x] 27. Implement Dashboard CLI Command
  - [x] 27.1 Create dashboard command structure
    - Command: bass-agents memory dashboard [project] [--all] [--refresh <seconds>] [--range <7d|30d|all>] [--no-cache]
    - Parse arguments and options
    - _Requirements: 21.1, 21.9, 21.10_
  
  - [x] 27.2 Implement dashboard data fetching
    - Call getStatistics() with project and date range filters
    - Use cache by default, bypass with --no-cache
    - Handle errors gracefully (show error message, don't crash)
    - _Requirements: 21.1, 21.9, 21.10_
  
  - [x] 27.3 Implement auto-refresh mechanism
    - Refresh statistics every 30 seconds (or custom interval)
    - Update display without clearing screen
    - _Requirements: 21.8_
  
  - [ ]* 27.4 Write property test for dashboard
    - **Property 49: Dashboard Auto-Refresh**
    - **Property 50: Dashboard Project Filtering**
    - **Validates: Requirements 21.8, 21.10**
  
  - [ ]* 27.5 Write integration tests for dashboard command
    - Test dashboard launch with valid project
    - Test dashboard with --all flag
    - Test dashboard with custom refresh interval
    - Test dashboard with date range filter
    - _Requirements: 21.1, 21.8, 21.9, 21.10_

- [x] 28. Implement Dashboard Visualizations
  - [x] 28.1 Set up terminal UI library
    - Choose and install blessed (Node.js) or rich (Python)
    - Create src/memory/dashboard-ui.ts with UI components
    - Set up responsive layout with panels
    - _Requirements: 23.10_
  
  - [x] 28.2 Implement summary panel
    - Display: total entries, active entries, avg confidence, stale evidence count
    - Apply color coding: green (healthy), yellow (warnings), red (issues)
    - _Requirements: 21.2, 23.1, 23.9_
  
  - [x] 28.3 Implement growth chart
    - Line chart showing entries created per day
    - Use ASCII art or terminal graphics
    - _Requirements: 21.3, 23.2_
  
  - [x] 28.4 Implement section pie chart
    - Pie chart showing entries by section (decisions, state, observations, learnings)
    - Display percentages
    - _Requirements: 21.2, 23.3_
  
  - [x] 28.5 Implement confidence bar chart
    - Bar chart showing confidence score distribution (0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
    - Display counts for each range
    - _Requirements: 21.4, 23.4_
  
  - [x] 28.6 Implement evidence bar chart
    - Bar chart showing evidence type distribution
    - Display counts for each type
    - _Requirements: 21.4, 23.5_
  
  - [x] 28.7 Implement active agents table
    - Table showing top 10 most active agents with entry counts
    - Sort by count descending
    - _Requirements: 21.5, 23.6_
  
  - [x] 28.8 Implement expiry table
    - Table showing entries approaching expiry (within 7 days)
    - Display: entry_id, summary, valid_to, days_remaining
    - Sort by days_remaining ascending
    - _Requirements: 21.7, 23.7_
  
  - [x] 28.9 Implement recent operations table
    - Table showing last 20 create/supersede/deprecate operations
    - Display: timestamp, operation, entry_id, agent, summary
    - Sort by timestamp descending
    - _Requirements: 21.5, 23.8_
  
  - [x] 28.10 Implement keyboard shortcuts
    - 'q': Quit dashboard
    - 'r': Manual refresh (bypass cache)
    - 'f': Change date range filter (7d, 30d, all)
    - 'p': Change project (if launched with --all)
    - '↑/↓': Scroll through tables
    - 'h': Show help overlay
    - _Requirements: 23.10_
  
  - [ ]* 28.11 Write property test for color coding
    - **Property 51: Dashboard Color Coding**
    - **Validates: Requirements 23.9**
  
  - [ ]* 28.12 Write unit tests for dashboard components
    - Test summary panel rendering
    - Test chart rendering with sample data
    - Test table rendering with sample data
    - Test color coding logic
    - Test keyboard shortcut handling
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9_

- [x] 29. Implement Statistics API CLI Access
  - [x] 29.1 Create stats command
    - Command: bass-agents memory stats [project] [--all] [--range <7d|30d|all>] [--json]
    - Call getStatistics() and format output
    - Default: human-readable summary
    - With --json: output JSON format
    - _Requirements: 22.8_
  
  - [ ]* 29.2 Write integration tests for stats command
    - Test stats command with valid project
    - Test stats command with --all flag
    - Test stats command with --json flag
    - Test stats command with date range filter
    - _Requirements: 22.8_

- [x] 30. Update documentation for analytics dashboard
  - [x] 30.1 Add dashboard documentation to user guide
    - Document dashboard command and options
    - Document dashboard layout and components
    - Document keyboard shortcuts
    - Document statistics API and stats command
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.10, 22.8_
  
  - [x] 30.2 Add analytics examples
    - Example: Launching dashboard for a project
    - Example: Using stats command for programmatic access
    - Example: Interpreting dashboard metrics
    - Example: Identifying issues from dashboard
    - _Requirements: 21.1, 22.8_

- [x] 31. Final checkpoint - Ensure all analytics tests pass
  - Ensure all analytics-related tests pass, ask the user if questions arise.
