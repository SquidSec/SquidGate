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

  it('sends temperature 0 and the JSON response format to the provider', async () => {
    const realFetch = global.fetch;
    let sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null =
      null;
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      sent = {
        url: String(url),
        body: JSON.parse(String(init.body)),
        headers: init.headers as Record<string, string>,
      };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"findings":[],"summary":"ok"}' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const { callLlm: realCall } = jest.requireActual('../src/llm');
      await realCall('openai', 'gpt-4o', 'sk-test', 'system prompt', 'user prompt');

      expect(sent).not.toBeNull();
      expect(sent!.body.temperature).toBe(0);
      expect(sent!.body.response_format).toEqual({ type: 'json_object' });
      expect(sent!.body.model).toBe('gpt-4o');
      expect(sent!.body.messages).toEqual([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ]);
      // The key travels as a bearer header, never in the URL.
      expect(sent!.headers.Authorization).toBe('Bearer sk-test');
      expect(sent!.url).not.toContain('sk-test');
    } finally {
      global.fetch = realFetch;
    }
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
