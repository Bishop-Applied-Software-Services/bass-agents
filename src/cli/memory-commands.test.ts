import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedProjectContext } from '../project-context';

type MockAdapter = {
  init: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  supersede: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
};

const context: ResolvedProjectContext = {
  configPath: '/workspace/.bass-agents/config.json',
  initialized: true,
  projectName: 'test-cli-project',
  projectRoot: '/workspace',
  memoryRoot: '/workspace/ai-memory',
  sessionReviewRoot: '/workspace/session-reviews',
  agtraceRoot: '/workspace/.agtrace',
  dashboardsRoot: '/workspace/.bass-agents/dashboards',
  aiContextRoot: '/workspace/ai-context',
  durableMemoryEnabled: true,
};

let adapter: MockAdapter;

async function loadCli() {
  vi.doMock('../memory/memory-adapter', () => ({
    MemoryAdapter: vi.fn(() => adapter),
  }));

  vi.doMock('../project-context', () => ({
    resolveProjectRoot: vi.fn(() => context.projectRoot),
    loadProjectContext: vi.fn(() => context),
    assertPathWithinProject: vi.fn((_projectRoot: string, targetPath: string) => targetPath),
  }));

  return import('./memory-commands');
}

describe('Memory CLI Commands', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
    adapter = {
      init: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue('bass-agents-new'),
      supersede: vi.fn().mockResolvedValue('bass-agents-replacement'),
      query: vi.fn().mockResolvedValue([]),
    };
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes durable memory for the current project', async () => {
    const { main } = await loadCli();

    await main(['init']);

    expect(adapter.init).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      `Initialized durable memory at ${context.memoryRoot}`
    );
  });

  it('creates a memory entry from CLI flags', async () => {
    const { main } = await loadCli();

    await main([
      'create',
      '--section',
      'decisions',
      '--kind',
      'decision',
      '--subject',
      'memory.cli',
      '--scope',
      'repo',
      '--summary',
      'Add memory write commands',
      '--content',
      'The memory CLI now supports direct durable-memory writes.',
      '--confidence',
      '0.92',
      '--evidence',
      'doc|README.md|README documents the command',
      '--tag',
      'workflow',
      '--tags',
      'tooling,docs',
      '--related-entry',
      'bass-agents-abc',
      '--related-entries',
      'bass-agents-def,bass-agents-ghi',
      '--provenance-source-type',
      'manual',
      '--provenance-note',
      'Captured from wrap-up workflow',
      '--created-by',
      'wrap-up-skill',
    ]);

    expect(adapter.create).toHaveBeenCalledWith({
      section: 'decisions',
      kind: 'decision',
      subject: 'memory.cli',
      scope: 'repo',
      summary: 'Add memory write commands',
      content: 'The memory CLI now supports direct durable-memory writes.',
      confidence: 0.92,
      evidence: [
        {
          type: 'doc',
          uri: 'README.md',
          note: 'README documents the command',
        },
      ],
      tags: ['tooling', 'docs', 'workflow'],
      related_entries: ['bass-agents-def', 'bass-agents-ghi', 'bass-agents-abc'],
      provenance: {
        source_type: 'manual',
        note: 'Captured from wrap-up workflow',
      },
      created_by: 'wrap-up-skill',
    });
    expect(logSpy).toHaveBeenCalledWith('Created memory entry bass-agents-new');
  });

  it('accepts the legacy current-project positional arg for create', async () => {
    const { main } = await loadCli();

    await main([
      'create',
      context.projectName,
      '--section',
      'state',
      '--kind',
      'other',
      '--subject',
      'memory.compat',
      '--scope',
      'repo',
      '--summary',
      'Legacy project arg still works',
      '--content',
      'The CLI ignores the current project name when passed in the legacy position.',
      '--confidence',
      '0.8',
      '--evidence-type',
      'doc',
      '--evidence-uri',
      'README.md',
      '--evidence-note',
      'Compatibility note',
    ]);

    expect(adapter.create).toHaveBeenCalledTimes(1);
  });

  it('supersedes an existing entry with replacement content', async () => {
    const { main } = await loadCli();

    await main([
      'supersede',
      'bass-agents-old',
      '--section',
      'decisions',
      '--kind',
      'decision',
      '--subject',
      'memory.cli',
      '--scope',
      'repo',
      '--summary',
      'Use the direct write CLI',
      '--content',
      'The CLI replacement entry updates the prior memory command guidance.',
      '--confidence',
      '0.95',
      '--evidence',
      'doc|README.md|Updated README command examples',
      '--created-by',
      'wrap-up-skill',
    ]);

    expect(adapter.supersede).toHaveBeenCalledWith('bass-agents-old', {
      section: 'decisions',
      kind: 'decision',
      subject: 'memory.cli',
      scope: 'repo',
      summary: 'Use the direct write CLI',
      content: 'The CLI replacement entry updates the prior memory command guidance.',
      confidence: 0.95,
      evidence: [
        {
          type: 'doc',
          uri: 'README.md',
          note: 'Updated README command examples',
        },
      ],
      created_by: 'wrap-up-skill',
    });
    expect(logSpy).toHaveBeenCalledWith(
      'Superseded bass-agents-old with bass-agents-replacement'
    );
  });

  it('treats the legacy current-project arg as metadata, not query text', async () => {
    adapter.query.mockResolvedValue([
      {
        id: 'bass-agents-xyz',
        section: 'learnings',
        kind: 'other',
        subject: 'wrap-up.workflow',
        scope: 'repo',
        summary: 'Session improvement note',
        content: 'This entry mentions session improvement explicitly.',
        tags: [],
        confidence: 0.88,
        evidence: [{ type: 'doc', uri: 'README.md', note: 'Relevant note' }],
        provenance: { source_type: 'manual' },
        status: 'active',
        superseded_by: null,
        related_entries: [],
        created_by: 'wrap-up-skill',
        created_at: '2026-02-28T00:00:00.000Z',
        updated_at: '2026-02-28T00:00:00.000Z',
      },
    ]);

    const { main } = await loadCli();

    await main(['query', context.projectName, 'session improvement']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('bass-agents-xyz'));
    expect(logSpy).toHaveBeenCalledWith('\nFound: 1 matching entries');
  });
});
