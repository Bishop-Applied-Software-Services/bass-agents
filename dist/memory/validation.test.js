"use strict";
/**
 * Unit tests for Memory Entry Validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const validation_1 = require("./validation");
(0, vitest_1.describe)('validateMemoryEntry', () => {
    const validEntry = {
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
    (0, vitest_1.test)('validates a valid entry', () => {
        const result = (0, validation_1.validateMemoryEntry)(validEntry);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.test)('rejects entry with missing required fields', () => {
        const invalidEntry = { ...validEntry, section: undefined };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors).toContain('Field "section" is required');
    });
    (0, vitest_1.test)('rejects entry with invalid section', () => {
        const invalidEntry = { ...validEntry, section: 'invalid' };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('section'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with invalid kind', () => {
        const invalidEntry = { ...validEntry, kind: 'invalid' };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('kind'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with invalid scope pattern', () => {
        const invalidEntry = { ...validEntry, scope: 'invalid-scope' };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('scope'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with summary exceeding max length', () => {
        const invalidEntry = { ...validEntry, summary: 'a'.repeat(301) };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('summary'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with content exceeding max length', () => {
        const invalidEntry = { ...validEntry, content: 'a'.repeat(2001) };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('content'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with confidence out of range', () => {
        const invalidEntry1 = { ...validEntry, confidence: -0.1 };
        const result1 = (0, validation_1.validateMemoryEntry)(invalidEntry1);
        (0, vitest_1.expect)(result1.valid).toBe(false);
        (0, vitest_1.expect)(result1.errors.some(e => e.includes('confidence'))).toBe(true);
        const invalidEntry2 = { ...validEntry, confidence: 1.1 };
        const result2 = (0, validation_1.validateMemoryEntry)(invalidEntry2);
        (0, vitest_1.expect)(result2.valid).toBe(false);
        (0, vitest_1.expect)(result2.errors.some(e => e.includes('confidence'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with empty evidence array', () => {
        const invalidEntry = { ...validEntry, evidence: [] };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('evidence'))).toBe(true);
    });
    (0, vitest_1.test)('rejects entry with invalid evidence object', () => {
        const invalidEntry = {
            ...validEntry,
            evidence: [{ type: 'code', uri: 'test' }]
        };
        const result = (0, validation_1.validateMemoryEntry)(invalidEntry);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors.some(e => e.includes('note'))).toBe(true);
    });
    (0, vitest_1.test)('warns about low confidence', () => {
        const lowConfidenceEntry = { ...validEntry, confidence: 0.3 };
        const result = (0, validation_1.validateMemoryEntry)(lowConfidenceEntry);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.warnings.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(result.warnings.some(w => w.includes('Low confidence'))).toBe(true);
    });
});
(0, vitest_1.describe)('isValidISO8601', () => {
    (0, vitest_1.test)('validates correct ISO 8601 timestamps', () => {
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('2024-01-01T00:00:00Z')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('2024-12-31T23:59:59Z')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('2024-06-15T12:30:45.123Z')).toBe(true);
    });
    (0, vitest_1.test)('rejects invalid timestamps', () => {
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('not-a-date')).toBe(false);
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('2024-13-01T00:00:00Z')).toBe(false);
        (0, vitest_1.expect)((0, validation_1.isValidISO8601)('2024-01-32T00:00:00Z')).toBe(false);
    });
});
(0, vitest_1.describe)('isValidScope', () => {
    (0, vitest_1.test)('validates correct scope patterns', () => {
        (0, vitest_1.expect)((0, validation_1.isValidScope)('repo')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('org')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('customer')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('service:auth')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('service:user-service')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('environment:prod')).toBe(true);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('environment:staging')).toBe(true);
    });
    (0, vitest_1.test)('rejects invalid scope patterns', () => {
        (0, vitest_1.expect)((0, validation_1.isValidScope)('invalid')).toBe(false);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('service:')).toBe(false);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('environment:dev')).toBe(false);
        (0, vitest_1.expect)((0, validation_1.isValidScope)('service:auth:extra')).toBe(false);
    });
});
//# sourceMappingURL=validation.test.js.map