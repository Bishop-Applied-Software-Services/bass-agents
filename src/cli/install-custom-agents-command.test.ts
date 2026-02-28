import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CODEX_MANAGED_ROLE_BLOCK_START,
  CODEX_MANAGED_ROLE_BLOCK_END,
} from '../custom-agents';
import { main } from './install-custom-agents-command';

describe('install-custom-agents command', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const tempRoot of tempRoots) {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('installs Claude and Codex bundles into project config dirs and merges Codex config idempotently', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bass-agents-install-custom-'));
    tempRoots.push(projectRoot);

    const existingCodexDir = path.join(projectRoot, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingCodexDir, 'config.toml'),
      [
        'model = "gpt-5"',
        '',
        '[features]',
        'multi_agent = false',
        'background_shell = true',
        '',
        '[profiles.default]',
        'sandbox_mode = "workspace-write"',
        '',
      ].join('\n'),
      'utf8'
    );

    await main(['--project', projectRoot, '--scope', 'project', '--tool', 'all']);
    await main(['--project', projectRoot, '--scope', 'project', '--tool', 'all']);

    const claudePmPath = path.join(projectRoot, '.claude', 'agents', 'bass-pm', 'AGENT.md');
    const codexAgentPath = path.join(projectRoot, '.codex', 'agents', 'bass_pm.toml');
    const codexConfigPath = path.join(projectRoot, '.codex', 'config.toml');

    expect(fs.existsSync(claudePmPath)).toBe(true);
    expect(fs.existsSync(codexAgentPath)).toBe(true);
    expect(fs.readFileSync(claudePmPath, 'utf8')).toContain('name: bass-pm');
    expect(fs.readFileSync(codexAgentPath, 'utf8')).toContain('agent_type = "bass_pm"');

    const codexConfig = fs.readFileSync(codexConfigPath, 'utf8');
    expect(codexConfig).toContain('model = "gpt-5"');
    expect(codexConfig).toContain('multi_agent = true');
    expect(codexConfig).toContain('[profiles.default]');
    expect(codexConfig).toContain(CODEX_MANAGED_ROLE_BLOCK_START);
    expect(codexConfig).toContain(CODEX_MANAGED_ROLE_BLOCK_END);
    expect((codexConfig.match(new RegExp(CODEX_MANAGED_ROLE_BLOCK_START, 'g')) || []).length).toBe(1);
    expect(codexConfig).toContain('[agents.bass_pm]');
  });
});
