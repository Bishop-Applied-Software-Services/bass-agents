import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

describe('memory-dashboard-web.py', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const tempRoot of tempRoots) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  it('fails before writing HTML when ticket data cannot load', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-dashboard-web-'));
    tempRoots.push(tempRoot);

    const projectRoot = path.join(tempRoot, 'project');
    const memoryRoot = path.join(projectRoot, 'ai-memory');
    const outputPath = path.join(
      projectRoot,
      '.bass-agents',
      'dashboards',
      'memory-dashboard.html'
    );
    const binRoot = path.join(tempRoot, 'bin');
    const scriptPath = path.join(process.cwd(), 'scripts', 'memory-dashboard-web.py');

    fs.mkdirSync(path.join(memoryRoot, '.beads'), { recursive: true });
    fs.mkdirSync(binRoot, { recursive: true });
    fs.writeFileSync(
      path.join(binRoot, 'bd'),
      '#!/bin/sh\necho "failed to open database: Dolt server unreachable" >&2\nexit 1\n',
      'utf-8'
    );
    fs.chmodSync(path.join(binRoot, 'bd'), 0o755);

    let thrown:
      | (Error & { status?: number; stderr?: string | Buffer; stdout?: string | Buffer })
      | undefined;

    try {
      execFileSync(
        'python3',
        [
          scriptPath,
          '--root',
          memoryRoot,
          '--project-root',
          projectRoot,
          '--out',
          outputPath,
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            PATH: `${binRoot}:${process.env.PATH ?? ''}`,
          },
          encoding: 'utf-8',
        }
      );
    } catch (error) {
      thrown = error as Error & {
        status?: number;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
    }

    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(1);
    expect(String(thrown?.stderr ?? '')).toContain('Ticket data unavailable:');
    expect(String(thrown?.stderr ?? '')).toContain(
      'bd list --json --all --limit 0: failed to open database: Dolt server unreachable'
    );
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
