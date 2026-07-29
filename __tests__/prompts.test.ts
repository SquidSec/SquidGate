import { inferLanguage, buildSystemPrompt, buildUserPrompt } from '../src/prompts';
import { DEFAULT_CONFIG } from '../src/config';

describe('prompts', () => {
  it('infers common languages from extensions', () => {
    expect(inferLanguage('foo.ts')).toBe('TypeScript');
    expect(inferLanguage('bar.js')).toBe('JavaScript');
    expect(inferLanguage('main.py')).toBe('Python');
    expect(inferLanguage('app.go')).toBe('Go');
    expect(inferLanguage('unknown.xyz')).toBe('Unknown');
    expect(inferLanguage('Dockerfile')).toBe('Dockerfile');
  });

  it('buildSystemPrompt includes strict security standards and categories', () => {
    const prompt = buildSystemPrompt(DEFAULT_CONFIG);
    expect(prompt).toContain('OWASP Top 10');
    expect(prompt).toContain('CWE Top 25');
    expect(prompt).toContain('be conservative');
    expect(prompt).toContain('secrets, injection');
    expect(prompt).toContain('NEVER include any text before or after the JSON');
    expect(prompt).toContain('ONLY a single valid JSON object');
    expect(prompt).toContain('EXAMPLE FINDING (secret)');
    expect(prompt).toContain('"category"');
  });

  it('buildUserPrompt includes policy, files and diff', () => {
    const files = [{ filename: 'src/app.ts' }, { filename: 'api.py' }];
    const diff = 'diff --git a/src/app.ts ...';
    const prompt = buildUserPrompt(diff, files, DEFAULT_CONFIG);
    expect(prompt).toContain('src/app.ts (TypeScript)');
    expect(prompt).toContain('api.py (Python)');
    expect(prompt).toContain('block_on: high');
    expect(prompt).toContain('```diff');
    expect(prompt).toContain(diff);
  });

  it('buildUserPrompt notes truncation', () => {
    const prompt = buildUserPrompt('diff', [{ filename: 'a.ts' }], DEFAULT_CONFIG, true);
    expect(prompt).toContain('truncated');
  });

  it('buildSystemPrompt lists custom rules when present', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      policy: {
        ...DEFAULT_CONFIG.policy,
        custom_rules: ['No eval ever', 'Require MFA'],
      },
    };
    const p = buildSystemPrompt(cfg);
    expect(p).toContain('CUSTOM RULES');
    expect(p).toContain('No eval ever');
  });

  it('buildSystemPrompt lists disabled categories', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      policy: {
        ...DEFAULT_CONFIG.policy,
        categories: { ...DEFAULT_CONFIG.policy.categories, xss: false },
      },
    };
    const p = buildSystemPrompt(cfg);
    expect(p).toContain('DISABLED CATEGORIES');
    expect(p).toContain('xss');
  });
});
