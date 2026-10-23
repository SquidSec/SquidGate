import { loadConfig, shouldBlock, normalizeSeverity, normalizeConfidence, validateBlockOn } from '../src/config';
import { normalizeResponse } from '../src/llm';
import { createCheckRun } from '../src/checks';
import * as github from '@actions/github';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

describe('gate integrity', () => {
  const mockCreate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { checks: { create: mockCreate }, issues: { createComment: jest.fn() } },
    });
    mockCreate.mockResolvedValue({ data: { html_url: 'https://ex' } });
  });

  it('blocks regardless of model casing', () => {
    expect(shouldBlock('Critical', 'high')).toBe(true);
    expect(shouldBlock('HIGH', 'high')).toBe(true);
    expect(shouldBlock('critical', 'HIGH')).toBe(true);
    expect(normalizeSeverity('Critical')).toBe('critical');
    expect(normalizeConfidence('High')).toBe('high');
  });

  it('keeps uppercase-confidence findings', () => {
    const resp = normalizeResponse({
      findings: [{ file: 'a.ts', start_line: 1, end_line: 1, severity: 'Critical', confidence: 'High' }],
      summary: 's',
    });
    expect(resp.findings[0].severity).toBe('critical');
    expect(resp.findings[0].confidence).toBe('high');
  });

  it('an unknown block_on cannot disable the gate', () => {
    expect(shouldBlock('critical', 'severe')).toBe(true);
    expect(shouldBlock('high', 'HIGH')).toBe(true);
    expect(validateBlockOn('severe')).toBe('high');
  });

  it('fails closed when the config sets an invalid block_on', () => {
    const fs = require('fs');
    const p = '/tmp/sg-bad-blockon.yml';
    fs.writeFileSync(p, 'policy:\n  block_on: severe\n');
    try {
      const cfg = loadConfig(p);
      expect(cfg.policy.block_on).toBe('high');
      expect(shouldBlock('critical', cfg.policy.block_on)).toBe(true);
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('does not report a passing check when no scan ran', async () => {
    const r = await createCheckRun('t', 'o', 'r', 's', [], 'failed', 'high', false, 'note', 'failure');
    expect(r.conclusion).toBe('failure');
    expect(mockCreate.mock.calls[0][0].conclusion).toBe('failure');
  });
});
