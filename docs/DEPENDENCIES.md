# Dependencies

This document lists all dependencies required for the bass-agents project, including installation instructions and version requirements.

## System Requirements

- **Operating System**: Linux, macOS, FreeBSD, or Windows
- **Node.js**: v20.10.6 or later
- **Git**: Required for version control and Beads functionality
- **RAM**: At least 4 GB
- **Disk Space**: Minimum 100 MB free

## Node.js Dependencies

### Production Dependencies

All production dependencies are listed in `package.json` and installed via `npm install`:

- **blessed** (^0.1.81): Terminal UI library for the memory dashboard
- **@types/blessed** (^0.1.27): TypeScript type definitions for blessed
- **@types/node** (^20.10.6): TypeScript type definitions for Node.js
- **typescript** (^5.3.3): TypeScript compiler

### Development Dependencies

- **vitest** (^1.1.0): Testing framework for unit and integration tests
- **@vitest/ui** (^1.1.0): Web UI for Vitest test runner
- **ts-node** (^10.9.2): TypeScript execution environment for scripts

### Installation

```bash
# Install all Node.js dependencies
npm install

# Install ts-node globally (optional, for running scripts directly)
npm install -g ts-node
```

## External Tools

### Beads CLI (Required)

**Purpose**: Beads is a git-native issue tracker that provides the storage layer for the durable memory system. It stores memory entries as JSONL files with version control, dependency tracking, and conflict-free concurrent writes.

**Version**: 0.55.4 or later

**Installation Options**:

```bash
# Option 1: npm (recommended)
npm install -g @beads/bd

# Option 2: Homebrew (macOS/Linux)
brew install beads

# Option 3: Go
go install github.com/steveyegge/beads/cmd/bd@latest
```

**Verification**:

```bash
bd --version
# Expected output: bd version 0.55.4 (or later)
```

**Key Features Used**:
- `bd init`: Initialize Beads repository
- `bd create`: Create new memory entries
- `bd update`: Update existing entries (supersede, deprecate)
- `bd list`: Query memory entries
- `bd show`: Retrieve specific entries
- `bd compact`: Consolidate old entries (memory decay)

**Documentation**: [https://github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## Dependency Usage by Component

### Memory System (`src/memory/`)

**Required**:
- Node.js (runtime)
- TypeScript (compilation)
- Beads CLI (`bd` command)

**Used by**:
- `memory-adapter.ts`: Core memory operations using Beads
- `dashboard-ui.ts`: Terminal UI using blessed
- `statistics.ts`: Memory analytics
- `query-logger.ts`: Query performance tracking

### CLI Commands (`src/cli/`)

**Required**:
- Node.js (runtime)
- TypeScript (compilation)

**Used by**:
- `memory-commands.ts`: CLI interface for memory operations

### Scripts (`scripts/`)

**Required**:
- Node.js (runtime)
- ts-node (TypeScript execution)
- Beads CLI (`bd` command)

**Used by**:
- `generate-test-data.ts`: Test data generation
- `view-memory-stats.ts`: Statistics viewer

### Tests (`**/*.test.ts`)

**Required**:
- Node.js (runtime)
- Vitest (test runner)
- Beads CLI (`bd` command)

**Used by**:
- All test files in `src/memory/`

## Installation Checklist

Use this checklist to verify all dependencies are properly installed:

- [ ] Node.js v20.10.6+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Node.js packages installed (`npm install`)
- [ ] TypeScript compiler available (`npx tsc --version`)
- [ ] Vitest available (`npx vitest --version`)
- [ ] ts-node available (`npx ts-node --version` or `ts-node --version`)
- [ ] Beads CLI installed (`bd --version`)

## Quick Start

```bash
# 1. Install Node.js dependencies
npm install

# 2. Install Beads CLI (choose one method)
npm install -g @beads/bd        # via npm
brew install beads              # via Homebrew
go install github.com/steveyegge/beads/cmd/bd@latest  # via Go

# 3. Install ts-node globally (optional)
npm install -g ts-node

# 4. Verify installations
node --version
npm --version
bd --version
npx ts-node --version

# 5. Run tests to verify everything works
npm test

# 6. Generate test data
npx ts-node scripts/generate-test-data.ts bass-agents
```

## Troubleshooting

### Beads CLI Not Found

**Problem**: `bd: command not found`

**Solutions**:
1. Verify installation: `npm list -g @beads/bd`
2. Check PATH includes npm global bin: `npm config get prefix`
3. Reinstall: `npm install -g @beads/bd`
4. Try alternative installation method (Homebrew or Go)

### ts-node Not Found

**Problem**: `ts-node: command not found`

**Solutions**:
1. Use npx: `npx ts-node script.ts`
2. Install globally: `npm install -g ts-node`
3. Add to package.json scripts and use `npm run`

### TypeScript Compilation Errors

**Problem**: Type errors when running scripts

**Solutions**:
1. Ensure TypeScript is installed: `npm install`
2. Check tsconfig.json is present
3. Run type check: `npx tsc --noEmit`

### Beads Repository Initialization Fails

**Problem**: `Failed to initialize Beads repository`

**Solutions**:
1. Verify Git is installed: `git --version`
2. Check write permissions in workspace
3. Ensure `bd init` works manually in test directory
4. Check Beads documentation for system-specific issues

### Beads Commands Fail with "no beads database found"

**Problem**: `bd create` or other commands fail with "no beads database found" even after `bd init`

**Root Cause**: Beads commands must be run from within the Beads repository directory (where `.beads/` exists), but the current implementation runs them from the workspace root with `cwd` parameter.

**Solutions**:
1. Run `bd init` in the memory directory: `cd ai-memory/{project} && bd init`
2. Add `no-db: true` to `.beads/config.yaml` for JSONL-only mode
3. Ensure all `bd` commands are executed with `cwd` set to the memory path
4. **Known Issue**: The current implementation may have issues with Beads command execution context. This is being tracked for resolution.

**Workaround**: Manually initialize Beads repositories:
```bash
cd ai-memory/bass-agents
bd init
# Then run the test data script
```

### Beads DB/CGO Compatibility (Fallback Behavior)

**Problem**: Some environments run a Beads binary that cannot open a Dolt database
(for example, embedded mode requiring CGO). In these cases, write commands such as
`bd create` and `bd update` can fail even after successful `bd init`.

**Current behavior in this repo**:
- `MemoryAdapter` attempts normal `bd` commands first.
- If `bd` returns DB/CGO compatibility errors (`no beads database found`,
  Dolt backend missing, CGO-required embedded mode), `MemoryAdapter` falls back to
  direct JSONL writes/updates in `.beads/issues.jsonl`.
- Reads already use `.beads/issues.jsonl`, so memory seeding and query flows remain usable.

**Why this exists**: It keeps durable-memory workflows operational across mixed local
Beads builds while preserving a single storage format for this project.

## Security Considerations

### npm Audit

The project may show npm audit warnings. Review them with:

```bash
npm audit
npm audit fix  # Apply automatic fixes
```

### Secret Detection

The memory system includes built-in secret detection to prevent storing sensitive data. This is implemented in `src/memory/validation.ts`.

## Version Compatibility

| Component | Minimum Version | Tested Version | Notes |
|-----------|----------------|----------------|-------|
| Node.js | 20.10.6 | 20.10.6 | LTS version recommended |
| TypeScript | 5.3.3 | 5.3.3 | Strict mode enabled |
| Vitest | 1.1.0 | 1.1.0 | Test framework |
| Beads CLI | 0.55.4 | 0.55.4 | Storage layer |
| blessed | 0.1.81 | 0.1.81 | Terminal UI |

## Future Dependencies

Potential future dependencies under consideration:

- **Dolt**: Beads supports Dolt-powered version control (currently using JSONL + Git)
- **Additional UI frameworks**: For web-based memory dashboard
- **Performance monitoring**: For production memory system analytics

## Contributing

When adding new dependencies:

1. Add to `package.json` with specific version constraints
2. Update this document with purpose and usage
3. Update installation instructions in README.md
4. Test installation on clean environment
5. Document any system-specific requirements
