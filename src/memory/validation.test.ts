/**
 * Unit tests for Memory Entry Validation
 */

import { describe, test, expect } from 'vitest';
import { validateMemoryEntry, isValidISO8601, isValidScope } from './validation';
import { MemoryEntryInput } from './types';

describe('validateMemoryEntry', () => {
  const validEntry: MemoryEntryInput = {
    section: 'decisions',
    kind: 'decision',
    subject: 'auth-service.login',
    scope: 'service:auth',
    summary: 'Use JWT tokens for authentication',
    content: 'After evaluating options, we decided to use JWT tokens for stateless authentication.',
    confidence: 0.8,
    evidence: [
      {
        type: 'code',
        uri: 'https://github.com/org/repo/blob/abc123/src/auth.ts#L10-L20',
        note: 'Implementation of JWT token generation'
      }
    ],
    created_by: 'agent-1'
  };

  test('validates a valid entry', () => {
    const result = validateMemoryEntry(validEntry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects entry with missing required fields', () => {
    const invalidEntry = { ...validEntry, section: undefined } as any;
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Field "section" is required');
  });

  test('rejects entry with invalid section', () => {
    const invalidEntry = { ...validEntry, section: 'invalid' as any };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('section'))).toBe(true);
  });

  test('rejects entry with invalid kind', () => {
    const invalidEntry = { ...validEntry, kind: 'invalid' as any };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('kind'))).toBe(true);
  });

  test('rejects entry with invalid scope pattern', () => {
    const invalidEntry = { ...validEntry, scope: 'invalid-scope' };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('scope'))).toBe(true);
  });

  test('rejects entry with summary exceeding max length', () => {
    const invalidEntry = { ...validEntry, summary: 'a'.repeat(301) };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('summary'))).toBe(true);
  });

  test('rejects entry with content exceeding max length', () => {
    const invalidEntry = { ...validEntry, content: 'a'.repeat(2001) };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('content'))).toBe(true);
  });

  test('rejects entry with confidence out of range', () => {
    const invalidEntry1 = { ...validEntry, confidence: -0.1 };
    const result1 = validateMemoryEntry(invalidEntry1);
    expect(result1.valid).toBe(false);
    expect(result1.errors.some(e => e.includes('confidence'))).toBe(true);

    const invalidEntry2 = { ...validEntry, confidence: 1.1 };
    const result2 = validateMemoryEntry(invalidEntry2);
    expect(result2.valid).toBe(false);
    expect(result2.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  test('rejects entry with empty evidence array', () => {
    const invalidEntry = { ...validEntry, evidence: [] };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('evidence'))).toBe(true);
  });

  test('rejects entry with invalid evidence object', () => {
    const invalidEntry = {
      ...validEntry,
      evidence: [{ type: 'code', uri: 'test' }] as any
    };
    const result = validateMemoryEntry(invalidEntry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('note'))).toBe(true);
  });

  test('warns about low confidence', () => {
    const lowConfidenceEntry = { ...validEntry, confidence: 0.3 };
    const result = validateMemoryEntry(lowConfidenceEntry);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Low confidence'))).toBe(true);
  });
});

describe('isValidISO8601', () => {
  test('validates correct ISO 8601 timestamps', () => {
    expect(isValidISO8601('2024-01-01T00:00:00Z')).toBe(true);
    expect(isValidISO8601('2024-12-31T23:59:59Z')).toBe(true);
    expect(isValidISO8601('2024-06-15T12:30:45.123Z')).toBe(true);
  });

  test('rejects invalid timestamps', () => {
    expect(isValidISO8601('not-a-date')).toBe(false);
    expect(isValidISO8601('2024-13-01T00:00:00Z')).toBe(false);
    expect(isValidISO8601('2024-01-32T00:00:00Z')).toBe(false);
  });
});

describe('isValidScope', () => {
  test('validates correct scope patterns', () => {
    expect(isValidScope('repo')).toBe(true);
    expect(isValidScope('org')).toBe(true);
    expect(isValidScope('customer')).toBe(true);
    expect(isValidScope('service:auth')).toBe(true);
    expect(isValidScope('service:user-service')).toBe(true);
    expect(isValidScope('environment:prod')).toBe(true);
    expect(isValidScope('environment:staging')).toBe(true);
  });

  test('rejects invalid scope patterns', () => {
    expect(isValidScope('invalid')).toBe(false);
    expect(isValidScope('service:')).toBe(false);
    expect(isValidScope('environment:dev')).toBe(false);
    expect(isValidScope('service:auth:extra')).toBe(false);
  });
});
