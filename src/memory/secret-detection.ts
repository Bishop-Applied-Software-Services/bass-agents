/**
 * Secret Detection Module
 * 
 * Detects common secret patterns in memory entry content and evidence URIs
 * to prevent sensitive data from being stored in the memory system.
 * 
 * Requirements: 13.1, 13.2, 13.4, 13.5, 13.9
 */

import { MemoryEntryInput, EvidenceReference } from './types.js';

/**
 * Result of secret detection
 */
export interface SecretDetectionResult {
  hasSecrets: boolean;
  errors: string[];
}

/**
 * Secret pattern definition
 */
interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

/**
 * Common secret patterns to detect
 * Based on established tools like truffleHog and detect-secrets
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // Generic API keys
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)[=:\s]+['"]*([a-zA-Z0-9_\-]{20,})['"]*|['"](sk|pk|api)[_-][a-zA-Z0-9]{20,}['"]/i,
    description: 'Generic API key pattern'
  },
  
  // AWS Access Keys
  {
    name: 'AWS Access Key',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
    description: 'AWS Access Key ID'
  },
  
  // AWS Secret Access Keys
  {
    name: 'AWS Secret Key',
    pattern: /aws[_-]?secret[_-]?access[_-]?key[=:\s]+['"]*([a-zA-Z0-9/+=]{40})['"]*/i,
    description: 'AWS Secret Access Key'
  },
  
  // Private Keys
  {
    name: 'Private Key',
    pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/,
    description: 'Private key (RSA, DSA, EC, OpenSSH, PGP)'
  },
  
  // GitHub Tokens
  {
    name: 'GitHub Token',
    pattern: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/,
    description: 'GitHub personal access token'
  },
  
  // Generic Bearer Tokens
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[a-zA-Z0-9_\-\.=]{20,}/i,
    description: 'Bearer token'
  },
  
  // JWT Tokens
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    description: 'JSON Web Token (JWT)'
  },
  
  // Database Connection Strings with passwords
  {
    name: 'Database Connection String',
    pattern: /(mongodb|postgres|postgresql|mysql|mariadb|redis):\/\/[^:]+:[^@\s]+@/i,
    description: 'Database connection string with credentials'
  },
  
  // OAuth Client Secrets
  {
    name: 'OAuth Client Secret',
    pattern: /client[_-]?secret[=:\s]+['"]*([a-zA-Z0-9_\-]{20,})['"]*/i,
    description: 'OAuth client secret'
  },
  
  // Slack Tokens
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/,
    description: 'Slack token'
  },
  
  // Generic passwords in key-value format
  {
    name: 'Password',
    pattern: /(?:password|passwd|pwd)[=:\s]+['"]*([^\s'"]{8,})['"]*/i,
    description: 'Password in key-value format'
  },
  
  // Stripe API Keys
  {
    name: 'Stripe API Key',
    pattern: /(?:sk|pk)_(test|live)_[0-9a-zA-Z]{24,}/,
    description: 'Stripe API key'
  },
  
  // Google API Keys
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    description: 'Google API key'
  },
  
  // Twilio API Keys
  {
    name: 'Twilio API Key',
    pattern: /SK[0-9a-fA-F]{32}/,
    description: 'Twilio API key'
  },
  
  // SendGrid API Keys
  {
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    description: 'SendGrid API key'
  }
];

/**
 * Detect secrets in a text string
 * 
 * @param text - Text to scan for secrets
 * @param fieldName - Name of the field being scanned (for error messages)
 * @returns Detection result with errors if secrets found
 */
function detectSecretsInText(text: string, fieldName: string): SecretDetectionResult {
  const errors: string[] = [];
  
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.pattern.test(text)) {
      errors.push(
        `Detected ${pattern.description} in ${fieldName}. ` +
        `Please use placeholder values like [API_KEY] instead of actual secrets.`
      );
    }
  }
  
  return {
    hasSecrets: errors.length > 0,
    errors
  };
}

/**
 * Detect secrets in evidence URIs
 * 
 * @param evidence - Array of evidence references
 * @returns Detection result with errors if secrets found
 */
function detectSecretsInEvidence(evidence: EvidenceReference[]): SecretDetectionResult {
  const errors: string[] = [];
  
  for (let i = 0; i < evidence.length; i++) {
    const ev = evidence[i];
    const result = detectSecretsInText(ev.uri, `evidence[${i}].uri`);
    
    if (result.hasSecrets) {
      errors.push(...result.errors);
    }
  }
  
  return {
    hasSecrets: errors.length > 0,
    errors
  };
}

/**
 * Detect secrets in a memory entry
 * 
 * Scans the content field and all evidence URIs for common secret patterns.
 * Returns descriptive errors WITHOUT logging the detected secrets.
 * 
 * Requirements:
 * - 13.1: Reject Memory_Entry content containing detected secrets
 * - 13.2: Reject Memory_Entry evidence URIs containing detected secrets
 * - 13.4: Scan for common secret patterns
 * - 13.5: Return descriptive error when secrets detected
 * - 13.9: Validate evidence URIs don't expose credentials
 * 
 * @param entry - Memory entry input to validate
 * @returns Detection result with all errors found
 */
export function detectSecrets(entry: MemoryEntryInput): SecretDetectionResult {
  const allErrors: string[] = [];
  
  // Scan content field
  const contentResult = detectSecretsInText(entry.content, 'content');
  if (contentResult.hasSecrets) {
    allErrors.push(...contentResult.errors);
  }
  
  // Scan summary field (might contain secrets too)
  const summaryResult = detectSecretsInText(entry.summary, 'summary');
  if (summaryResult.hasSecrets) {
    allErrors.push(...summaryResult.errors);
  }
  
  // Scan evidence URIs
  const evidenceResult = detectSecretsInEvidence(entry.evidence);
  if (evidenceResult.hasSecrets) {
    allErrors.push(...evidenceResult.errors);
  }
  
  return {
    hasSecrets: allErrors.length > 0,
    errors: allErrors
  };
}

/**
 * Validate that a memory entry does not contain secrets
 * 
 * This is a convenience function that throws an error if secrets are detected.
 * 
 * @param entry - Memory entry input to validate
 * @throws Error if secrets are detected
 */
export function validateNoSecrets(entry: MemoryEntryInput): void {
  const result = detectSecrets(entry);
  
  if (result.hasSecrets) {
    throw new Error(
      `Secret detection failed:\n${result.errors.join('\n')}`
    );
  }
}
