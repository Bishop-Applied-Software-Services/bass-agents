#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import { MemoryAdapter } from '../memory/memory-adapter';
import {
  defaultBassAgentsConfig,
  loadProjectContext,
  resolveProjectRoot,
  writeProjectConfig,
} from '../project-context';

interface ParsedInitArgs {
  durableMemory?: boolean;
  projectRoot: string;
  setupAgtrace: boolean;
}

function parseArgs(argv: string[]): ParsedInitArgs {
  let durableMemory: boolean | undefined;
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
  --agtrace                Initialize local .agtrace state
`);
}

async function promptDurableMemory(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Interactive durable-memory prompt requires a TTY. Pass --durable-memory or --no-durable-memory.'
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await new Promise<string>(resolve => {
      rl.question('Enable durable memory for this project? [y/N] ', resolve);
    });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const durableMemoryEnabled =
    parsed.durableMemory !== undefined
      ? parsed.durableMemory
      : await promptDurableMemory();

  await fs.promises.mkdir(parsed.projectRoot, { recursive: true });
  await fs.promises.mkdir(path.join(parsed.projectRoot, 'session-reviews'), {
    recursive: true,
  });

  const config = defaultBassAgentsConfig(durableMemoryEnabled);
  const configPath = await writeProjectConfig(parsed.projectRoot, config);

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

  console.log(`Initialized bass-agents at ${parsed.projectRoot}`);
  console.log(`Config: ${configPath}`);
  console.log(
    durableMemoryEnabled
      ? `Durable memory: enabled (${path.join(parsed.projectRoot, 'ai-memory')})`
      : 'Durable memory: disabled'
  );
}

if (require.main === module) {
  void main(process.argv.slice(2)).catch(error => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
