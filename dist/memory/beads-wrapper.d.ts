/**
 * Beads Command Wrapper
 *
 * Provides a typed interface to Beads (bd) commands for memory storage.
 * Wraps bd CLI commands using child_process.
 */
import { BeadsIssue, BeadsListFilters, Dependency, DependencyType } from './types';
/**
 * BeadsWrapper provides typed access to Beads issue tracking commands
 */
export declare class BeadsWrapper {
    private repoPath;
    constructor(repoPath: string);
    /**
     * Initialize a new Beads repository at the specified path
     */
    init(path: string): Promise<void>;
    /**
     * Create a new Beads issue and return its ID
     */
    create(issue: BeadsIssue): Promise<string>;
    /**
     * Update an existing Beads issue
     */
    update(id: string, updates: Partial<BeadsIssue>): Promise<void>;
    /**
     * Get a single Beads issue by ID
     */
    get(id: string): Promise<BeadsIssue | null>;
    /**
     * List Beads issues with optional filters
     */
    list(filters?: BeadsListFilters): Promise<BeadsIssue[]>;
    /**
     * Add a dependency link between two issues
     */
    addDependency(fromId: string, toId: string, type: DependencyType): Promise<void>;
    /**
     * Get all dependencies for an issue
     */
    getDependencies(id: string): Promise<Dependency[]>;
    /**
     * Add a label to an issue
     */
    addLabel(id: string, label: string): Promise<void>;
    /**
     * Remove a label from an issue
     */
    removeLabel(id: string, label: string): Promise<void>;
    /**
     * Serialize issue body with custom fields as JSON
     */
    private serializeIssueBody;
    /**
     * Parse a Beads issue from JSON data
     */
    private parseBeadsIssue;
    /**
     * Escape quotes in strings for shell commands
     */
    private escapeQuotes;
}
//# sourceMappingURL=beads-wrapper.d.ts.map