import * as core from '@actions/core';
import {
  extractJson,
  extractBalancedObject,
  normalizeResponse,
  callLlm,
  formatOpenCodeGoSessionId,
  resolveOpenCodeGoSessionId,
  resolveOpenCodeGoRequestModel,
  OPENCODE_GO_CHAT_COMPLETIONS_URL,
  OPENCODE_GO_USER_AGENT,
} from '../src/llm';

describe('llm response parsing', () => {
  it('normalizes good response', () => {
    const input = {
      findings: [{ file: 'a.js', start_line: 10, end_line: 12, severity: 'high', title: 't', description: 'd', cwe: 'CWE-79', owasp: null, recommendation: 'r', confidence: 'high' }],
      summary: 'Bad things found'
    };
    const out = normalizeResponse(input);
    expect(out.findings.length).toBe(1);
    expect(out.summary).toBe('Bad things found');
  });

  it('handles missing fields gracefully', () => {
    const out = normalizeResponse({});
    expect(out.findings).toEqual([]);
    expect(out.summary).toBe('');
  });

  it('extracts clean JSON', () => {
    const text = '{"findings":[],"summary":"ok"}';
    const out = extractJson(text);
    expect(out.summary).toBe('ok');
  });

  it('extracts JSON from noisy LLM output with explanation', () => {
    const text = 'Here is my analysis:\n\n```json\n{"findings": [{"file":"x.py","start_line":5,"end_line":5,"severity":"medium","title":"Hardcoded secret","description":"...","cwe":"CWE-798","owasp":null,"recommendation":"Use env vars","confidence":"high"}],"summary":"Found one issue."}\n```\nThat is all.';
    const out = extractJson(text);
    expect(out.findings.length).toBe(1);
    expect(out.findings[0].title).toContain('Hardcoded secret');
    expect(out.summary).toBe('Found one issue.');
  });

  it('falls back to empty on garbage', () => {
    const out = extractJson('sorry, I cannot do that as an AI');
    expect(out.findings).toEqual([]);
    expect(out.summary).toMatch(/could not be parsed/);
    expect(out.parse_error).toBeTruthy();
  });

  it('extracts from plain object even with surrounding text', () => {
    const text = 'Some text before {"findings": [], "summary": "clean"} and after';
    const out = extractJson(text);
    expect(out.summary).toBe('clean');
  });

  it('extractBalancedObject handles nested braces in strings', () => {
    const text = 'prefix {"findings":[{"description":"uses {braces} ok"}],"summary":"s"} trailing';
    const obj = extractBalancedObject(text);
    expect(obj).not.toBeNull();
    const parsed = JSON.parse(obj!);
    expect(parsed.findings[0].description).toContain('{braces}');
  });
});

describe('formatOpenCodeGoSessionId', () => {
  it('joins run id and attempt', () => {
    expect(formatOpenCodeGoSessionId('1842', '3')).toBe('squidgate-1842-3');
    expect(formatOpenCodeGoSessionId(1842, 3)).toBe('squidgate-1842-3');
  });

  it('uses a non-empty fallback when both values are missing', () => {
    expect(formatOpenCodeGoSessionId()).toBe('squidgate-local');
    expect(formatOpenCodeGoSessionId(undefined, undefined)).toBe('squidgate-local');
    expect(formatOpenCodeGoSessionId(null, null)).toBe('squidgate-local');
    expect(formatOpenCodeGoSessionId('', '  ')).toBe('squidgate-local');
    expect(formatOpenCodeGoSessionId(Number.NaN, Number.NaN)).toBe('squidgate-local');
  });

  it('keeps a single present value', () => {
    expect(formatOpenCodeGoSessionId('1842', undefined)).toBe('squidgate-1842');
    expect(formatOpenCodeGoSessionId(undefined, '2')).toBe('squidgate-2');
  });

  it('rejects header-invalid run values instead of forwarding them', () => {
    expect(formatOpenCodeGoSessionId('1\r\nX-Injected: yes', '2')).toBe('squidgate-2');
    expect(formatOpenCodeGoSessionId('bad id', 'also bad')).toBe('squidgate-local');
    expect(formatOpenCodeGoSessionId('squidgate\nlocal', '')).toBe('squidgate-local');
  });

  it('does not read the environment', () => {
    const previous = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = '999';
    try {
      expect(formatOpenCodeGoSessionId()).toBe('squidgate-local');
    } finally {
      if (previous === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = previous;
    }
  });
});

describe('resolveOpenCodeGoSessionId', () => {
  const previousId = process.env.GITHUB_RUN_ID;
  const previousAttempt = process.env.GITHUB_RUN_ATTEMPT;

  afterEach(() => {
    if (previousId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousId;
    if (previousAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
    else process.env.GITHUB_RUN_ATTEMPT = previousAttempt;
  });

  it('prefers explicit run values over the environment', () => {
    process.env.GITHUB_RUN_ID = '1';
    process.env.GITHUB_RUN_ATTEMPT = '9';
    expect(resolveOpenCodeGoSessionId({ runId: '42', runAttempt: '2' })).toBe('squidgate-42-2');
  });

  it('falls back to GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT', () => {
    process.env.GITHUB_RUN_ID = '77';
    process.env.GITHUB_RUN_ATTEMPT = '4';
    expect(resolveOpenCodeGoSessionId()).toBe('squidgate-77-4');
    expect(resolveOpenCodeGoSessionId({ runId: Number.NaN })).toBe('squidgate-77-4');
  });

  it('falls back to squidgate-local when nothing is set', () => {
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ATTEMPT;
    expect(resolveOpenCodeGoSessionId()).toBe('squidgate-local');
  });
});

describe('callLlm HTTP requests', () => {
  const originalFetch = global.fetch;
  const apiKey = 'sk-test-not-a-real-key';
  let fetchMock: jest.Mock;

  function chatResponse(): Response {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"findings":[],"summary":"ok"}' } }],
      }),
      text: async () => '',
    } as unknown as Response;
  }

  function headerNames(headers: Record<string, string>): string[] {
    return Object.keys(headers).map((name) => name.toLowerCase());
  }

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(chatResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(core, 'warning').mockImplementation(() => undefined);
    jest.spyOn(core, 'info').mockImplementation(() => undefined);
    jest.spyOn(core, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('posts the unchanged chat-completions body to OpenCode Go', async () => {
    const result = await callLlm(
      'opencode-go',
      'glm-5.3-flash',
      apiKey,
      'system prompt',
      'user prompt',
      undefined,
      { runId: '1842', runAttempt: '3' }
    );

    expect(result.summary).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(OPENCODE_GO_CHAT_COMPLETIONS_URL);
    expect(url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toBe('SquidGate/1.0');
    expect(headers['User-Agent']).toBe(OPENCODE_GO_USER_AGENT);
    expect(headers['x-opencode-session']).toBe('squidgate-1842-3');
    expect(headers['x-opencode-session']).toBe(formatOpenCodeGoSessionId('1842', '3'));
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'glm-5.3-flash',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const logged = [core.warning, core.info, core.error]
      .flatMap((fn) => (fn as unknown as jest.Mock).mock.calls)
      .flat()
      .join('\n');
    expect(logged).not.toContain(apiKey);
  });

  it('does not send gpt-4o to OpenCode Go', async () => {
    expect(resolveOpenCodeGoRequestModel('gpt-4o')).toBe('glm-5.3-flash');
    expect(resolveOpenCodeGoRequestModel('')).toBe('glm-5.3-flash');
    expect(resolveOpenCodeGoRequestModel('kimi-k3')).toBe('kimi-k3');

    await callLlm('opencode-go', 'gpt-4o', apiKey, 's', 'u', undefined, {
      runId: '1',
      runAttempt: '1',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe('glm-5.3-flash');
    expect(JSON.parse(String(init.body)).temperature).toBe(0);
    expect(JSON.parse(String(init.body)).max_tokens).toBe(4000);
  });

  it('ignores llm-base-url for opencode-go and does not log the key', async () => {
    await callLlm(
      'opencode-go',
      'glm-5.3-flash',
      apiKey,
      's',
      'u',
      'https://example.invalid/v1?key=sk-test-not-a-real-key',
      { runId: '9', runAttempt: '1' }
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect(core.warning).toHaveBeenCalled();
    const warning = String((core.warning as unknown as jest.Mock).mock.calls[0][0]);
    expect(warning).toMatch(/ignored/);
    expect(warning).not.toContain(apiKey);
    expect(warning).not.toContain('example.invalid');
  });

  it('does not add Go headers to openai or custom requests', async () => {
    await callLlm('openai', 'gpt-4o', apiKey, 'system prompt', 'user prompt', undefined, {
      runId: '1842',
      runAttempt: '3',
    });
    await callLlm(
      'custom',
      'grok-build-0.1',
      apiKey,
      'system prompt',
      'user prompt',
      'https://api.x.ai/v1',
      { runId: '1842', runAttempt: '3' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [openaiUrl, openaiInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const openaiHeaders = openaiInit.headers as Record<string, string>;
    expect(openaiUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiHeaders.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headerNames(openaiHeaders)).not.toContain('user-agent');
    expect(headerNames(openaiHeaders)).not.toContain('x-opencode-session');
    expect(JSON.parse(String(openaiInit.body))).toEqual({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const [customUrl, customInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const customHeaders = customInit.headers as Record<string, string>;
    expect(customUrl).toBe('https://api.x.ai/v1/chat/completions');
    expect(customHeaders.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headerNames(customHeaders)).not.toContain('user-agent');
    expect(headerNames(customHeaders)).not.toContain('x-opencode-session');
    expect(customHeaders['User-Agent']).toBeUndefined();
    expect(customHeaders['x-opencode-session']).toBeUndefined();
  });
});

describe('request timeout', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('passes an abort signal to fetch', async () => {
    let seen: unknown;
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      seen = init.signal;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"findings":[],"summary":"ok"}' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const { callLlm } = require('../src/llm');
    await callLlm('openai', 'gpt-4o', 'k', 's', 'u');
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it('reports a timeout instead of a raw abort error', async () => {
    global.fetch = jest.fn(async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;

    const { callLlm } = require('../src/llm');
    await expect(callLlm('openai', 'gpt-4o', 'k', 's', 'u')).rejects.toThrow(/timed out after/);
  }, 15000);
});
