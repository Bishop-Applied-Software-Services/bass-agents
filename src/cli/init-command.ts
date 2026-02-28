#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline';
import { execFileSync } from 'child_process';
import { MemoryAdapter } from '../memory/memory-adapter';
import { generateProjectCustomAgents } from '../custom-agents';
import {
  installCustomAgents,
  InstallScope,
  InstallTool,
} from './install-custom-agents-command';
import {
  defaultBassAgentsConfig,
  loadProjectContext,
  resolveProjectRoot,
  writeProjectConfig,
} from '../project-context';

interface ParsedInitArgs {
  durableMemory?: boolean;
  installCustomAgents?: boolean;
  customAgentsScope?: InstallScope;
  customAgentsTool?: InstallTool;
  projectRoot: string;
  setupAgtrace: boolean;
}

interface PromptSession {
  ask(question: string): Promise<string>;
  close(): void;
}

interface InitCommandDependencies {
  createPromptSession?: () => PromptSession;
}

interface ResolvedCustomAgentInstall {
  scope: InstallScope;
  tool: InstallTool;
}

function parseArgs(argv: string[]): ParsedInitArgs {
  let durableMemory: boolean | undefined;
  let installCustomAgentsOption: boolean | undefined;
  let customAgentsScope: InstallScope | undefined;
  let customAgentsTool: InstallTool | undefined;
  let projectRoot = process.cwd();
  let setupAgtrace = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--durable-memory':
        if (durableMemory === false) {
          throw new Error('Cannot pass both --durable-memory and --no-durable-memory');
        }
        durableMemory = true;
        break;
      case '--no-durable-memory':
        if (durableMemory === true) {
          throw new Error('Cannot pass both --durable-memory and --no-durable-memory');
        }
        durableMemory = false;
        break;
      case '--install-custom-agents':
        if (installCustomAgentsOption === false) {
          throw new Error(
            'Cannot pass both --install-custom-agents and --no-install-custom-agents'
          );
        }
        installCustomAgentsOption = true;
        break;
      case '--no-install-custom-agents':
        if (installCustomAgentsOption === true) {
          throw new Error(
            'Cannot pass both --install-custom-agents and --no-install-custom-agents'
          );
        }
        installCustomAgentsOption = false;
        break;
      case '--custom-agents-scope': {
        const value = argv[index + 1];
        if (value !== 'project' && value !== 'user') {
          throw new Error('--custom-agents-scope must be project or user');
        }
        customAgentsScope = value;
        index++;
        break;
      }
      case '--custom-agents-tool': {
        const value = argv[index + 1];
        if (value !== 'all' && value !== 'claude' && value !== 'codex') {
          throw new Error('--custom-agents-tool must be all, claude, or codex');
        }
        customAgentsTool = value;
        index++;
        break;
      }
      case '--project':
        projectRoot = argv[index + 1];
        if (!projectRoot) {
          throw new Error('--project requires a path');
        }
        index++;
        break;
      case '--agtrace':
        setupAgtrace = true;
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown init option: ${arg}`);
    }
  }

  return {
    durableMemory,
    installCustomAgents: installCustomAgentsOption,
    customAgentsScope,
    customAgentsTool,
    projectRoot: resolveProjectRoot(projectRoot),
    setupAgtrace,
  };
}

function showHelp(): void {
  console.log(`
bass-agents init - Initialize bass-agents state for the current project

Usage:
  bass-agents init [options]

Options:
  --project <path>         Project root to initialize (default: cwd)
  --durable-memory         Enable local durable memory without prompting
  --no-durable-memory      Disable local durable memory without prompting
  --install-custom-agents  Install generated custom agents without prompting
  --no-install-custom-agents
                           Skip custom-agent installation without prompting
  --custom-agents-tool <all|claude|codex>
                           Custom-agent install target tool (default: all)
  --custom-agents-scope <project|user>
                           Custom-agent install scope (default: project)
  --agtrace                Initialize local .agtrace state

Init also exports project-local Claude and Codex agent bundles under .bass-agents/custom-agents/.
`);
}

async function promptDurableMemory(promptSession: PromptSession | null): Promise<boolean> {
  if (!promptSession) {
    throw new Error(
      'Interactive durable-memory prompt requires a TTY. Pass --durable-memory or --no-durable-memory.'
    );
  }

  return promptYesNo(promptSession, 'Enable durable memory for this project? [y/N] ', false);
}

export async function main(
  argv: string[],
  dependencies: InitCommandDependencies = {}
): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.installCustomAgents === false && (parsed.customAgentsScope || parsed.customAgentsTool)) {
    throw new Error(
      'Cannot pass --no-install-custom-agents with --custom-agents-tool or --custom-agents-scope'
    );
  }

  const promptSession = createPromptSession(dependencies);

  try {
    const durableMemoryEnabled =
      parsed.durableMemory !== undefined
        ? parsed.durableMemory
        : await promptDurableMemory(promptSession);

    await fs.promises.mkdir(parsed.projectRoot, { recursive: true });
    await fs.promises.mkdir(path.join(parsed.projectRoot, 'session-reviews'), {
      recursive: true,
    });

    const config = defaultBassAgentsConfig(durableMemoryEnabled);
    const configPath = await writeProjectConfig(parsed.projectRoot, config);
    const customAgents = await generateProjectCustomAgents(parsed.projectRoot);

    if (durableMemoryEnabled) {
      const adapter = new MemoryAdapter(parsed.projectRoot);
      await adapter.init();
    }

    if (parsed.setupAgtrace) {
      const context = loadProjectContext(parsed.projectRoot);
      fs.mkdirSync(context.agtraceRoot, { recursive: true });
      execFileSync(
        'agtrace',
        ['init', '--data-dir', context.agtraceRoot, '--project', parsed.projectRoot],
        {
          cwd: parsed.projectRoot,
          stdio: 'inherit',
        }
      );
    }

    const customAgentInstall = await resolveCustomAgentInstall(parsed, promptSession);
    let installedClaudeTarget: string | null = null;
    let installedCodexTarget: string | null = null;

    if (customAgentInstall) {
      const installed = await installCustomAgents(
        parsed.projectRoot,
        customAgentInstall.scope,
        customAgentInstall.tool,
        customAgents
      );
      installedClaudeTarget = installed.claudeTarget;
      installedCodexTarget = installed.codexTarget;
    }

    console.log(`Initialized bass-agents at ${parsed.projectRoot}`);
    console.log(`Config: ${configPath}`);
    console.log(
      durableMemoryEnabled
        ? `Durable memory: enabled (${path.join(parsed.projectRoot, 'ai-memory')})`
        : 'Durable memory: disabled'
    );
    console.log(`Custom agents: exported ${customAgents.agents.length} definition(s)`);
    console.log(`Custom agents root: ${customAgents.rootDir}`);
    console.log(`Claude-ready exports: ${customAgents.claudeDir}`);
    console.log(`Codex-ready exports: ${customAgents.codexDir}`);
    console.log(`Portable source exports: ${customAgents.portableDir}`);
    console.log('Installer command: bass-agents install-custom-agents --tool all --scope project');
    if (installedClaudeTarget) {
      console.log(`Claude agents installed: ${installedClaudeTarget}`);
    } else {
      console.log(
        'Claude install hint: mkdir -p .claude/agents && cp -R .bass-agents/custom-agents/claude/* .claude/agents/'
      );
    }
    if (installedCodexTarget) {
      console.log(`Codex agents installed: ${installedCodexTarget}`);
    } else {
      console.log(
        'Codex install hint: mkdir -p .codex && cp -R .bass-agents/custom-agents/codex/* .codex/'
      );
    }
    console.log(`Other tools: start from ${customAgents.readmePath}`);
  } finally {
    promptSession?.close();
  }
}

function createPromptSession(
  dependencies: InitCommandDependencies
): PromptSession | null {
  if (dependencies.createPromptSession) {
    return dependencies.createPromptSession();
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask(question: string): Promise<string> {
      return new Promise<string>(resolve => {
        rl.question(question, resolve);
      });
    },
    close(): void {
      rl.close();
    },
  };
}

async function resolveCustomAgentInstall(
  parsed: ParsedInitArgs,
  promptSession: PromptSession | null
): Promise<ResolvedCustomAgentInstall | null> {
  if (parsed.installCustomAgents === false) {
    return null;
  }

  const explicitInstallRequested =
    parsed.installCustomAgents === true ||
    parsed.customAgentsScope !== undefined ||
    parsed.customAgentsTool !== undefined;

  if (!explicitInstallRequested) {
    if (!promptSession) {
      return null;
    }

    const installRequested = await promptYesNo(
      promptSession,
      'Install generated custom agents now? [y/N] ',
      false
    );
    if (!installRequested) {
      return null;
    }
  }

  const tool =
    parsed.customAgentsTool ??
    (promptSession
      ? await promptChoice<InstallTool>(
          promptSession,
          'Install custom agents for [both/claude/codex]? [both] ',
          { both: 'all', all: 'all', claude: 'claude', codex: 'codex' },
          'all'
        )
      : 'all');
  const scope =
    parsed.customAgentsScope ??
    (promptSession
      ? await promptChoice<InstallScope>(
          promptSession,
          'Install custom agents into [project/user] config roots? [project] ',
          { project: 'project', user: 'user' },
          'project'
        )
      : 'project');

  return { tool, scope };
}

async function promptYesNo(
  promptSession: PromptSession,
  question: string,
  defaultValue: boolean
): Promise<boolean> {
  while (true) {
    const answer = (await promptSession.ask(question)).trim().toLowerCase();
    if (answer === '') {
      return defaultValue;
    }
    if (answer === 'y' || answer === 'yes') {
      return true;
    }
    if (answer === 'n' || answer === 'no') {
      return false;
    }
  }
}

async function promptChoice<T extends string>(
  promptSession: PromptSession,
  question: string,
  choices: Record<string, T>,
  defaultValue: T
): Promise<T> {
  while (true) {
    const answer = (await promptSession.ask(question)).trim().toLowerCase();
    if (answer === '') {
      return defaultValue;
    }
    const choice = choices[answer];
    if (choice) {
      return choice;
    }
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).catch(error => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
