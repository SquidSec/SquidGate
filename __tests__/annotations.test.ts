import { extractAnnotationScope } from '../src/diff';
import { buildAnnotations, createCheckRun, sortFindings } from '../src/checks';
import * as github from '@actions/github';
import type { Finding } from '../src/types';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,5 @@',
  ' x',
  '+y',
  '+z',
  '@@ -10,2 +12,3 @@',
  ' a',
  '+b',
  'diff --git a/gone.ts b/gone.ts',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
].join('\n');

function finding(over: Partial<Finding> = {}): Finding {
  return {
    file: 'src/a.ts',
    start_line: 2,
    end_line: 2,
    severity: 'high',
    title: 'Issue',
    description: 'd',
    cwe: null,
    owasp: null,
    recommendation: 'r',
    confidence: 'high',
    ...over,
  };
}

describe('extractAnnotationScope', () => {
  it('maps files to the new-file line ranges of their hunks', () => {
    const scope = extractAnnotationScope(DIFF);
    expect(scope.get('src/a.ts')).toEqual([
      { start: 1, end: 5 },
      { start: 12, end: 14 },
    ]);
  });

  it('ignores deleted files', () => {
    expect(extractAnnotationScope(DIFF).has('gone.ts')).toBe(false);
  });

  it('handles hunk headers without a count', () => {
    const scope = extractAnnotationScope('+++ b/x.ts\n@@ -1 +7 @@\n+a\n');
    expect(scope.get('x.ts')).toEqual([{ start: 7, end: 7 }]);
  });
});

describe('buildAnnotations', () => {
  const scope = extractAnnotationScope(DIFF);

  it('drops findings for files outside the diff', () => {
    const out = buildAnnotations([finding({ file: 'other.ts' })], scope);
    expect(out).toEqual([]);
  });

  it('clamps a line outside every hunk to the nearest hunk', () => {
    const out = buildAnnotations([finding({ start_line: 500, end_line: 500 })], scope);
    expect(out[0].start_line).toBe(12);
    expect(out[0].end_line).toBe(14);
  });

  it('clamps an end line to the hunk boundary', () => {
    const out = buildAnnotations([finding({ start_line: 2, end_line: 999 })], scope);
    expect(out[0]).toMatchObject({ start_line: 2, end_line: 5 });
  });

  it('sets annotation level from severity', () => {
    const out = buildAnnotations(
      [
        finding({ severity: 'critical', title: 'c' }),
        finding({ severity: 'medium', title: 'm' }),
        finding({ severity: 'low', title: 'l' }),
      ],
      scope
    );
    expect(out.map((a) => a.annotation_level)).toEqual(['failure', 'warning', 'notice']);
  });

  it('respects the annotation limit', () => {
    const many = Array.from({ length: 80 }, () => finding());
    expect(buildAnnotations(many, scope, 50)).toHaveLength(50);
  });
});

describe('sortFindings', () => {
  it('orders by severity then confidence', () => {
    const sorted = sortFindings([
      finding({ severity: 'low', title: 'low' }),
      finding({ severity: 'critical', title: 'crit-lowconf', confidence: 'low' }),
      finding({ severity: 'critical', title: 'crit-highconf', confidence: 'high' }),
      finding({ severity: 'medium', title: 'med' }),
    ]);
    expect(sorted.map((f) => f.title)).toEqual(['crit-highconf', 'crit-lowconf', 'med', 'low']);
  });

  it('does not mutate its input', () => {
    const input = [finding({ severity: 'low' }), finding({ severity: 'critical' })];
    const copy = [...input];
    sortFindings(input);
    expect(input).toEqual(copy);
  });
});

describe('createCheckRun annotation fallback', () => {
  const mockCreate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { checks: { create: mockCreate }, issues: { createComment: jest.fn() } },
    });
  });

  it('retries without annotations when GitHub rejects positions', async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
      .mockResolvedValue({ data: { html_url: 'https://ok' } });

    const scope = extractAnnotationScope(DIFF);
    const result = await createCheckRun(
      't', 'o', 'r', 'sha', [finding()], 's', 'high', true, undefined, undefined, scope
    );

    expect(result.conclusion).toBe('failure');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1][0].output.annotations).toEqual([]);
    expect(mockCreate.mock.calls[1][0].output.summary).toContain('Annotations omitted');
  });

  it('does not retry client errors that are not about annotations', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(
      createCheckRun('t', 'o', 'r', 'sha', [finding()], 's', 'high', true)
    ).rejects.toThrow('Forbidden');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
