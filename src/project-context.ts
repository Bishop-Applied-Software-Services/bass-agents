import * as fs from 'fs';
import * as path from 'path';

export interface ProjectContext {
  projectRoot: string;
  memoryRoot: string;
  sessionReviewRoot: string;
  agtraceRoot: string;
  dashboardsRoot: string;
  aiContextRoot: string;
  durableMemoryEnabled: boolean;
}

export interface ResolvedProjectContext extends ProjectContext {
  configPath: string;
  initialized: boolean;
  projectName: string;
}

export interface BassAgentsConfig {
  version: 1;
  durable_memory: {
    enabled: boolean;
    root: string;
  };
  session_reviews: {
    root: string;
  };
  agtrace: {
    root: string;
  };
  dashboards: {
    root: string;
  };
  ai_context: {
    root: string;
  };
}

const CONFIG_DIR = '.bass-agents';
const CONFIG_FILE = 'config.json';

export function defaultBassAgentsConfig(
  durableMemoryEnabled: boolean = true
): BassAgentsConfig {
  return {
    version: 1,
    durable_memory: {
      enabled: durableMemoryEnabled,
      root: 'ai-memory',
    },
    session_reviews: {
      root: 'session-reviews',
    },
    agtrace: {
      root: '.agtrace',
    },
    dashboards: {
      root: '.bass-agents/dashboards',
    },
    ai_context: {
      root: 'ai-context',
    },
  };
}

export function getProjectConfigPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), CONFIG_DIR, CONFIG_FILE);
}

export function resolveProjectRoot(projectPath?: string): string {
  return path.resolve(projectPath || process.cwd());
}

export function loadProjectContext(projectRoot: string): ResolvedProjectContext {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);
  const configPath = getProjectConfigPath(resolvedProjectRoot);
  const config = readProjectConfig(configPath);
  const effectiveConfig = config || defaultBassAgentsConfig(false);

  return {
    configPath,
    initialized: config !== null,
    projectName: path.basename(resolvedProjectRoot),
    projectRoot: resolvedProjectRoot,
    memoryRoot: resolveProjectRelativePath(
      resolvedProjectRoot,
      effectiveConfig.durable_memory.root,
      'durable_memory.root'
    ),
    sessionReviewRoot: resolveProjectRelativePath(
      resolvedProjectRoot,
      effectiveConfig.session_reviews.root,
      'session_reviews.root'
    ),
    agtraceRoot: resolveProjectRelativePath(
      resolvedProjectRoot,
      effectiveConfig.agtrace.root,
      'agtrace.root'
    ),
    dashboardsRoot: resolveProjectRelativePath(
      resolvedProjectRoot,
      effectiveConfig.dashboards.root,
      'dashboards.root'
    ),
    aiContextRoot: resolveProjectRelativePath(
      resolvedProjectRoot,
      effectiveConfig.ai_context.root,
      'ai_context.root'
    ),
    durableMemoryEnabled: effectiveConfig.durable_memory.enabled,
  };
}

export async function writeProjectConfig(
  projectRoot: string,
  config: BassAgentsConfig
): Promise<string> {
  const configPath = getProjectConfigPath(projectRoot);
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8'
  );
  return configPath;
}

export function resolveProjectRelativePath(
  projectRoot: string,
  configuredRoot: string,
  configKey: string
): string {
  if (!configuredRoot || typeof configuredRoot !== 'string') {
    throw new Error(`Invalid ${configKey}: expected non-empty relative path`);
  }

  if (path.isAbsolute(configuredRoot)) {
    throw new Error(`Invalid ${configKey}: absolute paths are not allowed`);
  }

  const normalizedRoot = configuredRoot.replace(/\\/g, '/');
  const normalized = path.posix.normalize(normalizedRoot);
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`Invalid ${configKey}: path must stay inside the project root`);
  }

  const resolvedPath = path.resolve(projectRoot, configuredRoot);
  return assertPathWithinProject(projectRoot, resolvedPath, configKey);
}

export function assertPathWithinProject(
  projectRoot: string,
  targetPath: string,
  label: string = 'path'
): string {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTargetPath = path.resolve(targetPath);
  const targetRelative = path.relative(resolvedProjectRoot, resolvedTargetPath);

  if (targetRelative.startsWith('..') || path.isAbsolute(targetRelative)) {
    throw new Error(
      `Workspace boundary violation: ${label} escapes the project root: ${resolvedTargetPath}`
    );
  }

  const projectRealRoot = realpathExisting(resolvedProjectRoot);
  const existingAncestor = nearestExistingAncestor(resolvedTargetPath);
  const ancestorRealPath = realpathExisting(existingAncestor);
  const realRelative = path.relative(projectRealRoot, ancestorRealPath);

  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(
      `Workspace boundary violation: ${label} resolves outside the project root via symlink: ${resolvedTargetPath}`
    );
  }

  return resolvedTargetPath;
}

function readProjectConfig(configPath: string): BassAgentsConfig | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BassAgentsConfig>;
    return normalizeConfig(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(
      `Failed to read bass-agents config at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function normalizeConfig(parsed: Partial<BassAgentsConfig>): BassAgentsConfig {
  const defaults = defaultBassAgentsConfig(false);
  return {
    version: 1,
    durable_memory: {
      enabled: parsed.durable_memory?.enabled ?? defaults.durable_memory.enabled,
      root: parsed.durable_memory?.root || defaults.durable_memory.root,
    },
    session_reviews: {
      root: parsed.session_reviews?.root || defaults.session_reviews.root,
    },
    agtrace: {
      root: parsed.agtrace?.root || defaults.agtrace.root,
    },
    dashboards: {
      root: parsed.dashboards?.root || defaults.dashboards.root,
    },
    ai_context: {
      root: parsed.ai_context?.root || defaults.ai_context.root,
    },
  };
}

function nearestExistingAncestor(targetPath: string): string {
  let currentPath = path.resolve(targetPath);
  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  return currentPath;
}

function realpathExisting(targetPath: string): string {
  return fs.realpathSync.native(nearestExistingAncestor(targetPath));
}
