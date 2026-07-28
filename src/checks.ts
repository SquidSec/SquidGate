import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Finding } from './types';

export type { Finding };

export async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  headSha: string,
  findings: Finding[],
  summary: string,
  blockOn: string,
  annotate: boolean
): Promise<{ conclusion: string; blockingCount: number }> {
  const octokit = github.getOctokit(token);

  const blockingFindings = findings.filter(f => {
    const order: any = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return (order[f.severity] || 0) >= (order[blockOn] || 0);
  });
  const blockingCount = blockingFindings.length;
  const conclusion = blockingCount > 0 ? 'failure' : 'success';

  const annotations = annotate
    ? findings.slice(0, 50).map(f => ({
        path: f.file,
        start_line: Math.max(1, f.start_line),
        end_line: Math.max(f.start_line, f.end_line),
        annotation_level: (f.severity === 'critical' || f.severity === 'high' ? 'failure' : f.severity === 'medium' ? 'warning' : 'notice') as 'failure' | 'warning' | 'notice',
        title: f.title,
        message: `${f.severity.toUpperCase()} [${f.confidence}] ${f.description}\n\nRecommendation: ${f.recommendation}${f.cwe ? `\nCWE: ${f.cwe}` : ''}${f.owasp ? `\nOWASP: ${f.owasp}` : ''}`,
      }))
    : [];

  const title = blockingCount > 0
    ? `${blockingCount} blocking security finding(s)`
    : findings.length > 0
    ? `${findings.length} security finding(s) (below threshold)`
    : 'No security issues found';

  const checkOutput = {
    title,
    summary: summary + (blockingCount > 0 ? `\n\n**${blockingCount} finding(s) meet or exceed block threshold (${blockOn}).**` : ''),
    annotations,
  };

  const check = await octokit.rest.checks.create({
    owner,
    repo,
    name: 'security-scan',
    head_sha: headSha,
    status: 'completed',
    conclusion: conclusion as any,
    output: checkOutput,
  });

  core.info(`Check run created: ${check.data.html_url}`);

  return { conclusion, blockingCount };
}

export async function postPrComment(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  findings: Finding[],
  summary: string,
  blockingCount: number
): Promise<void> {
  if (findings.length === 0) return;

  const octokit = github.getOctokit(token);

  let body = `## 🛡️ Security Scan Results\n\n${summary}\n\n`;

  if (blockingCount > 0) {
    body += `**⛔ ${blockingCount} finding(s) block merge.**\n\n`;
  }

  const shown = findings.slice(0, 20);
  for (const f of shown) {
    const sev = f.severity.toUpperCase();
    body += `### ${sev} — ${f.title}\n`;
    body += `**File:** \`${f.file}:${f.start_line}\`  |  **Confidence:** ${f.confidence}\n\n`;
    body += `${f.description}\n\n`;
    if (f.cwe || f.owasp) {
      body += `CWE: ${f.cwe || 'N/A'} | OWASP: ${f.owasp || 'N/A'}\n\n`;
    }
    body += `**Recommendation:** ${f.recommendation}\n\n---\n`;
  }

  if (findings.length > shown.length) {
    body += `\n... and ${findings.length - shown.length} more findings. See check annotations for details.`;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
}
