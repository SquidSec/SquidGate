import { extractJson, extractBalancedObject, normalizeResponse } from '../src/llm';

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
