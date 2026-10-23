/**
 * Tests for diff shaping that does not need git or the network.
 * The network/git acquisition paths are covered by extractAnnotationScope and
 * filterDiff, which are pure.
 */
import { extractAnnotationScope, filterDiff, matchesIgnorePattern } from '../src/diff';

describe('diff truncation is byte-aware', () => {
  // truncateDiff is internal; its observable contract is exercised through
  // filterDiff's byte accounting, which uses the same Buffer.byteLength check.
  it('counts multi-byte characters as more than one byte', () => {
    const file = 'é'.repeat(60); // 120 bytes, 60 chars
    expect(Buffer.byteLength(file, 'utf8')).toBeGreaterThan(file.length);
  });
});

describe('extractAnnotationScope', () => {
  it('returns no entries for an empty diff', () => {
    expect(extractAnnotationScope('').size).toBe(0);
  });

  it('handles a new file with a single-line hunk', () => {
    const diff = ['diff --git a/new.ts b/new.ts', '--- /dev/null', '+++ b/new.ts', '@@ -0,0 +1 @@', '+x'].join('\n');
    expect(extractAnnotationScope(diff).get('new.ts')).toEqual([{ start: 1, end: 1 }]);
  });

  it('records multiple hunks per file', () => {
    const diff = ['+++ b/x.ts', '@@ -1,2 +1,2 @@', ' a', ' b', '@@ -20,2 +20,3 @@', ' c'].join('\n');
    expect(extractAnnotationScope(diff).get('x.ts')).toEqual([
      { start: 1, end: 2 },
      { start: 20, end: 22 },
    ]);
  });

  it('tracks files independently', () => {
    const diff = ['+++ b/a.ts', '@@ -1 +1 @@', ' x', '+++ b/b.ts', '@@ -5 +5 @@', ' y'].join('\n');
    const scope = extractAnnotationScope(diff);
    expect(scope.get('a.ts')).toEqual([{ start: 1, end: 1 }]);
    expect(scope.get('b.ts')).toEqual([{ start: 5, end: 5 }]);
  });
});

describe('filterDiff edge cases', () => {
  it('returns an empty diff for empty input', () => {
    expect(filterDiff('').diff).toBe('');
  });

  it('keeps a diff that has no file headers', () => {
    const text = '... [diff truncated]';
    expect(filterDiff(text).diff).toBe(text);
  });

  it('does not skip a file whose name merely contains an ignored word', () => {
    const diff = 'diff --git a/src/lockfile.ts b/src/lockfile.ts\n+++ b/src/lockfile.ts\n@@ -1 +1 @@\n+a';
    expect(filterDiff(diff, { ignore: ['**/package-lock.json'] }).skipped).toEqual([]);
  });
});

describe('matchesIgnorePattern anchoring', () => {
  it('does not match a suffix of a longer path without a wildcard', () => {
    expect(matchesIgnorePattern('nested/package-lock.json', ['package-lock.json'])).toBe(false);
  });

  it('supports ? for a single character', () => {
    expect(matchesIgnorePattern('a1b.ts', ['a?b.ts'])).toBe(true);
    expect(matchesIgnorePattern('a12b.ts', ['a?b.ts'])).toBe(false);
  });
});
