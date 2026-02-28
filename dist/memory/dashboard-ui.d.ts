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
export declare function createDashboardUI(stats: MemoryStatistics, options: DashboardUIOptions): blessed.Widgets.Screen;
//# sourceMappingURL=dashboard-ui.d.ts.map