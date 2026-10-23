import { filterDiff, matchesIgnorePattern } from '../src/diff';
import { postPrComment } from '../src/checks';
import * as github from '@actions/github';
import type { Finding } from '../src/types';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

describe('matchesIgnorePattern', () => {
  it.each([
    ['package-lock.json', '**/package-lock.json', true],
    ['web/package-lock.json', '**/package-lock.json', true],
    ['web/package-lock.json', 'package-lock.json', false],
    ['dist/bundle.js', '**/dist/**', true],
    ['a/b/dist/c.js', '**/dist/**', true],
    ['src/app.ts', '**/dist/**', false],
    ['app.min.js', '**/*.min.js', true],
    ['src/app.js', '**/*.min.js', false],
  ])('%s vs %s', (file, pattern, expected) => {
    expect(matchesIgnorePattern(file, [pattern])).toBe(expected);
  });

  it('treats regex characters in patterns literally', () => {
    expect(matchesIgnorePattern('a(b).ts', ['a(b).ts'])).toBe(true);
    expect(matchesIgnorePattern('ab.ts', ['a(b).ts'])).toBe(false);
  });

  it('ignores empty and malformed patterns', () => {
    expect(matchesIgnorePattern('a.ts', [''])).toBe(false);
  });
});

describe('filterDiff', () => {
  const diff = [
    'diff --git a/package-lock.json b/package-lock.json',
    '+++ b/package-lock.json',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git a/src/app.ts b/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');

  it('removes ignored files and reports them', () => {
    const out = filterDiff(diff, { ignore: ['**/package-lock.json'] });
    expect(out.skipped).toEqual(['package-lock.json']);
    expect(out.diff).toContain('src/app.ts');
    expect(out.diff).not.toContain('package-lock.json');
  });

  it('keeps everything when nothing matches', () => {
    const out = filterDiff(diff, { ignore: [] });
    expect(out.skipped).toEqual([]);
    expect(out.diff).toContain('package-lock.json');
    expect(out.diff).toContain('src/app.ts');
  });

  it('drops files over the size limit', () => {
    const out = filterDiff(diff, { maxFileBytes: 50 });
    expect(out.skipped).toContain('package-lock.json');
  });

  it('preserves the truncation notice', () => {
    const withNotice = `diff --git a/x.ts b/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+a\n... [diff truncated: 1 bytes]`;
    expect(filterDiff(withNotice, { ignore: ['**/nope/**'] }).diff).toContain('[diff truncated');
  });
});

describe('PR comment de-duplication', () => {
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockList = jest.fn();

  const finding: Finding = {
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    severity: 'high',
    title: 'Issue',
    description: 'd',
    cwe: null,
    owasp: null,
    recommendation: 'r',
    confidence: 'high',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: {
        issues: { createComment: mockCreate, updateComment: mockUpdate, listComments: mockList },
        checks: { create: jest.fn() },
      },
    });
    mockCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  it('updates an existing SquidGate comment instead of adding another', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 42, body: '<!-- squidgate:scan -->\nold', html_url: 'https://c' }],
    });

    await postPrComment('t', 'o', 'r', 1, [finding], 'summary', 1);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][0].comment_id).toBe(42);
  });

  it('creates a comment when none exists yet', async () => {
    mockList.mockResolvedValue({ data: [{ id: 7, body: 'unrelated' }] });
    await postPrComment('t', 'o', 'r', 1, [finding], 'summary', 1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].body).toContain('<!-- squidgate:scan -->');
  });

  it('does not comment when there are no findings', async () => {
    await postPrComment('t', 'o', 'r', 1, [], 'none', 0);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips the lookup when upsert is disabled', async () => {
    await postPrComment('t', 'o', 'r', 1, [finding], 's', 1, { upsert: false });
    expect(mockList).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
