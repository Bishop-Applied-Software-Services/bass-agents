import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('run-with-bass-agents', () => {
  const repoRoot = path.join(__dirname, '../..');
  let tempDir: string;
  let fakeBinDir: string;
  let fakeClaudeLog: string;
  let runLogDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-with-bass-agents-'));
    fakeBinDir = path.join(tempDir, 'bin');
    fakeClaudeLog = path.join(tempDir, 'claude-invocation.log');
    runLogDir = path.join(tempDir, 'run-logs');

    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.mkdirSync(runLogDir, { recursive: true });

    const fakeClaudePath = path.join(fakeBinDir, 'claude');
    fs.writeFileSync(
      fakeClaudePath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "%s\\n" "$#" > "$FAKE_CLAUDE_LOG"',
        'if [[ "$#" -gt 0 ]]; then',
        '  printf "%s\\n" "$@" >> "$FAKE_CLAUDE_LOG"',
        'fi',
        'printf "fake claude ok\\n"',
      ].join('\n'),
    );
    fs.chmodSync(fakeClaudePath, 0o755);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('handles smoke-test launches with no trailing tool args', () => {
    const bassAgentsPath = path.join(repoRoot, 'bin/bass-agents');
    const result = spawnSync(
      bassAgentsPath,
      ['run', '--tool', 'claude', '--smoke-test', '--log-dir', runLogDir],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
          FAKE_CLAUDE_LOG: fakeClaudeLog,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[bass-agents] smoke-test mode enabled for claude');
    expect(result.stdout).toContain('[bass-agents] launching: claude --model sonnet --disable-slash-commands --no-session-persistence');
    expect(result.stdout).toContain('[bass-agents] smoke-test mode: skipping session review');
    expect(result.stdout).not.toContain('unbound variable');

    const invocation = fs.readFileSync(fakeClaudeLog, 'utf8').trim().split(/\r?\n/);
    expect(invocation).toEqual([
      '4',
      '--model',
      'sonnet',
      '--disable-slash-commands',
      '--no-session-persistence',
    ]);

    const runLogs = fs
      .readdirSync(runLogDir)
      .filter((fileName) => fileName.endsWith('.log'));
    expect(runLogs.length).toBe(1);
  });
});
