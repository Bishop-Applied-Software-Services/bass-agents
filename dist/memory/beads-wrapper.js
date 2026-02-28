"use strict";
/**
 * Beads Command Wrapper
 *
 * Provides a typed interface to Beads (bd) commands for memory storage.
 * Wraps bd CLI commands using child_process.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BeadsWrapper = void 0;
const child_process_1 = require("child_process");
/**
 * BeadsWrapper provides typed access to Beads issue tracking commands
 */
class BeadsWrapper {
    constructor(repoPath) {
        this.repoPath = repoPath;
    }
    /**
     * Initialize a new Beads repository at the specified path
     */
    async init(path) {
        try {
            (0, child_process_1.execSync)(`bd init`, { cwd: path, encoding: 'utf-8' });
        }
        catch (error) {
            throw new Error(`Failed to initialize Beads repository: ${error}`);
        }
    }
    /**
     * Create a new Beads issue and return its ID
     */
    async create(issue) {
        try {
            // Build the bd create command
            const labelArgs = issue.labels.map(label => `--label "${label}"`).join(' ');
            // Serialize custom fields as JSON in the body
            const bodyWithCustomFields = this.serializeIssueBody(issue.body, issue.customFields);
            // Execute bd create command
            const command = `bd create --title "${this.escapeQuotes(issue.title)}" --body "${this.escapeQuotes(bodyWithCustomFields)}" ${labelArgs}`;
            const output = (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
            // Extract the issue ID from output (format: "Created issue bd-XXXX")
            const match = output.match(/bd-[a-f0-9]+/);
            if (!match) {
                throw new Error(`Failed to extract issue ID from bd create output: ${output}`);
            }
            return match[0];
        }
        catch (error) {
            throw new Error(`Failed to create Beads issue: ${error}`);
        }
    }
    /**
     * Update an existing Beads issue
     */
    async update(id, updates) {
        try {
            const args = [];
            if (updates.title) {
                args.push(`--title "${this.escapeQuotes(updates.title)}"`);
            }
            if (updates.body !== undefined) {
                const bodyWithCustomFields = updates.customFields
                    ? this.serializeIssueBody(updates.body, updates.customFields)
                    : updates.body;
                args.push(`--body "${this.escapeQuotes(bodyWithCustomFields)}"`);
            }
            if (updates.labels && updates.labels.length > 0) {
                const labelArgs = updates.labels.map(label => `--label "${label}"`).join(' ');
                args.push(labelArgs);
            }
            if (args.length === 0) {
                return; // Nothing to update
            }
            const command = `bd update ${id} ${args.join(' ')}`;
            (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
        }
        catch (error) {
            throw new Error(`Failed to update Beads issue ${id}: ${error}`);
        }
    }
    /**
     * Get a single Beads issue by ID
     */
    async get(id) {
        try {
            const output = (0, child_process_1.execSync)(`bd show ${id} --format json`, {
                cwd: this.repoPath,
                encoding: 'utf-8'
            });
            const data = JSON.parse(output);
            return this.parseBeadsIssue(data);
        }
        catch (error) {
            // If issue not found, return null
            if (error instanceof Error && error.message.includes('not found')) {
                return null;
            }
            throw new Error(`Failed to get Beads issue ${id}: ${error}`);
        }
    }
    /**
     * List Beads issues with optional filters
     */
    async list(filters) {
        try {
            const args = ['--format json'];
            if (filters?.labels && filters.labels.length > 0) {
                const labelArgs = filters.labels.map(label => `--label "${label}"`).join(' ');
                args.push(labelArgs);
            }
            if (filters?.createdAfter) {
                args.push(`--created-after "${filters.createdAfter}"`);
            }
            if (filters?.createdBefore) {
                args.push(`--created-before "${filters.createdBefore}"`);
            }
            const command = `bd list ${args.join(' ')}`;
            const output = (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
            if (!output.trim()) {
                return [];
            }
            const data = JSON.parse(output);
            const issues = Array.isArray(data) ? data : [data];
            return issues.map(issue => this.parseBeadsIssue(issue));
        }
        catch (error) {
            throw new Error(`Failed to list Beads issues: ${error}`);
        }
    }
    /**
     * Add a dependency link between two issues
     */
    async addDependency(fromId, toId, type) {
        try {
            const depType = type === 'supersedes' ? 'supersedes' : 'relates-to';
            const command = `bd link ${fromId} ${depType} ${toId}`;
            (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
        }
        catch (error) {
            throw new Error(`Failed to add dependency from ${fromId} to ${toId}: ${error}`);
        }
    }
    /**
     * Get all dependencies for an issue
     */
    async getDependencies(id) {
        try {
            const output = (0, child_process_1.execSync)(`bd show ${id} --format json`, {
                cwd: this.repoPath,
                encoding: 'utf-8'
            });
            const data = JSON.parse(output);
            const dependencies = [];
            // Parse dependencies from the issue data
            if (data.dependencies) {
                for (const [depType, ids] of Object.entries(data.dependencies)) {
                    const type = depType === 'supersedes' ? 'supersedes' : 'relates_to';
                    const idArray = Array.isArray(ids) ? ids : [ids];
                    for (const toId of idArray) {
                        dependencies.push({ fromId: id, toId, type });
                    }
                }
            }
            return dependencies;
        }
        catch (error) {
            throw new Error(`Failed to get dependencies for ${id}: ${error}`);
        }
    }
    /**
     * Add a label to an issue
     */
    async addLabel(id, label) {
        try {
            const command = `bd label ${id} "${label}"`;
            (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
        }
        catch (error) {
            throw new Error(`Failed to add label "${label}" to ${id}: ${error}`);
        }
    }
    /**
     * Remove a label from an issue
     */
    async removeLabel(id, label) {
        try {
            const command = `bd unlabel ${id} "${label}"`;
            (0, child_process_1.execSync)(command, { cwd: this.repoPath, encoding: 'utf-8' });
        }
        catch (error) {
            throw new Error(`Failed to remove label "${label}" from ${id}: ${error}`);
        }
    }
    /**
     * Serialize issue body with custom fields as JSON
     */
    serializeIssueBody(body, customFields) {
        const customFieldsJson = JSON.stringify(customFields);
        return `${body}\n\n---CUSTOM_FIELDS---\n${customFieldsJson}`;
    }
    /**
     * Parse a Beads issue from JSON data
     */
    parseBeadsIssue(data) {
        // Extract custom fields from body if present
        let body = data.body || '';
        let customFields = {};
        const customFieldsMarker = '---CUSTOM_FIELDS---';
        if (body.includes(customFieldsMarker)) {
            const parts = body.split(customFieldsMarker);
            body = parts[0].trim();
            try {
                customFields = JSON.parse(parts[1].trim());
            }
            catch (error) {
                // If parsing fails, leave customFields empty
            }
        }
        return {
            id: data.id,
            title: data.title || '',
            body,
            labels: data.labels || [],
            customFields,
            createdBy: data.created_by || data.createdBy || '',
            createdAt: data.created_at || data.createdAt || new Date().toISOString(),
            updatedAt: data.updated_at || data.updatedAt || new Date().toISOString(),
        };
    }
    /**
     * Escape quotes in strings for shell commands
     */
    escapeQuotes(str) {
        return str.replace(/"/g, '\\"');
    }
}
exports.BeadsWrapper = BeadsWrapper;
//# sourceMappingURL=beads-wrapper.js.map