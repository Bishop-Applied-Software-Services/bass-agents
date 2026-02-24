# Concurrent Write Handling in Durable Memory

## Overview

The durable memory system handles concurrent writes safely through Beads' hash-based ID system and last-write-wins strategy for updates. This document explains how concurrent operations work and how to access version history.

## Conflict-Free Creates (Requirements 12.1, 12.2)

### How It Works

When multiple agents create memory entries simultaneously, Beads assigns each entry a unique hash-based ID (format: `bd-XXXX`). These IDs are deterministic based on content but guaranteed unique, preventing ID collisions.

**Example:**
```typescript
// Agent 1 creates entry
const id1 = await adapter.create(project, {
  section: 'decisions',
  kind: 'decision',
  subject: 'auth-service.api',
  // ... other fields
});
// Returns: bd-a1b2c3

// Agent 2 creates entry simultaneously
const id2 = await adapter.create(project, {
  section: 'decisions',
  kind: 'decision',
  subject: 'payment-service.api',
  // ... other fields
});
// Returns: bd-d4e5f6 (different ID, no conflict)
```

### Key Properties

- **No ID collisions**: Each create operation gets a unique ID
- **No data corruption**: Concurrent creates don't interfere with each other
- **Automatic logging**: All create operations are logged for debugging

## Last-Write-Wins Updates (Requirement 12.3)

### How It Works

For update operations (supersede, deprecate), the system uses a last-write-wins strategy. If multiple agents update the same entry simultaneously, the last write to complete will be the final state.

**Example:**
```typescript
// Agent 1 supersedes entry bd-abc123
await adapter.supersede(project, 'bd-abc123', replacementEntry1);

// Agent 2 supersedes same entry simultaneously
await adapter.supersede(project, 'bd-abc123', replacementEntry2);

// Result: The last operation to complete wins
// Both replacement entries are created (different IDs)
// The target entry's final status depends on which update completed last
```

### Conflict Resolution

- **Custom fields**: Last write wins
- **Labels**: Additive (multiple agents can add different labels)
- **Dependencies**: Additive (multiple agents can add different relationships)
- **Git metadata**: Handled by git merge

## Concurrent Write Logging (Requirement 12.4)

### Log Format

All write operations are logged to stderr in JSON format:

```json
{
  "timestamp": "2026-02-22T10:30:45.123Z",
  "operation": "create",
  "project": "auth-service",
  "entryId": "bd-a1b2c3",
  "agent": "agent-1",
  "duration_ms": 45
}
```

### Log Operations

- `create`: New memory entry created
- `supersede`: Entry superseded with replacement
- `deprecate`: Entry marked as deprecated

### Accessing Logs

Logs are written to stderr with prefix `[MEMORY_WRITE]`:

```bash
# View all memory write operations
bass-agents memory list 2>&1 | grep MEMORY_WRITE

# Filter by operation type
bass-agents memory list 2>&1 | grep MEMORY_WRITE | grep create

# Filter by project
bass-agents memory list 2>&1 | grep MEMORY_WRITE | grep auth-service
```

## Version History (Requirement 12.5)

### How It Works

Beads stores all memory entries in git, providing automatic version history. Every create, update, supersede, and deprecate operation is committed to git.

### Accessing Version History

Use the `getVersionHistoryInstructions()` method or follow these steps:

```bash
# 1. Navigate to memory directory
cd ai-memory/{project}/.beads/

# 2. View entry history
git log --all --oneline -- "*bd-abc123*"

# 3. View specific version
git show <commit-hash>:<file-path>

# 4. Compare versions
git diff <commit1> <commit2> -- "*bd-abc123*"
```

### Example

```bash
# View history for entry bd-abc123 in auth-service project
cd ai-memory/auth-service/.beads/
git log --all --oneline -- "*bd-abc123*"

# Output:
# a1b2c3d Updated entry bd-abc123
# e4f5g6h Created entry bd-abc123

# View the original version
git show e4f5g6h:issues/bd-abc123.json
```

## Best Practices

### For Agent Developers

1. **Don't retry on conflicts**: Beads handles conflicts automatically
2. **Use unique subjects**: Helps prevent duplicate detection issues
3. **Check logs for debugging**: Use stderr logs to track concurrent operations
4. **Leverage version history**: Use git to investigate unexpected changes

### For System Administrators

1. **Monitor logs**: Watch for high-frequency concurrent writes
2. **Review version history**: Use git to audit changes
3. **Set up log aggregation**: Collect stderr logs for analysis
4. **Configure git hooks**: Add pre-commit or post-commit hooks if needed

## Implementation Details

### Beads Hash-Based IDs

Beads generates IDs using content hashing:
- Format: `bd-{hash}` where hash is first 6 characters of SHA-256
- Deterministic: Same content → same hash
- Collision-resistant: Different content → different hash

### Git Integration

Beads automatically commits changes:
- Each operation creates a git commit
- Commit messages include operation type and entry ID
- Full git history available for audit and rollback

### Performance Considerations

- **Create operations**: O(1) time, no locking required
- **Update operations**: O(1) time, last-write-wins
- **Query operations**: Not affected by concurrent writes
- **Log overhead**: Minimal (JSON serialization + stderr write)

## Troubleshooting

### Issue: Unexpected entry state after concurrent updates

**Solution**: Check version history to see which update completed last:

```bash
cd ai-memory/{project}/.beads/
git log --all -- "*{entryId}*"
```

### Issue: Missing log entries

**Solution**: Ensure stderr is not being redirected or filtered:

```bash
# Capture both stdout and stderr
bass-agents memory list 2>&1 | tee memory.log
```

### Issue: Git conflicts during concurrent writes

**Solution**: Beads handles git conflicts automatically. If manual resolution is needed:

```bash
cd ai-memory/{project}/.beads/
git status
git merge --continue
```

## References

- Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
- Design: Conflict Resolution Strategy section
- Beads documentation: https://github.com/steveyegge/beads
