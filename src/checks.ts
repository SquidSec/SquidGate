import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Finding } from './types';
import { CONFIDENCE_ORDER, SEVERITY_ORDER, shouldBlock } from './config';

export type { Finding };

const GH_ATTEMPTS = 3;
const GH_BASE_DELAY_MS = 500;

/** Files and diff line ranges a check annotation may point at. */
export type AnnotationScope = Map<string, Array<{ start: number; end: number }>>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sort most severe first so truncation keeps the findings that matter.
 * Ties break on confidence, then file order for stable output.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sev = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
    if (sev !== 0) return sev;
    const conf = (CONFIDENCE_ORDER[b.confidence] ?? 0) - (CONFIDENCE_ORDER[a.confidence] ?? 0);
    if (conf !== 0) return conf;
    return a.file.localeCompare(b.file) || a.start_line - b.start_line;
  });
}

/**
 * Build annotations GitHub will accept: paths must be part of the PR and
 * lines must fall inside a diff hunk. Invalid entries are dropped rather than
 * failing the whole check run with a 422.
 */
export function buildAnnotations(
  findings: Finding[],
  scope: AnnotationScope | undefined,
  limit = 50
): Array<{ path: string; start_line: number; end_line: number; annotation_level: 'failure' | 'warning' | 'notice'; title: string; message: string }> {
  const out: ReturnType<typeof buildAnnotations> = [];

  for (const f of findings) {
    if (out.length >= limit) break;

    let start = Math.max(1, f.start_line || 1);
    let end = Math.max(start, f.end_line || start);

    if (scope) {
      const ranges = scope.get(f.file);
      if (!ranges) {
        core.info(`Skipping annotation for ${f.file}: file is not part of the diff`);
        continue;
      }
      const inRange = ranges.find((r) => start >= r.start && start <= r.end);
      if (!inRange) {
        const nearest = ranges.reduce(
          (best, r) => (Math.abs(r.start - start) < Math.abs(best.start - start) ? r : best),
          ranges[0]
        );
        if (!nearest) {
          core.info(`Skipping annotation for ${f.file}: no diff hunks`);
          continue;
        }
        start = nearest.start;
        end = nearest.end;
      } else {
        end = Math.min(end, inRange.end);
        start = Math.max(start, inRange.start);
      }
    }

    out.push({
      path: f.file,
      start_line: start,
      end_line: end,
      annotation_level:
        f.severity === 'critical' || f.severity === 'high'
          ? 'failure'
          : f.severity === 'medium'
            ? 'warning'
            : 'notice',
      title: f.title,
      message: `${f.severity.toUpperCase()} [${f.confidence}] ${f.description}\n\nRecommendation: ${f.recommendation}${f.cwe ? `\nCWE: ${f.cwe}` : ''}${f.owasp ? `\nOWASP: ${f.owasp}` : ''}${f.category ? `\nCategory: ${f.category}` : ''}`,
    });
  }

  return out;
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
      // 4xx responses are deterministic; retrying only delays the failure.
      const status = (e as { status?: number }).status;
      if (status !== undefined && status >= 400 && status < 500) throw e;
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
  extraSummaryNote?: string,
  /** Overrides the findings-derived conclusion. Used when no scan ran. */
  forcedConclusion?: 'success' | 'failure' | 'neutral',
  /** When provided, annotations are clamped to files and lines in the diff. */
  annotationScope?: AnnotationScope
): Promise<{ conclusion: string; blockingCount: number }> {
  const client = getClient(token);

  const blockingFindings = findings.filter((f) => shouldBlock(f.severity, blockOn));
  const blockingCount = blockingFindings.length;
  const conclusion =
    forcedConclusion ?? (blockingCount > 0 ? 'failure' : 'success');

  const ordered = sortFindings(findings);
  const annotations = annotate ? buildAnnotations(ordered, annotationScope, 50) : [];

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

  const create = (withAnnotations: boolean) =>
    client.rest.checks.create({
      owner,
      repo,
      name: 'SquidGate',
      head_sha: headSha,
      status: 'completed',
      conclusion: conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required',
      output: {
        title,
        summary: withAnnotations
          ? fullSummary
          : `${fullSummary}\n\n_Annotations omitted: GitHub rejected the requested positions._`,
        annotations: withAnnotations ? annotations : [],
      },
    });

  let check: Awaited<ReturnType<typeof create>>;
  try {
    // Annotations are a presentation detail; a rejection must not cost the
    // check run, which is what branch protection depends on.
    check = await withRetry('GitHub checks.create', () => create(true));
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (annotations.length === 0 || (status !== 422 && status !== 400)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    core.warning(`Annotation positions rejected (${msg}); creating the check run without annotations.`);
    check = await withRetry('GitHub checks.create (no annotations)', () => create(false));
  }

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

  const ordered = sortFindings(findings);
  const shown = ordered.slice(0, 20);
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
