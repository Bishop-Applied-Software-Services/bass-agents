"use strict";
/**
 * Translation between Memory_Entry and Beads Issue formats
 *
 * Maps Memory_Entry fields to Beads labels and custom fields according to the design:
 * - section, kind, scope, status, tags -> Beads labels
 * - confidence, evidence, subject, valid_from, valid_to -> Beads custom fields
 * - superseded_by, related_entries -> Beads dependencies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryEntryToBeadsIssue = memoryEntryToBeadsIssue;
exports.beadsIssueToMemoryEntry = beadsIssueToMemoryEntry;
exports.extractLabelValue = extractLabelValue;
exports.buildLabel = buildLabel;
/**
 * Convert a Memory_Entry to a Beads issue format
 */
function memoryEntryToBeadsIssue(entry) {
    // Build labels array
    const labels = [
        `section:${entry.section}`,
        `kind:${entry.kind}`,
        `scope:${entry.scope}`,
        `status:${entry.status || 'active'}`,
    ];
    // Add tag labels
    if (entry.tags && entry.tags.length > 0) {
        entry.tags.forEach(tag => labels.push(`tag:${tag}`));
    }
    // Build custom fields
    const customFields = {
        subject: entry.subject,
        confidence: entry.confidence,
        evidence: entry.evidence,
    };
    if (entry.valid_from !== undefined) {
        customFields.valid_from = entry.valid_from;
    }
    if (entry.valid_to !== undefined) {
        customFields.valid_to = entry.valid_to;
    }
    if (entry.superseded_by !== undefined) {
        customFields.superseded_by = entry.superseded_by;
    }
    if (entry.related_entries !== undefined) {
        customFields.related_entries = entry.related_entries;
    }
    // Create Beads issue
    const beadsIssue = {
        title: entry.summary,
        body: entry.content,
        labels,
        customFields,
        createdBy: entry.created_by,
        createdAt: 'created_at' in entry ? entry.created_at : new Date().toISOString(),
        updatedAt: 'updated_at' in entry ? entry.updated_at : new Date().toISOString(),
    };
    if ('id' in entry && entry.id) {
        beadsIssue.id = entry.id;
    }
    return beadsIssue;
}
/**
 * Convert a Beads issue to a Memory_Entry
 */
function beadsIssueToMemoryEntry(issue) {
    // Parse labels
    const labelMap = new Map();
    const tags = [];
    issue.labels.forEach(label => {
        const [prefix, ...valueParts] = label.split(':');
        const value = valueParts.join(':'); // Handle values with colons
        if (prefix === 'tag') {
            tags.push(value);
        }
        else {
            labelMap.set(prefix, value);
        }
    });
    // Extract fields from labels
    const section = labelMap.get('section') || 'observations';
    const kind = labelMap.get('kind') || 'other';
    const scope = labelMap.get('scope') || 'repo';
    const status = labelMap.get('status') || 'active';
    // Extract custom fields
    const subject = issue.customFields.subject || '';
    const confidence = issue.customFields.confidence || 0.5;
    const evidence = issue.customFields.evidence || [];
    const valid_from = issue.customFields.valid_from || null;
    const valid_to = issue.customFields.valid_to || null;
    const superseded_by = issue.customFields.superseded_by || null;
    const related_entries = issue.customFields.related_entries || [];
    // Validate evidence array
    const validatedEvidence = Array.isArray(evidence)
        ? evidence.filter(e => e && typeof e === 'object' && e.type && e.uri && e.note)
        : [];
    // Create Memory_Entry
    const memoryEntry = {
        id: issue.id || '',
        section,
        kind,
        subject,
        scope,
        summary: issue.title,
        content: issue.body,
        tags,
        confidence,
        evidence: validatedEvidence,
        status,
        superseded_by,
        related_entries: Array.isArray(related_entries) ? related_entries : [],
        valid_from,
        valid_to,
        created_by: issue.createdBy,
        created_at: issue.createdAt,
        updated_at: issue.updatedAt,
    };
    return memoryEntry;
}
/**
 * Extract label value from a label string (e.g., "section:decisions" -> "decisions")
 */
function extractLabelValue(label, prefix) {
    if (!label.startsWith(`${prefix}:`)) {
        return null;
    }
    return label.substring(prefix.length + 1);
}
/**
 * Build a label string from prefix and value (e.g., "section", "decisions" -> "section:decisions")
 */
function buildLabel(prefix, value) {
    return `${prefix}:${value}`;
}
//# sourceMappingURL=translation.js.map