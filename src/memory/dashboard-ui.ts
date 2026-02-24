/**
 * Terminal UI for Memory Dashboard using blessed
 * 
 * Provides rich terminal visualizations including:
 * - Summary panel with color coding
 * - Growth chart (ASCII line chart)
 * - Section pie chart
 * - Confidence bar chart
 * - Evidence bar chart
 * - Active agents table
 * - Expiry table
 * - Recent operations table
 * - Keyboard shortcuts
 */

import * as blessed from 'blessed';
import { MemoryStatistics } from './statistics';

/**
 * Color coding thresholds
 */
const COLOR_THRESHOLDS = {
  confidence: {
    healthy: 0.7,    // >= 0.7 = green
    warning: 0.5,    // >= 0.5 = yellow
    // < 0.5 = red
  },
  staleEvidence: {
    healthy: 5,      // <= 5 = green
    warning: 20,     // <= 20 = yellow
    // > 20 = red
  },
};

/**
 * Dashboard UI options
 */
export interface DashboardUIOptions {
  project: string;
  dateRange?: string;
  refreshInterval?: number;
  onRefresh?: () => Promise<MemoryStatistics>;
  onQuit?: () => void;
}

/**
 * Create and display the dashboard UI
 */
export function createDashboardUI(
  stats: MemoryStatistics,
  options: DashboardUIOptions
): blessed.Widgets.Screen {
  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    title: `Memory Dashboard - ${options.project}`,
  });

  // Create main container
  const container = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black',
    },
  });

  // Header
  const header = createHeader(container, options);

  // Layout: 3 columns
  const leftColumn = blessed.box({
    parent: container,
    top: 3,
    left: 0,
    width: '33%',
    height: '100%-3',
  });

  const middleColumn = blessed.box({
    parent: container,
    top: 3,
    left: '33%',
    width: '34%',
    height: '100%-3',
  });

  const rightColumn = blessed.box({
    parent: container,
    top: 3,
    left: '67%',
    width: '33%',
    height: '100%-3',
  });

  // Left column: Summary + Growth Chart
  createSummaryPanel(leftColumn, stats);
  createGrowthChart(leftColumn, stats);

  // Middle column: Section Pie + Confidence Bar + Evidence Bar
  createSectionPieChart(middleColumn, stats);
  createConfidenceBarChart(middleColumn, stats);
  createEvidenceBarChart(middleColumn, stats);

  // Right column: Active Agents + Expiry + Recent Operations
  createActiveAgentsTable(rightColumn, stats);
  createExpiryTable(rightColumn, stats);
  createRecentOperationsTable(rightColumn, stats);

  // Keyboard shortcuts
  setupKeyboardShortcuts(screen, options);

  // Render screen
  screen.render();

  return screen;
}

/**
 * Create header with project info and timestamp
 */
function createHeader(
  parent: blessed.Widgets.Node,
  options: DashboardUIOptions
): blessed.Widgets.BoxElement {
  const header = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: ` Memory Dashboard - Project: ${options.project}\n Date Range: ${options.dateRange || 'All time'} | Last Updated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}\n Press 'h' for help, 'q' to quit`,
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true,
    },
  });

  return header;
}

/**
 * Create summary panel with color coding
 * Requirements: 21.2, 23.1, 23.9
 */
function createSummaryPanel(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  const avgConfColor = getConfidenceColor(stats.avg_confidence);
  const staleEvidenceColor = getStaleEvidenceColor(stats.stale_evidence_count);

  const content = [
    '{bold}📊 SUMMARY{/bold}',
    '',
    `Total Entries:      ${stats.total_entries}`,
    `Active Entries:     ${stats.entries_by_status.active || 0}`,
    `{${avgConfColor}-fg}Average Confidence: ${stats.avg_confidence.toFixed(2)}{/${avgConfColor}-fg}`,
    `Low Confidence:     ${stats.low_confidence_count} (< 0.5)`,
    `{${staleEvidenceColor}-fg}Stale Evidence:     ${stats.stale_evidence_count}{/${staleEvidenceColor}-fg}`,
    `Superseded:         ${stats.entries_by_status.superseded || 0} (${stats.superseded_percentage.toFixed(1)}%)`,
    `Compaction Needed:  ${stats.compaction_candidates}`,
  ].join('\n');

  const panel = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: 11,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return panel;
}

/**
 * Create growth chart (ASCII line chart)
 * Requirements: 21.3, 23.2
 */
function createGrowthChart(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  const recentData = stats.entries_created_over_time.slice(-14); // Last 14 days
  
  let content = '{bold}📈 GROWTH TREND (Last 14 Days){/bold}\n\n';
  
  if (recentData.length === 0) {
    content += 'No data available';
  } else {
    const maxCount = Math.max(...recentData.map(d => d.count), 1);
    const barWidth = 20;
    
    recentData.forEach(point => {
      const barLength = Math.floor((point.count / maxCount) * barWidth);
      const bar = '█'.repeat(barLength);
      const dateShort = point.date.slice(5); // MM-DD
      content += `${dateShort} ${point.count.toString().padStart(3)} ${bar}\n`;
    });
  }

  const chart = blessed.box({
    parent,
    top: 11,
    left: 0,
    width: '100%',
    height: 18,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return chart;
}

/**
 * Create section pie chart
 * Requirements: 21.2, 23.3
 */
function createSectionPieChart(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  const sections = ['decisions', 'state', 'observations', 'learnings'];
  
  let content = '{bold}📁 ENTRIES BY SECTION{/bold}\n\n';
  
  sections.forEach(section => {
    const count = stats.entries_by_section[section] || 0;
    const percentage = stats.total_entries > 0 
      ? (count / stats.total_entries * 100).toFixed(1) 
      : '0.0';
    const barLength = Math.floor(parseFloat(percentage) / 5); // Scale to fit
    const bar = '█'.repeat(barLength);
    
    content += `${section.padEnd(13)} ${count.toString().padStart(4)} (${percentage.padStart(5)}%) ${bar}\n`;
  });

  const chart = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: 8,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return chart;
}

/**
 * Create confidence bar chart
 * Requirements: 21.4, 23.4
 */
function createConfidenceBarChart(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  let content = '{bold}📊 CONFIDENCE DISTRIBUTION{/bold}\n\n';
  
  const maxCount = Math.max(...Object.values(stats.confidence_distribution), 1);
  const barWidth = 15;
  
  Object.entries(stats.confidence_distribution).forEach(([range, count]) => {
    const barLength = Math.floor((count / maxCount) * barWidth);
    const bar = '█'.repeat(barLength);
    content += `${range.padEnd(10)} ${count.toString().padStart(4)} ${bar}\n`;
  });

  const chart = blessed.box({
    parent,
    top: 8,
    left: 0,
    width: '100%',
    height: 9,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return chart;
}

/**
 * Create evidence bar chart
 * Requirements: 21.4, 23.5
 */
function createEvidenceBarChart(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  let content = '{bold}🔍 EVIDENCE TYPES{/bold}\n\n';
  
  const evidenceEntries = Object.entries(stats.evidence_type_distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  if (evidenceEntries.length === 0) {
    content += 'No evidence data';
  } else {
    const maxCount = Math.max(...evidenceEntries.map(e => e[1]), 1);
    const barWidth = 10;
    
    evidenceEntries.forEach(([type, count]) => {
      const barLength = Math.floor((count / maxCount) * barWidth);
      const bar = '█'.repeat(barLength);
      content += `${type.padEnd(12)} ${count.toString().padStart(4)} ${bar}\n`;
    });
  }

  const chart = blessed.box({
    parent,
    top: 17,
    left: 0,
    width: '100%',
    height: 12,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return chart;
}

/**
 * Create active agents table
 * Requirements: 21.5, 23.6
 */
function createActiveAgentsTable(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  let content = '{bold}👥 MOST ACTIVE AGENTS (Top 10){/bold}\n\n';
  
  if (stats.most_active_agents.length === 0) {
    content += 'No agent activity';
  } else {
    stats.most_active_agents.forEach((agent, index) => {
      const rank = (index + 1).toString().padStart(2);
      const name = agent.agent.length > 25 ? agent.agent.slice(0, 22) + '...' : agent.agent.padEnd(25);
      content += `${rank}. ${name} ${agent.count.toString().padStart(4)}\n`;
    });
  }

  const table = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: 14,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return table;
}

/**
 * Create expiry table
 * Requirements: 21.7, 23.7
 */
function createExpiryTable(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  let content = '{bold}⚠️  ENTRIES APPROACHING EXPIRY{/bold}\n\n';
  
  if (stats.entries_approaching_expiry.length === 0) {
    content += 'No entries expiring soon';
  } else {
    stats.entries_approaching_expiry.slice(0, 8).forEach(entry => {
      const id = entry.entry_id.length > 12 ? entry.entry_id.slice(0, 12) : entry.entry_id.padEnd(12);
      const days = entry.days_remaining.toString().padStart(2);
      const summary = entry.summary.length > 20 ? entry.summary.slice(0, 17) + '...' : entry.summary;
      
      const color = entry.days_remaining <= 2 ? 'red' : entry.days_remaining <= 5 ? 'yellow' : 'white';
      content += `{${color}-fg}${id} ${days}d ${summary}{/${color}-fg}\n`;
    });
  }

  const table = blessed.box({
    parent,
    top: 14,
    left: 0,
    width: '100%',
    height: 12,
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
  });

  return table;
}

/**
 * Create recent operations table
 * Requirements: 21.5, 23.8
 */
function createRecentOperationsTable(
  parent: blessed.Widgets.Node,
  stats: MemoryStatistics
): blessed.Widgets.BoxElement {
  let content = '{bold}🕐 RECENT OPERATIONS (Last 20){/bold}\n\n';
  
  if (stats.recent_operations.length === 0) {
    content += 'No recent operations';
  } else {
    stats.recent_operations.slice(0, 15).forEach(op => {
      const time = op.timestamp.slice(11, 16); // HH:MM
      const opType = op.operation.slice(0, 3).padEnd(3); // First 3 chars
      const id = op.entry_id.length > 10 ? op.entry_id.slice(0, 10) : op.entry_id.padEnd(10);
      const summary = op.summary.length > 20 ? op.summary.slice(0, 17) + '...' : op.summary;
      
      content += `${time} ${opType} ${id} ${summary}\n`;
    });
  }

  const table = blessed.box({
    parent,
    top: 26,
    left: 0,
    width: '100%',
    height: '100%-26',
    content,
    tags: true,
    border: {
      type: 'line',
    },
    style: {
      border: {
        fg: 'cyan',
      },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue',
      },
    },
  });

  return table;
}

/**
 * Setup keyboard shortcuts
 * Requirements: 23.10
 */
function setupKeyboardShortcuts(
  screen: blessed.Widgets.Screen,
  options: DashboardUIOptions
): void {
  // 'q': Quit dashboard
  screen.key(['q', 'C-c'], () => {
    if (options.onQuit) {
      options.onQuit();
    }
    process.exit(0);
  });

  // 'r': Manual refresh (bypass cache)
  screen.key(['r'], async () => {
    if (options.onRefresh) {
      try {
        const newStats = await options.onRefresh();
        // Recreate UI with new stats
        screen.destroy();
        const newScreen = createDashboardUI(newStats, options);
        newScreen.render();
      } catch (error) {
        // Show error message
        const errorBox = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: '50%',
          height: 'shrink',
          border: {
            type: 'line',
          },
          style: {
            border: {
              fg: 'red',
            },
          },
        });
        const errorMsg = 'Error refreshing: ' + (error instanceof Error ? error.message : String(error));
        errorBox.display(errorMsg, () => {
          screen.render();
        });
      }
    }
  });

  // 'h': Show help overlay
  screen.key(['h', '?'], () => {
    const helpBox = blessed.message({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'yellow',
        },
      },
    });
    
    const helpText = [
      '{bold}Keyboard Shortcuts{/bold}',
      '',
      'q       - Quit dashboard',
      'r       - Manual refresh (bypass cache)',
      'h or ?  - Show this help',
      'Ctrl+C  - Quit dashboard',
      '',
      'Press any key to close this help...',
    ].join('\n');
    
    helpBox.display(helpText, () => {
      screen.render();
    });
  });

  // Arrow keys for scrolling (if needed in future)
  screen.key(['up', 'down'], () => {
    // Placeholder for future scrolling functionality
    screen.render();
  });
}

/**
 * Get color for confidence value
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= COLOR_THRESHOLDS.confidence.healthy) {
    return 'green';
  } else if (confidence >= COLOR_THRESHOLDS.confidence.warning) {
    return 'yellow';
  } else {
    return 'red';
  }
}

/**
 * Get color for stale evidence count
 */
function getStaleEvidenceColor(count: number): string {
  if (count <= COLOR_THRESHOLDS.staleEvidence.healthy) {
    return 'green';
  } else if (count <= COLOR_THRESHOLDS.staleEvidence.warning) {
    return 'yellow';
  } else {
    return 'red';
  }
}
