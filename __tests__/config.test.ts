import { loadConfig, DEFAULT_CONFIG, shouldBlock, filterFindings } from '../src/config';
import * as fs from 'fs';
import * as path from 'path';

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

  it('applies action input overrides', () => {
    const overrides: any = {
      llm: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      policy: { block_on: 'critical' as const },
    };
    const cfg = loadConfig('/no/file', overrides);
    expect(cfg.llm.provider).toBe('anthropic');
    expect(cfg.llm.model).toBe('claude-3-5-sonnet-20241022');
    expect(cfg.policy.block_on).toBe('critical');
  });

  it('shouldBlock works correctly', () => {
    expect(shouldBlock('critical', 'high')).toBe(true);
    expect(shouldBlock('high', 'high')).toBe(true);
    expect(shouldBlock('medium', 'high')).toBe(false);
    expect(shouldBlock('high', 'none')).toBe(true);
    expect(shouldBlock('info', 'low')).toBe(false);
  });

  it('filterFindings respects min_confidence', () => {
    const cfg = { ...DEFAULT_CONFIG, policy: { ...DEFAULT_CONFIG.policy, min_confidence: 'high' as const } };
    const findings = [
      { confidence: 'high' },
      { confidence: 'medium' },
      { confidence: 'low' },
    ];
    const filtered = filterFindings(findings, cfg);
    expect(filtered.length).toBe(1);
    expect(filtered[0].confidence).toBe('high');
  });
});
