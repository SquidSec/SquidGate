import {
  loadConfig,
  DEFAULT_CONFIG,
  shouldBlock,
  filterFindings,
  inferCategory,
  deepMerge,
  readConfiguredModel,
  readConfiguredLlm,
  resolveOpenCodeGoModel,
  resolveRuntimeLlm,
} from '../src/config';
import * as fs from 'fs';
import * as path from 'path';
import type { Finding } from '../src/types';

const tmpConfigPath = path.join(__dirname, 'temp-squidgate.yml');

describe('config', () => {
  afterEach(() => {
    if (fs.existsSync(tmpConfigPath)) fs.unlinkSync(tmpConfigPath);
  });

  it('returns strict defaults when no file', () => {
    const cfg = loadConfig('/non/existent/path.yml');
    expect(cfg.policy.block_on).toBe('high');
    expect(cfg.policy.min_confidence).toBe('medium');
    expect(cfg.llm.provider).toBe('openai');
    expect(cfg.context.max_files).toBe(50);
    expect(Object.values(cfg.policy.categories).every(v => v === true)).toBe(true);
  });

  it('loads from yaml and merges', () => {
    fs.writeFileSync(tmpConfigPath, `
version: 1
policy:
  block_on: medium
  min_confidence: high
  categories:
    secrets: true
    xss: false
`);
    const cfg = loadConfig(tmpConfigPath);
    expect(cfg.policy.block_on).toBe('medium');
    expect(cfg.policy.min_confidence).toBe('high');
    expect(cfg.policy.categories.xss).toBe(false);
    expect(cfg.policy.categories.secrets).toBe(true);
    expect(cfg.policy.categories.injection).toBe(true); // still default
  });

  it('defaults OpenCode Go to glm-5.3-flash unless another model is explicit', () => {
    expect(resolveOpenCodeGoModel(undefined, false)).toBe('glm-5.3-flash');
    expect(resolveOpenCodeGoModel('gpt-4o', true)).toBe('glm-5.3-flash');
    expect(resolveOpenCodeGoModel('gpt-4o', false)).toBe('glm-5.3-flash');
    expect(resolveOpenCodeGoModel('kimi-k3', true)).toBe('kimi-k3');
    expect(readConfiguredModel('/non/existent/path.yml')).toBe('');
  });

  it('reads an explicit model from the config file', () => {
    fs.writeFileSync(tmpConfigPath, 'llm:\n  provider: opencode-go\n  model: kimi-k3\n');
    expect(readConfiguredModel(tmpConfigPath)).toBe('kimi-k3');
    expect(readConfiguredLlm(tmpConfigPath)).toEqual({ provider: 'opencode-go', model: 'kimi-k3' });
  });

  it('overrides only the llm field that was set', () => {
    fs.writeFileSync(tmpConfigPath, 'llm:\n  provider: opencode-go\n  model: kimi-k3\n');
    const cfg = loadConfig(tmpConfigPath, { llm: { model: 'glm-5.3-flash' } });
    expect(cfg.llm.provider).toBe('opencode-go');
    expect(cfg.llm.model).toBe('glm-5.3-flash');
  });

  it('keeps each llm input independent and does not reuse a foreign model', () => {
    expect(resolveRuntimeLlm('opencode-go', 'kimi-k3', '', 'glm-5.3-flash')).toEqual({
      provider: 'opencode-go',
      model: 'glm-5.3-flash',
      warnings: [],
    });

    const switched = resolveRuntimeLlm('openai', 'gpt-4o-mini', 'opencode-go', '');
    expect(switched.provider).toBe('opencode-go');
    expect(switched.model).toBe('glm-5.3-flash');
    expect(switched.warnings.join('\n')).toContain('gpt-4o-mini');
    expect(switched.warnings.join('\n')).not.toContain('sk-');

    expect(resolveRuntimeLlm('opencode-go', '', '', '')).toMatchObject({
      provider: 'opencode-go',
      model: 'glm-5.3-flash',
    });

    expect(resolveRuntimeLlm('opencode-go', 'kimi-k3', '', '')).toMatchObject({
      provider: 'opencode-go',
      model: 'kimi-k3',
      warnings: [],
    });

    expect(resolveRuntimeLlm('openai', 'gpt-4o', 'opencode-go', 'kimi-k3')).toEqual({
      provider: 'opencode-go',
      model: 'kimi-k3',
      warnings: [],
    });

    const rewritten = resolveRuntimeLlm('opencode-go', 'gpt-4o', '', '');
    expect(rewritten.model).toBe('glm-5.3-flash');
    expect(rewritten.warnings.join('\n')).toMatch(/Not sending gpt-4o/);

    expect(resolveRuntimeLlm('anthropic', 'claude-3-5-sonnet', '', 'claude-haiku')).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku',
    });
  });

  it('applies action input overrides', () => {
    const overrides = {
      llm: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      policy: { block_on: 'critical' as const },
    };
    const cfg = loadConfig('/no/file', overrides as any);
    expect(cfg.llm.provider).toBe('anthropic');
    expect(cfg.llm.model).toBe('claude-3-5-sonnet-20241022');
    expect(cfg.policy.block_on).toBe('critical');
  });

  it('shouldBlock works correctly', () => {
    expect(shouldBlock('critical', 'high')).toBe(true);
    expect(shouldBlock('high', 'high')).toBe(true);
    expect(shouldBlock('medium', 'high')).toBe(false);
    expect(shouldBlock('high', 'none')).toBe(false); // none = never block
    expect(shouldBlock('info', 'low')).toBe(false);
  });

  it('filterFindings respects min_confidence', () => {
    const cfg = { ...DEFAULT_CONFIG, policy: { ...DEFAULT_CONFIG.policy, min_confidence: 'high' as const } };
    const findings = [
      { confidence: 'high' },
      { confidence: 'medium' },
      { confidence: 'low' },
    ] as Finding[];
    const filtered = filterFindings(findings, cfg);
    expect(filtered.length).toBe(1);
    expect(filtered[0].confidence).toBe('high');
  });

  it('filterFindings drops disabled categories', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      policy: {
        ...DEFAULT_CONFIG.policy,
        categories: { ...DEFAULT_CONFIG.policy.categories, xss: false, secrets: true },
      },
    };
    const findings = [
      {
        file: 'a.ts',
        start_line: 1,
        end_line: 1,
        severity: 'high',
        title: 'Reflected XSS',
        description: 'cross-site scripting via innerHTML',
        cwe: 'CWE-79',
        owasp: null,
        recommendation: 'escape',
        confidence: 'high',
        category: 'xss',
      },
      {
        file: 'b.ts',
        start_line: 2,
        end_line: 2,
        severity: 'high',
        title: 'API key',
        description: 'hardcoded secret token',
        cwe: 'CWE-798',
        owasp: null,
        recommendation: 'env',
        confidence: 'high',
        category: 'secrets',
      },
    ] as Finding[];
    const filtered = filterFindings(findings, cfg);
    expect(filtered.length).toBe(1);
    expect(filtered[0].category).toBe('secrets');
  });

  it('inferCategory maps CWE/text when category omitted', () => {
    const f = {
      file: 'x.py',
      start_line: 1,
      end_line: 1,
      severity: 'high',
      title: 'Issue',
      description: 'user input concatenated into SQL query',
      cwe: 'CWE-89',
      owasp: null,
      recommendation: 'parameterize',
      confidence: 'high',
    } as Finding;
    expect(inferCategory(f)).toBe('injection');
  });

  it('deepMerge merges nested objects recursively', () => {
    const a = { policy: { categories: { a: true, b: true }, block_on: 'high' }, x: 1 };
    const b = { policy: { categories: { b: false }, block_on: 'low' } };
    const m = deepMerge(a, b);
    expect(m.policy.block_on).toBe('low');
    expect(m.policy.categories.a).toBe(true);
    expect(m.policy.categories.b).toBe(false);
    expect(m.x).toBe(1);
  });
});
