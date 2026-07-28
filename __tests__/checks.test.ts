import { createCheckRun, postPrComment } from '../src/checks';
import * as github from '@actions/github';

// We will spy on the octokit methods
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
}));

describe('checks', () => {
  const mockCreate = jest.fn();
  const mockCreateComment = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: {
        checks: { create: mockCreate },
        issues: { createComment: mockCreateComment },
      },
    });
  });

  const sampleFindings = [
    { file: 'src/auth.ts', start_line: 42, end_line: 42, severity: 'high' as const, title: 'Hardcoded key', description: 'API key in source', cwe: 'CWE-798', owasp: null, recommendation: 'Move to env', confidence: 'high' as const },
    { file: 'api/routes.py', start_line: 10, end_line: 15, severity: 'medium' as const, title: 'SQLi risk', description: 'raw query', cwe: 'CWE-89', owasp: 'A03:2021', recommendation: 'Use ORM', confidence: 'medium' as const },
  ];

  it('creates failing check when blocking findings exist', async () => {
    mockCreate.mockResolvedValue({ data: { html_url: 'https://example.com/check' } });

    const result = await createCheckRun('fake', 'owner', 'repo', 'sha123', sampleFindings, 'Summary here', 'high', true);

    expect(result.conclusion).toBe('failure');
    expect(result.blockingCount).toBe(1); // only the high one blocks on 'high'
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'SquidGate',
      head_sha: 'sha123',
      conclusion: 'failure',
    }));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.output.annotations.length).toBe(2);
    expect(callArg.output.annotations[0].annotation_level).toBe('failure');
    expect(callArg.output.annotations[1].annotation_level).toBe('warning');
    expect(callArg.output.title).toContain('blocking');
  });

  it('creates success check when no blocking findings', async () => {
    mockCreate.mockResolvedValue({ data: { html_url: 'https://ex' } });
    const lowFindings = [{ ...sampleFindings[1], severity: 'low' as const }];

    const result = await createCheckRun('t', 'o', 'r', 's', lowFindings, 'ok', 'high', true);

    expect(result.conclusion).toBe('success');
    expect(result.blockingCount).toBe(0);
  });

  it('posts PR comment when findings present', async () => {
    mockCreateComment.mockResolvedValue({});
    await postPrComment('tok', 'ow', 're', 123, sampleFindings, 'Some summary', 1);

    expect(mockCreateComment).toHaveBeenCalled();
    const body = mockCreateComment.mock.calls[0][0].body;
    expect(body).toContain('Security Scan Results');
    expect(body).toContain('Hardcoded key');
    expect(body).toContain('⛔ 1 finding(s) block merge');
  });

  it('does not post comment if no findings', async () => {
    await postPrComment('t', 'o', 'r', 1, [], 'none', 0);
    expect(mockCreateComment).not.toHaveBeenCalled();
  });
});
