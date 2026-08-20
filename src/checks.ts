import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Finding } from './types';
import { shouldBlock } from './config';

export type { Finding };

const GH_ATTEMPTS = 3;
const GH_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClient(token: string) {
  return github.getOctokit(token, { request: { timeout: 30000 } });
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      if (attempt === GH_ATTEMPTS) break;
      const delay = GH_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const msg = e instanceof Error ? e.message : String(e);
      core.warning(`${label} failed; retry ${attempt}/${GH_ATTEMPTS} in ${delay}ms: ${msg}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  headSha: string,
  findings: Finding[],
  summary: string,
  blockOn: string,
  annotate: boolean,
  extraSummaryNote?: string
): Promise<{ conclusion: string; blockingCount: number }> {
  const client = getClient(token);

  const blockingFindings = findings.filter((f) => shouldBlock(f.severity, blockOn));
  const blockingCount = blockingFindings.length;
  const conclusion = blockingCount > 0 ? 'failure' : 'success';

  const annotations = annotate
    ? findings.slice(0, 50).map((f) => ({
        path: f.file,
        start_line: Math.max(1, f.start_line || 1),
        end_line: Math.max(f.start_line || 1, f.end_line || f.start_line || 1),
        annotation_level: (f.severity === 'critical' || f.severity === 'high'
          ? 'failure'
          : f.severity === 'medium'
            ? 'warning'
            : 'notice') as 'failure' | 'warning' | 'notice',
        title: f.title,
        message: `${f.severity.toUpperCase()} [${f.confidence}] ${f.description}\n\nRecommendation: ${f.recommendation}${f.cwe ? `\nCWE: ${f.cwe}` : ''}${f.owasp ? `\nOWASP: ${f.owasp}` : ''}${f.category ? `\nCategory: ${f.category}` : ''}`,
      }))
    : [];

  const title =
    blockingCount > 0
      ? `${blockingCount} blocking security finding(s)`
      : findings.length > 0
        ? `${findings.length} security finding(s) (below threshold)`
        : 'No security issues found';

  let fullSummary = summary || '';
  if (blockingCount > 0) {
    fullSummary += `\n\n**${blockingCount} finding(s) meet or exceed block threshold (${blockOn}).**`;
  }
  if (extraSummaryNote) {
    fullSummary += `\n\n${extraSummaryNote}`;
  }

  const check = await withRetry('GitHub checks.create', () =>
    client.rest.checks.create({
      owner,
      repo,
      name: 'SquidGate',
      head_sha: headSha,
      status: 'completed',
      conclusion: conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required',
      output: {
        title,
        summary: fullSummary,
        annotations,
      },
    })
  );

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

  const client = getClient(token);

  let body = `## 🛡️ Security Scan Results\n\n${summary}\n\n`;

  if (blockingCount > 0) {
    body += `**⛔ ${blockingCount} finding(s) block merge.**\n\n`;
  }

  const shown = findings.slice(0, 20);
  for (const f of shown) {
    const sev = f.severity.toUpperCase();
    body += `### ${sev} — ${f.title}\n`;
    body += `**File:** \`${f.file}:${f.start_line}\`  |  **Confidence:** ${f.confidence}`;
    if (f.category) body += `  |  **Category:** ${f.category}`;
    body += `\n\n`;
    body += `${f.description}\n\n`;
    if (f.cwe || f.owasp) {
      body += `CWE: ${f.cwe || 'N/A'} | OWASP: ${f.owasp || 'N/A'}\n\n`;
    }
    body += `**Recommendation:** ${f.recommendation}\n\n---\n`;
  }

  if (findings.length > shown.length) {
    body += `\n... and ${findings.length - shown.length} more findings. See check annotations for details.`;
  }

  await withRetry('GitHub issues.createComment', () =>
    client.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    })
  );
}
