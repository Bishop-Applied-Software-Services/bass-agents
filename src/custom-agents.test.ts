import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateProjectCustomAgents,
  getBundledAgentSourceDir,
} from './custom-agents';

describe('custom agent exports', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const tempRoot of tempRoots) {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('generates portable copies, claude exports, codex exports, and a manifest', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bass-agents-custom-'));
    tempRoots.push(projectRoot);

    const generated = await generateProjectCustomAgents(projectRoot);
    const sourceFiles = fs
      .readdirSync(getBundledAgentSourceDir())
      .filter(fileName => fileName.endsWith('.agent'))
      .sort((left, right) => left.localeCompare(right));

    expect(generated.agents).toHaveLength(sourceFiles.length);
    expect(fs.existsSync(generated.readmePath)).toBe(true);
    expect(fs.existsSync(generated.manifestPath)).toBe(true);

    const pmPortablePath = path.join(generated.portableDir, 'pm.agent');
    const pmClaudePath = path.join(generated.claudeDir, 'bass-pm', 'AGENT.md');
    const codexRootConfigPath = path.join(generated.codexDir, 'config.toml');
    const codexPmPath = path.join(generated.codexDir, 'agents', 'bass_pm.toml');
    expect(fs.existsSync(pmPortablePath)).toBe(true);
    expect(fs.existsSync(pmClaudePath)).toBe(true);
    expect(fs.existsSync(codexRootConfigPath)).toBe(true);
    expect(fs.existsSync(codexPmPath)).toBe(true);

    const portableContent = fs.readFileSync(pmPortablePath, 'utf8');
    const claudeContent = fs.readFileSync(pmClaudePath, 'utf8');
    const codexRootConfig = fs.readFileSync(codexRootConfigPath, 'utf8');
    const codexPmConfig = fs.readFileSync(codexPmPath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(generated.manifestPath, 'utf8')) as {
      codex_root_config_path: string;
      agents: Array<{ id: string; codex_agent_type: string; claude_tools: string[] }>;
    };

    expect(portableContent).toContain('# Agent Profile: PM (Product Manager)');
    expect(claudeContent).toContain('name: bass-pm');
    expect(claudeContent).toContain('model: sonnet');
    expect(claudeContent).toContain('You are PM, a product manager agent.');
    expect(claudeContent).toContain('tools: Read, Grep, Glob');
    expect(codexRootConfig).toContain('[features]');
    expect(codexRootConfig).toContain('multi_agent = true');
    expect(codexRootConfig).toContain('[agents.bass_pm]');
    expect(codexRootConfig).toContain('config_file = "agents/bass_pm.toml"');
    expect(codexPmConfig).toContain('agent_type = "bass_pm"');
    expect(codexPmConfig).toContain('model = "gpt-5.3-codex"');
    expect(codexPmConfig).toContain('sandbox_mode = "read-only"');
    expect(codexPmConfig).toContain('developer_instructions = """');
    expect(codexPmConfig).toContain('You are PM, a product manager agent.');
    expect(manifest.codex_root_config_path).toBe(generated.codexRootConfigPath);
    expect(manifest.agents.find(agent => agent.id === 'bass-pm')?.codex_agent_type).toBe('bass_pm');
    expect(manifest.agents.find(agent => agent.id === 'bass-coding-agent')?.claude_tools).toEqual([
      'Read',
      'Grep',
      'Glob',
      'Write',
      'Edit',
      'Bash',
    ]);
  });
});
