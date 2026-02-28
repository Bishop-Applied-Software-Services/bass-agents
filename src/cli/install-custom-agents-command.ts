#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CODEX_MANAGED_ROLE_BLOCK_END,
  CODEX_MANAGED_ROLE_BLOCK_START,
  generateProjectCustomAgents,
  GeneratedCustomAgents,
  renderCodexManagedRoleBlock,
} from '../custom-agents';
import { resolveProjectRoot } from '../project-context';

export type InstallTool = 'all' | 'claude' | 'codex';
export type InstallScope = 'project' | 'user';

interface ParsedInstallArgs {
  projectRoot: string;
  scope: InstallScope;
  tool: InstallTool;
}

function parseArgs(argv: string[]): ParsedInstallArgs {
  let projectRoot = process.cwd();
  let scope: InstallScope = 'project';
  let tool: InstallTool = 'all';

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--project':
        projectRoot = argv[index + 1];
        if (!projectRoot) {
          throw new Error('--project requires a path');
        }
        index++;
        break;
      case '--scope': {
        const value = argv[index + 1];
        if (value !== 'project' && value !== 'user') {
          throw new Error('--scope must be project or user');
        }
        scope = value;
        index++;
        break;
      }
      case '--tool': {
        const value = argv[index + 1];
        if (value !== 'all' && value !== 'claude' && value !== 'codex') {
          throw new Error('--tool must be all, claude, or codex');
        }
        tool = value;
        index++;
        break;
      }
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown install-custom-agents option: ${arg}`);
    }
  }

  return {
    projectRoot: resolveProjectRoot(projectRoot),
    scope,
    tool,
  };
}

function showHelp(): void {
  console.log(`
bass-agents install-custom-agents - Install generated Claude/Codex agent bundles

Usage:
  bass-agents install-custom-agents [options]

Options:
  --project <path>         Source project root containing .bass-agents/custom-agents/ (default: cwd)
  --scope <project|user>   Install into project-local or user-local config roots (default: project)
  --tool <all|claude|codex> Install Claude bundles, Codex bundles, or both (default: all)
`);
}

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const installed = await installCustomAgents(parsed.projectRoot, parsed.scope, parsed.tool);

  if (installed.claudeTarget) {
    console.log(`Installed Claude agents to ${installed.claudeTarget}`);
  }

  if (installed.codexTarget) {
    console.log(`Installed Codex agents to ${installed.codexTarget}`);
  }
}

export async function installCustomAgents(
  projectRoot: string,
  scope: InstallScope,
  tool: InstallTool,
  generated?: GeneratedCustomAgents
): Promise<{ claudeTarget: string | null; codexTarget: string | null }> {
  const generatedBundles = generated ?? (await generateProjectCustomAgents(projectRoot));
  let claudeTarget: string | null = null;
  let codexTarget: string | null = null;

  if (tool === 'all' || tool === 'claude') {
    claudeTarget = getClaudeTargetRoot(projectRoot, scope);
    await installClaudeAgents(generatedBundles.claudeDir, claudeTarget);
  }

  if (tool === 'all' || tool === 'codex') {
    codexTarget = getCodexTargetRoot(projectRoot, scope);
    await installCodexAgents(generatedBundles.codexDir, codexTarget, generatedBundles.agents);
  }

  return { claudeTarget, codexTarget };
}

async function installClaudeAgents(sourceDir: string, targetDir: string): Promise<void> {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const agentDirs = (await fs.promises.readdir(sourceDir)).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const agentDir of agentDirs) {
    const sourcePath = path.join(sourceDir, agentDir);
    const targetPath = path.join(targetDir, agentDir);
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    await fs.promises.cp(sourcePath, targetPath, { recursive: true });
  }
}

async function installCodexAgents(
  sourceDir: string,
  targetDir: string,
  agents: Array<{ codexAgentType: string; description: string }>
): Promise<void> {
  const sourceAgentsDir = path.join(sourceDir, 'agents');
  const targetAgentsDir = path.join(targetDir, 'agents');
  await fs.promises.mkdir(targetAgentsDir, { recursive: true });

  const agentFiles = (await fs.promises.readdir(sourceAgentsDir)).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const agentFile of agentFiles) {
    const sourcePath = path.join(sourceAgentsDir, agentFile);
    const targetPath = path.join(targetAgentsDir, agentFile);
    await fs.promises.copyFile(sourcePath, targetPath);
  }

  const configPath = path.join(targetDir, 'config.toml');
  const existingConfig = await readIfExists(configPath);
  const mergedConfig = mergeCodexConfig(existingConfig, renderCodexManagedRoleBlock(agents));
  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.writeFile(configPath, mergedConfig, 'utf8');
}

export function mergeCodexConfig(existingConfig: string, managedRoleBlock: string): string {
  const withoutManagedBlock = removeManagedRoleBlock(existingConfig).trimEnd();
  const withFeatureEnabled = ensureCodexMultiAgentEnabled(withoutManagedBlock);
  const body = withFeatureEnabled.trimEnd();

  return `${body}${body ? '\n\n' : ''}${managedRoleBlock}\n`;
}

function removeManagedRoleBlock(config: string): string {
  if (!config.includes(CODEX_MANAGED_ROLE_BLOCK_START)) {
    return config;
  }

  const pattern = new RegExp(
    `${escapeRegExp(CODEX_MANAGED_ROLE_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CODEX_MANAGED_ROLE_BLOCK_END)}\\n?`,
    'g'
  );
  return config.replace(pattern, '').trimEnd();
}

function ensureCodexMultiAgentEnabled(config: string): string {
  const lines = config.length > 0 ? config.split(/\r?\n/) : [];
  const featuresIndex = lines.findIndex(line => line.trim() === '[features]');

  if (featuresIndex === -1) {
    const suffix = lines.length > 0 ? ['', '[features]', 'multi_agent = true'] : ['[features]', 'multi_agent = true'];
    return [...lines, ...suffix].join('\n').trimEnd();
  }

  let sectionEnd = lines.length;
  for (let index = featuresIndex + 1; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (/^\[.+\]$/.test(trimmed)) {
      sectionEnd = index;
      break;
    }
  }

  const multiAgentIndex = lines.findIndex(
    (line, index) =>
      index > featuresIndex &&
      index < sectionEnd &&
      line.trim().startsWith('multi_agent')
  );

  if (multiAgentIndex !== -1) {
    lines[multiAgentIndex] = 'multi_agent = true';
    return lines.join('\n').trimEnd();
  }

  lines.splice(featuresIndex + 1, 0, 'multi_agent = true');
  return lines.join('\n').trimEnd();
}

function getClaudeTargetRoot(projectRoot: string, scope: InstallScope): string {
  return scope === 'project'
    ? path.join(projectRoot, '.claude', 'agents')
    : path.join(os.homedir(), '.claude', 'agents');
}

function getCodexTargetRoot(projectRoot: string, scope: InstallScope): string {
  return scope === 'project'
    ? path.join(projectRoot, '.codex')
    : path.join(os.homedir(), '.codex');
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  void main(process.argv.slice(2)).catch(error => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
