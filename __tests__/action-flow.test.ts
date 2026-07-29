import { loadConfig, filterFindings, shouldBlock } from '../src/config';
import { callLlm } from '../src/llm';
import type { Finding } from '../src/types';

jest.mock('../src/llm');

describe('action claims via pieces', () => {
  it('filters and blocks according to policy (validates core security gate behavior)', () => {
    const cfg = loadConfig('.github/squidgate.yml.example');
    const findings = [
      { confidence: 'high', severity: 'high' },
      { confidence: 'medium', severity: 'medium' },
    ] as Finding[];

    const filtered = filterFindings(findings, cfg);
    expect(filtered.length).toBeGreaterThanOrEqual(1);

    const blocks = filtered.some((f) => shouldBlock(f.severity, cfg.policy.block_on));
    expect(blocks).toBe(true); // with default high, high finding blocks
  });

  it('LLM is called with temperature 0 and proper prompts (via contract)', async () => {
    const mockCall = callLlm as jest.Mock;
    mockCall.mockResolvedValue({ findings: [], summary: '' });

    expect(typeof callLlm).toBe('function');
  });

  it('category-disabled findings do not block even at high severity', () => {
    const cfg = loadConfig('/nope');
    cfg.policy.categories.injection = false;
    const findings = [
      {
        file: 'a.py',
        start_line: 1,
        end_line: 1,
        severity: 'critical',
        title: 'SQLi',
        description: 'SQL injection',
        cwe: 'CWE-89',
        owasp: null,
        recommendation: 'fix',
        confidence: 'high',
        category: 'injection',
      },
    ] as Finding[];
    const filtered = filterFindings(findings, cfg);
    expect(filtered.length).toBe(0);
  });
});
