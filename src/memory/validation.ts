/**
 * Memory Entry Validation Module
 * 
 * Validates Memory_Entry fields against schema constraints and business rules.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.7, 5.8, 5.9, 9.7, 19.1
 */

import { MemoryEntryInput, EvidenceReference } from './types';

/**
 * Validation result containing success status and error messages
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valid values for section field
 */
const VALID_SECTIONS = ['decisions', 'state', 'observations', 'learnings'] as const;

/**
 * Valid values for kind field
 */
const VALID_KINDS = [
  'decision',
  'requirement',
  'invariant',
  'incident',
  'metric',
  'hypothesis',
  'runbook_step',
  'other'
] as const;

/**
 * Valid values for status field
 */
const VALID_STATUSES = ['active', 'superseded', 'deprecated', 'draft'] as const;
const VALID_PROVENANCE_SOURCES = [
  'field_note',
  'agent_result',
  'manual',
  'import',
  'validation',
  'compaction',
  'system',
  'other'
] as const;

/**
 * Scope pattern regex: repo | service:<name> | org | customer | environment:<prod|staging>
 */
const SCOPE_PATTERN = /^(repo|org|customer|service:[a-zA-Z0-9_-]+|environment:(prod|staging))$/;

/**
 * ISO 8601 timestamp pattern (basic validation)
 */
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

/**
 * Maximum length for summary field
 */
const MAX_SUMMARY_LENGTH = 300;

/**
 * Maximum length for content field
 */
const MAX_CONTENT_LENGTH = 2000;

/**
 * Minimum confidence value
 */
const MIN_CONFIDENCE = 0.0;

/**
 * Maximum confidence value
 */
const MAX_CONFIDENCE = 1.0;

/**
 * Validates a Memory_Entry input against all schema constraints and business rules
 * 
 * @param entry - The memory entry input to validate
 * @returns ValidationResult with valid flag and error/warning messages
 */
export function validateMemoryEntry(entry: MemoryEntryInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields exist
  if (!entry.section) {
    errors.push('Field "section" is required');
  }
  if (!entry.kind) {
    errors.push('Field "kind" is required');
  }
  if (!entry.subject) {
    errors.push('Field "subject" is required');
  }
  if (!entry.scope) {
    errors.push('Field "scope" is required');
  }
  if (!entry.summary) {
    errors.push('Field "summary" is required');
  }
  if (!entry.content) {
    errors.push('Field "content" is required');
  }
  if (entry.confidence === undefined || entry.confidence === null) {
    errors.push('Field "confidence" is required');
  }
  if (!entry.evidence) {
    errors.push('Field "evidence" is required');
  }
  if (!entry.provenance) {
    errors.push('Field "provenance" is required');
  }

  // Validate section enum
  if (entry.section && !VALID_SECTIONS.includes(entry.section)) {
    errors.push(
      `Field "section" must be one of: ${VALID_SECTIONS.join(', ')}. Got: "${entry.section}"`
    );
  }

  // Validate kind enum
  if (entry.kind && !VALID_KINDS.includes(entry.kind)) {
    errors.push(
      `Field "kind" must be one of: ${VALID_KINDS.join(', ')}. Got: "${entry.kind}"`
    );
  }

  // Validate scope pattern
  if (entry.scope && !SCOPE_PATTERN.test(entry.scope)) {
    errors.push(
      `Field "scope" must match pattern: repo | service:<name> | org | customer | environment:<prod|staging>. Got: "${entry.scope}"`
    );
  }

  // Validate summary length
  if (entry.summary && entry.summary.length > MAX_SUMMARY_LENGTH) {
    errors.push(
      `Field "summary" must not exceed ${MAX_SUMMARY_LENGTH} characters. Got: ${entry.summary.length} characters`
    );
  }

  // Validate content length
  if (entry.content && entry.content.length > MAX_CONTENT_LENGTH) {
    errors.push(
      `Field "content" must not exceed ${MAX_CONTENT_LENGTH} characters. Got: ${entry.content.length} characters`
    );
  }

  // Validate confidence range
  if (entry.confidence !== undefined && entry.confidence !== null) {
    if (entry.confidence < MIN_CONFIDENCE || entry.confidence > MAX_CONFIDENCE) {
      errors.push(
        `Field "confidence" must be between ${MIN_CONFIDENCE} and ${MAX_CONFIDENCE}. Got: ${entry.confidence}`
      );
    }
  }

  // Validate evidence array
  if (entry.evidence) {
    if (!Array.isArray(entry.evidence)) {
      errors.push('Field "evidence" must be an array');
    } else if (entry.evidence.length === 0) {
      errors.push('Field "evidence" must contain at least one evidence object');
    } else {
      // Validate each evidence object
      entry.evidence.forEach((evidence, index) => {
        const evidenceErrors = validateEvidence(evidence, index);
        errors.push(...evidenceErrors);
      });
    }
  }

  // Validate provenance
  if (entry.provenance) {
    if (!entry.provenance.source_type) {
      errors.push('Field "provenance.source_type" is required');
    } else if (!VALID_PROVENANCE_SOURCES.includes(entry.provenance.source_type)) {
      errors.push(
        `Field "provenance.source_type" must be one of: ${VALID_PROVENANCE_SOURCES.join(', ')}. Got: "${entry.provenance.source_type}"`
      );
    }

    if (
      entry.provenance.source_type === 'field_note' &&
      !entry.provenance.source_ref
    ) {
      errors.push('Field "provenance.source_ref" is required when source_type is "field_note"');
    }
  }

  // Validate status enum (if provided)
  if (entry.status && !VALID_STATUSES.includes(entry.status)) {
    errors.push(
      `Field "status" must be one of: ${VALID_STATUSES.join(', ')}. Got: "${entry.status}"`
    );
  }



  // Add warning for low confidence
  if (entry.confidence !== undefined && entry.confidence < 0.5) {
    warnings.push(
      `Low confidence score: ${entry.confidence}. Consider providing stronger evidence or marking as draft.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single evidence object
 * 
 * @param evidence - The evidence object to validate
 * @param index - The index of the evidence object in the array (for error messages)
 * @returns Array of error messages
 */
function validateEvidence(evidence: any, index: number): string[] {
  const errors: string[] = [];

  if (!evidence || typeof evidence !== 'object') {
    errors.push(`Evidence at index ${index} must be an object`);
    return errors;
  }

  // Validate required fields
  if (!evidence.type) {
    errors.push(`Evidence at index ${index} is missing required field "type"`);
  }
  if (!evidence.uri) {
    errors.push(`Evidence at index ${index} is missing required field "uri"`);
  }
  if (!evidence.note) {
    errors.push(`Evidence at index ${index} is missing required field "note"`);
  }

  // Validate evidence type enum
  const validTypes = ['code', 'artifact', 'log', 'screenshot', 'assumption', 'ticket', 'doc'];
  if (evidence.type && !validTypes.includes(evidence.type)) {
    errors.push(
      `Evidence at index ${index} has invalid type. Must be one of: ${validTypes.join(', ')}. Got: "${evidence.type}"`
    );
  }

  return errors;
}

/**
 * Validates that a string is a valid ISO 8601 timestamp
 * 
 * @param timestamp - The timestamp string to validate
 * @returns true if valid, false otherwise
 */
export function isValidISO8601(timestamp: string): boolean {
  if (!ISO_8601_PATTERN.test(timestamp)) {
    return false;
  }
  
  try {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Validates that a scope string matches the required pattern
 * 
 * @param scope - The scope string to validate
 * @returns true if valid, false otherwise
 */
export function isValidScope(scope: string): boolean {
  return SCOPE_PATTERN.test(scope);
}
