import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from './init-command';

describe('init command', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const tempRoot of tempRoots) {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('exports project-local custom-agent bundles during init', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bass-agents-init-'));
    tempRoots.push(projectRoot);

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message));
    });

    await main(['--no-durable-memory', '--project', projectRoot]);

    expect(fs.existsSync(path.join(projectRoot, '.bass-agents', 'config.json'))).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectRoot, '.bass-agents', 'custom-agents', 'claude', 'bass-metaagent', 'AGENT.md')
      )
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, '.bass-agents', 'custom-agents', 'codex', 'config.toml'))
    ).toBe(true);
    expect(logs.some(line => line.includes('Custom agents: exported'))).toBe(true);
    expect(logs.some(line => line.includes('.claude/agents'))).toBe(true);
    expect(logs.some(line => line.includes('.codex'))).toBe(true);
    expect(logs.some(line => line.includes('install-custom-agents'))).toBe(true);
  });

  it('prompts for custom-agent installation during interactive init', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bass-agents-init-interactive-'));
    tempRoots.push(projectRoot);

    const answers = ['n', 'y', 'codex', 'project'];
    const prompts: string[] = [];
    const logs: string[] = [];
    const close = vi.fn();

    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message));
    });

    await main(['--project', projectRoot], {
      createPromptSession: () => ({
        ask(question: string): Promise<string> {
          prompts.push(question);
          return Promise.resolve(answers.shift() ?? '');
        },
        close,
      }),
    });

    expect(prompts).toEqual([
      'Enable durable memory for this project? [y/N] ',
      'Install generated custom agents now? [y/N] ',
      'Install custom agents for [both/claude/codex]? [both] ',
      'Install custom agents into [project/user] config roots? [project] ',
    ]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      fs.existsSync(path.join(projectRoot, '.codex', 'config.toml'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, '.claude', 'agents'))
    ).toBe(false);
    expect(logs.some(line => line.includes('Codex agents installed:'))).toBe(true);
  });
});
