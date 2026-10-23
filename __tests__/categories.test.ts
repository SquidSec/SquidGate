import {
  canonicalCategory,
  filterFindings,
  inferCategory,
  loadConfig,
  KNOWN_CATEGORIES,
} from '../src/config';
import type { Finding } from '../src/types';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    severity: 'high',
    title: 'Issue',
    description: 'Something',
    cwe: null,
    owasp: null,
    recommendation: 'Fix it',
    confidence: 'high',
    ...over,
  };
}

describe('category inference', () => {
  it.each([
    ['SQL injection via concatenation', 'injection'],
    ['Command injection in shell call', 'injection'],
    ['user input reaches eval()', 'dangerous_functions'],
    ['exec( on untrusted input', 'dangerous_functions'],
    ['uses child_process', 'dangerous_functions'],
    ['Hardcoded password in source', 'hardcoded_credentials'],
    ['Weak hash: md5', 'cryptography'],
    ['pickle.loads on request body', 'insecure_deserialization'],
  ])('maps %s to %s', (text, expected) => {
    expect(inferCategory(finding({ title: text, description: text }))).toBe(expected);
  });

  it('uses CWE hints when the text is generic', () => {
    expect(inferCategory(finding({ title: 'Issue', description: 'x', cwe: 'CWE-89' }))).toBe('injection');
    expect(inferCategory(finding({ title: 'Issue', description: 'x', cwe: 'CWE-79' }))).toBe('xss');
  });

  it('every known category is reachable through an alias', () => {
    for (const key of KNOWN_CATEGORIES) {
      expect(canonicalCategory(key)).toBe(key);
    }
  });
});

describe('canonicalCategory', () => {
  it.each([
    ['SQL Injection', 'injection'],
    ['sql-injection', 'injection'],
    ['SQLInjection', 'injection'],
    ['sqli', 'injection'],
    ['RCE', 'dangerous_functions'],
    ['Cross-Site Scripting', 'xss'],
    ['hardcoded password', 'hardcoded_credentials'],
    ['Broken Access Control', 'authn_authz'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicalCategory(input)).toBe(expected);
  });

  it('returns null for unknown values so inference can run', () => {
    expect(canonicalCategory('made up category')).toBeNull();
    expect(canonicalCategory(undefined)).toBeNull();
    expect(canonicalCategory(42)).toBeNull();
  });
});

describe('policy filtering', () => {
  it('drops findings in a disabled category regardless of how it was spelled', () => {
    const cfg = loadConfig('/nonexistent');
    cfg.policy.categories.injection = false;
    cfg.policy.categories.dangerous_functions = false;

    const findings = [
      finding({ title: 'SQL injection', description: 'sql injection', category: canonicalCategory('SQL Injection') }),
      finding({ title: 'Code execution', description: 'eval() on user input' }),
    ];
    expect(filterFindings(findings, cfg)).toHaveLength(0);
  });

  it('keeps findings in enabled categories', () => {
    const cfg = loadConfig('/nonexistent');
    cfg.policy.categories.injection = false;
    const kept = finding({ title: 'XSS', description: 'unescaped html', category: 'xss' });
    expect(filterFindings([kept], cfg)).toEqual([kept]);
  });

  it('accepts camelCase category keys in a config file', () => {
    const fs = require('fs');
    const p = '/tmp/sg-camel.yml';
    fs.writeFileSync(p, 'policy:\n  categories:\n    DangerousFunctions: false\n');
    try {
      const cfg = loadConfig(p);
      const f = finding({ title: 'eval', description: 'eval() usage' });
      expect(filterFindings([f], cfg)).toHaveLength(0);
    } finally {
      fs.unlinkSync(p);
    }
  });
});
