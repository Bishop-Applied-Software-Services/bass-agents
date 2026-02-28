import * as fs from 'fs';
import * as path from 'path';

export interface CustomAgentDefinition {
  id: string;
  codexAgentType: string;
  fileName: string;
  displayName: string;
  description: string;
  domain: string | null;
  primaryObjective: string | null;
  claudeTools: string[];
  sourcePath: string;
  portablePath: string;
  claudePath: string;
  codexConfigPath: string;
}

export interface GeneratedCustomAgents {
  rootDir: string;
  portableDir: string;
  claudeDir: string;
  codexDir: string;
  codexRootConfigPath: string;
  manifestPath: string;
  readmePath: string;
  agents: CustomAgentDefinition[];
}

interface ParsedAgentSource {
  fileName: string;
  displayName: string;
  description: string;
  domain: string | null;
  primaryObjective: string | null;
  systemPrompt: string;
  claudeTools: string[];
  canWriteFiles: boolean;
  terminalAllowed: boolean;
  rawContent: string;
}

const CUSTOM_AGENTS_DIR = path.join('.bass-agents', 'custom-agents');
export const CODEX_MANAGED_ROLE_BLOCK_START = '# BEGIN BASS-AGENTS CODEX AGENTS';
export const CODEX_MANAGED_ROLE_BLOCK_END = '# END BASS-AGENTS CODEX AGENTS';

export function getBundledAgentSourceDir(): string {
  return path.resolve(__dirname, '..', 'agents');
}

export async function generateProjectCustomAgents(
  projectRoot: string,
  agentSourceDir: string = getBundledAgentSourceDir()
): Promise<GeneratedCustomAgents> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedSourceDir = path.resolve(agentSourceDir);
  const rootDir = path.join(resolvedProjectRoot, CUSTOM_AGENTS_DIR);
  const portableDir = path.join(rootDir, 'portable');
  const claudeDir = path.join(rootDir, 'claude');
  const codexDir = path.join(rootDir, 'codex');
  const codexAgentsDir = path.join(codexDir, 'agents');

  await fs.promises.rm(rootDir, { recursive: true, force: true });
  await fs.promises.mkdir(portableDir, { recursive: true });
  await fs.promises.mkdir(claudeDir, { recursive: true });
  await fs.promises.mkdir(codexAgentsDir, { recursive: true });

  const agentFiles = (await fs.promises.readdir(resolvedSourceDir))
    .filter(fileName => fileName.endsWith('.agent'))
    .sort((left, right) => left.localeCompare(right));

  const agents: CustomAgentDefinition[] = [];

  for (const fileName of agentFiles) {
    const sourcePath = path.join(resolvedSourceDir, fileName);
    const rawContent = await fs.promises.readFile(sourcePath, 'utf8');
    const parsed = parseAgentSource(fileName, rawContent);
    const id = `bass-${path.basename(fileName, '.agent')}`;
    const codexAgentType = `bass_${path.basename(fileName, '.agent').replace(/-/g, '_')}`;
    const portablePath = path.join(portableDir, fileName);
    const claudePath = path.join(claudeDir, id, 'AGENT.md');
    const codexConfigPath = path.join(codexAgentsDir, `${codexAgentType}.toml`);

    await fs.promises.writeFile(portablePath, `${parsed.rawContent.trimEnd()}\n`, 'utf8');
    await fs.promises.mkdir(path.dirname(claudePath), { recursive: true });
    await fs.promises.writeFile(claudePath, renderClaudeAgent(id, parsed), 'utf8');
    await fs.promises.writeFile(codexConfigPath, renderCodexAgentConfig(codexAgentType, parsed), 'utf8');

    agents.push({
      id,
      codexAgentType,
      fileName,
      displayName: parsed.displayName,
      description: parsed.description,
      domain: parsed.domain,
      primaryObjective: parsed.primaryObjective,
      claudeTools: parsed.claudeTools,
      sourcePath,
      portablePath,
      claudePath,
      codexConfigPath,
    });
  }

  const codexRootConfigPath = path.join(codexDir, 'config.toml');
  const manifestPath = path.join(rootDir, 'manifest.json');
  const readmePath = path.join(rootDir, 'README.md');

  await fs.promises.writeFile(codexRootConfigPath, renderCodexRootConfig(agents), 'utf8');

  await fs.promises.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source_dir: resolvedSourceDir,
        claude_dir: claudeDir,
        codex_dir: codexDir,
        codex_root_config_path: codexRootConfigPath,
        portable_dir: portableDir,
        agents: agents.map(agent => ({
          id: agent.id,
          codex_agent_type: agent.codexAgentType,
          file_name: agent.fileName,
          display_name: agent.displayName,
          description: agent.description,
          domain: agent.domain,
          primary_objective: agent.primaryObjective,
          claude_tools: agent.claudeTools,
          source_path: agent.sourcePath,
          portable_path: agent.portablePath,
          claude_path: agent.claudePath,
          codex_config_path: agent.codexConfigPath,
        })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await fs.promises.writeFile(readmePath, renderReadme(), 'utf8');

  return {
    rootDir,
    portableDir,
    claudeDir,
    codexDir,
    codexRootConfigPath,
    manifestPath,
    readmePath,
    agents,
  };
}

function parseAgentSource(fileName: string, rawContent: string): ParsedAgentSource {
  const displayName =
    rawContent.match(/^#\s+Agent Profile:\s*(.+)$/m)?.[1]?.trim() ??
    path.basename(fileName, '.agent');
  const coreDefinition = extractSection(
    rawContent,
    /^##\s+[0-9A-Za-z.]+\s+Core Definition\s*$/
  );
  const toolRegistry = extractSection(
    rawContent,
    /^##\s+[0-9A-Za-z.]+\s+Tool Registry(?:\s+\(.*\))?\s*$/
  );
  const systemPromptSection = extractSection(
    rawContent,
    /^##\s+[0-9A-Za-z.]+\s+System Prompt \(Copy\/Paste\)\s*$/
  );
  const systemPrompt = extractSystemPrompt(systemPromptSection);
  const primaryObjective = extractLabeledValue(coreDefinition, 'Primary Objective');
  const domain = extractLabeledValue(coreDefinition, 'Domain');
  const canWriteFiles = hasToolRegistryCapability(toolRegistry, 'filesystem', 'read/write');
  const terminalAllowed = hasToolRegistryCapability(toolRegistry, 'terminal', 'allowed');

  return {
    fileName,
    displayName,
    description:
      primaryObjective ??
      (domain ? `Use this agent for ${domain.toLowerCase()} tasks.` : `Use ${displayName}.`),
    domain,
    primaryObjective,
    systemPrompt,
    claudeTools: inferClaudeTools(toolRegistry),
    canWriteFiles,
    terminalAllowed,
    rawContent,
  };
}

function extractSection(markdown: string, headerPattern: RegExp): string | null {
  const lines = markdown.split(/\r?\n/);
  let startIndex = -1;

  for (let index = 0; index < lines.length; index++) {
    if (headerPattern.test(lines[index])) {
      startIndex = index + 1;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  let endIndex = lines.length;
  for (let index = startIndex; index < lines.length; index++) {
    if (/^##\s+[0-9A-Za-z.]+\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function extractLabeledValue(section: string | null, label: string): string | null {
  if (!section) {
    return null;
  }

  const pattern = new RegExp(`^\\*\\s+\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.+)$`, 'm');
  return section.match(pattern)?.[1]?.trim() ?? null;
}

function extractSystemPrompt(section: string | null): string {
  if (!section) {
    throw new Error('Agent definition is missing a system prompt section');
  }

  const match = section.match(/```text\s*([\s\S]*?)```/);
  if (!match) {
    throw new Error('Agent definition system prompt must use a ```text fenced block');
  }

  return match[1].trim();
}

function inferClaudeTools(toolRegistry: string | null): string[] {
  const tools = ['Read', 'Grep', 'Glob'];
  if (hasToolRegistryCapability(toolRegistry, 'filesystem', 'read/write')) {
    tools.push('Write', 'Edit');
  }

  if (hasToolRegistryCapability(toolRegistry, 'terminal', 'allowed')) {
    tools.push('Bash');
  }

  return tools;
}

function renderClaudeAgent(agentId: string, parsed: ParsedAgentSource): string {
  return [
    '---',
    `name: ${agentId}`,
    `description: ${formatFrontmatterString(parsed.description)}`,
    `tools: ${parsed.claudeTools.join(', ')}`,
    'model: sonnet',
    '---',
    '',
    `You are ${agentId}, a project-local custom agent generated from bass-agents.`,
    '',
    `Original profile: ${parsed.displayName}`,
    parsed.domain ? `Domain: ${parsed.domain}` : null,
    parsed.primaryObjective ? `Primary objective: ${parsed.primaryObjective}` : null,
    '',
    'Follow the instructions below as the authoritative operating contract.',
    '',
    parsed.systemPrompt,
    '',
    'If the host tool does not expose a capability named in the original bass-agents tool registry,',
    'degrade gracefully and report the limitation instead of inventing access.',
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function renderCodexRootConfig(agents: CustomAgentDefinition[]): string {
  const lines = [
    '# Generated by bass-agents init. Copy this file and agents/ into .codex/.',
    '',
    '[features]',
    'multi_agent = true',
    '',
    '[agents]',
    'max_threads = 8',
    'max_depth = 3',
    '',
    renderCodexManagedRoleBlock(agents),
  ];

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderCodexManagedRoleBlock(
  agents: Array<Pick<CustomAgentDefinition, 'codexAgentType' | 'description'>>
): string {
  const lines = [CODEX_MANAGED_ROLE_BLOCK_START];

  for (const agent of agents) {
    lines.push(`[agents.${agent.codexAgentType}]`);
    lines.push(`description = ${formatTomlBasicString(agent.description)}`);
    lines.push(`config_file = ${formatTomlBasicString(`agents/${agent.codexAgentType}.toml`)}`);
    lines.push('');
  }

  lines.push(CODEX_MANAGED_ROLE_BLOCK_END);
  return lines.join('\n').trimEnd();
}

function renderCodexAgentConfig(
  codexAgentType: string,
  parsed: ParsedAgentSource
): string {
  const sandboxMode = parsed.canWriteFiles || parsed.terminalAllowed ? 'workspace-write' : 'read-only';
  const developerInstructions = [
    `You are ${codexAgentType}, a project-local Codex agent generated from bass-agents.`,
    '',
    `Original profile: ${parsed.displayName}`,
    parsed.domain ? `Domain: ${parsed.domain}` : null,
    parsed.primaryObjective ? `Primary objective: ${parsed.primaryObjective}` : null,
    '',
    'Follow the instructions below as the authoritative operating contract.',
    '',
    parsed.systemPrompt,
    '',
    'If the Codex host does not expose a capability named in the original bass-agents tool registry,',
    'degrade gracefully and report the limitation instead of inventing access.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return [
    '# Generated by bass-agents init.',
    `agent_type = ${formatTomlBasicString(codexAgentType)}`,
    `model = ${formatTomlBasicString('gpt-5.3-codex')}`,
    `model_reasoning_effort = ${formatTomlBasicString('high')}`,
    `sandbox_mode = ${formatTomlBasicString(sandboxMode)}`,
    'notify = false',
    'developer_instructions = """',
    developerInstructions.replace(/"""/g, '\\"\\"\\"'),
    '"""',
    '',
  ].join('\n');
}

function renderReadme(): string {
  return [
    '# Custom Agent Exports',
    '',
    'These files are generated by `bass-agents init`.',
    '',
    '## Layout',
    '',
    '- `portable/*.agent` keeps raw bass-agents agent definitions in their original portable format.',
    '- `claude/<agent>/AGENT.md` is ready to copy into Claude Code custom-agent directories.',
    '- `codex/config.toml` plus `codex/agents/*.toml` is ready to copy into a project `.codex/` folder.',
    '- `manifest.json` lists generated agents, descriptions, and export paths for each target.',
    '',
    '## Claude Code',
    '',
    'Project-scoped install:',
    '',
    '```bash',
    'mkdir -p .claude/agents',
    'cp -R .bass-agents/custom-agents/claude/* .claude/agents/',
    '```',
    '',
    'User-scoped install:',
    '',
    '```bash',
    'mkdir -p ~/.claude/agents',
    'cp -R .bass-agents/custom-agents/claude/* ~/.claude/agents/',
    '```',
    '',
    '## Codex CLI',
    '',
    'Project-scoped install:',
    '',
    '```bash',
    'mkdir -p .codex',
    'cp -R .bass-agents/custom-agents/codex/* .codex/',
    '```',
    '',
    'The generated `.codex/config.toml` enables multi-agent mode and points at per-role agent TOML files.',
    '',
    '## Other Tools',
    '',
    'Start from `portable/*.agent` or `manifest.json` and map the description, prompt, and tool hints',
    'into the target tool\'s custom-agent format.',
    '',
  ].join('\n');
}

function formatFrontmatterString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlBasicString(value: string): string {
  return JSON.stringify(value);
}

function hasToolRegistryCapability(
  toolRegistry: string | null,
  category: string,
  capability: string
): boolean {
  const lines = (toolRegistry || '').split(/\r?\n/).map(line => line.toLowerCase());
  return lines.some(
    line =>
      line.includes(category.toLowerCase()) &&
      line.includes(capability.toLowerCase()) &&
      !line.includes('not allowed')
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
