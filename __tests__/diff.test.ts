import { extractBalancedObject } from '../src/llm';

// Diff helpers that don't need git/network — truncation is internal.
// We re-export behavior via a thin pure test of size messaging patterns used by diff.ts

describe('diff helpers (pure)', () => {
  it('balanced JSON extract used when model wraps objects', () => {
    const noisy = 'Sure!\n{"findings":[],"summary":"ok"}\n';
    const obj = extractBalancedObject(noisy);
    expect(JSON.parse(obj!).summary).toBe('ok');
  });
});
