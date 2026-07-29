import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { exec } from '@actions/exec';

export interface DiffResult {
  diff: string;
  truncated: boolean;
  source: 'api' | 'git';
  originalBytes: number;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

async function captureExec(cmd: string, args: string[]): Promise<{ exit: number; stdout: string }> {
  let stdout = '';
  const exit = await exec(cmd, args, {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
    silent: true,
    ignoreReturnCode: true,
  });
  return { exit, stdout };
}

function truncateDiff(diff: string, maxBytes: number): { diff: string; truncated: boolean; originalBytes: number } {
  const originalBytes = Buffer.byteLength(diff, 'utf8');
  if (originalBytes <= maxBytes) {
    return { diff, truncated: false, originalBytes };
  }
  // Prefer character cut near maxBytes (byte-aware enough for ASCII-heavy diffs)
  const cut = diff.substring(0, maxBytes);
  const msg =
    `\n... [diff truncated: ${originalBytes} bytes → ${maxBytes} byte limit; ` +
    `raise context.max_diff_bytes if needed]\n`;
  return { diff: cut + msg, truncated: true, originalBytes };
}

/**
 * Prefer GitHub API diff (reliable for forks / shallow clones).
 * Fall back to local git with merge-base and multiple base candidates.
 */
export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxBytes: number,
  linesBefore: number = 30,
  linesAfter: number = 30
): Promise<DiffResult> {
  // API-first: works for fork PRs and does not depend on local fetch depth.
  try {
    const result = await getDiffViaApi(token, owner, repo, pullNumber, maxBytes);
    if (result.diff.trim()) {
      if (result.truncated) {
        core.warning(
          `Diff truncated to ${maxBytes} bytes (original ~${result.originalBytes} bytes). ` +
            `Security analysis may miss findings outside the kept window.`
        );
      }
      return result;
    }
    core.warning('GitHub API returned empty diff; trying local git');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    core.warning(`GitHub API diff failed (${msg}); falling back to local git`);
  }

  if (!fs.existsSync('.git')) {
    throw new Error('No PR diff available (API failed and no local .git)');
  }

  const result = await getDiffViaGit(maxBytes, linesBefore, linesAfter);
  if (result.truncated) {
    core.warning(
      `Diff truncated to ${maxBytes} bytes (original ~${result.originalBytes} bytes). ` +
        `Security analysis may miss findings outside the kept window.`
    );
  }
  return result;
}

async function getDiffViaApi(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxBytes: number
): Promise<DiffResult> {
  const octokit = github.getOctokit(token);
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: 'diff' },
  });

  const raw = String(response.data);
  const { diff, truncated, originalBytes } = truncateDiff(raw, maxBytes);
  return { diff, truncated, source: 'api', originalBytes };
}

async function getDiffViaGit(
  maxBytes: number,
  linesBefore: number,
  linesAfter: number
): Promise<DiffResult> {
  const baseRef = process.env.GITHUB_BASE_REF;
  const headSha = process.env.GITHUB_SHA || 'HEAD';
  // git --unified is symmetric; honor the larger of before/after.
  const contextLines = Math.max(1, linesBefore || 0, linesAfter || 0);

  if (baseRef) {
    try {
      await exec('git', ['fetch', 'origin', baseRef, '--depth=100'], { silent: true, ignoreReturnCode: true });
    } catch {
      /* best effort */
    }
    // Also try fetching the PR merge base refs GitHub Actions often provides
    try {
      await exec('git', ['fetch', 'origin', `pull/${process.env.GITHUB_REF_NAME || ''}`, '--depth=100'], {
        silent: true,
        ignoreReturnCode: true,
      });
    } catch {
      /* best effort */
    }
  }

  const candidates: string[] = [];
  if (baseRef) {
    candidates.push(`origin/${baseRef}`);
    candidates.push(baseRef);
  }
  // merge-base against origin/base when available
  if (baseRef) {
    const mb = await captureExec('git', ['merge-base', `origin/${baseRef}`, headSha]);
    if (mb.exit === 0 && mb.stdout.trim()) {
      candidates.unshift(mb.stdout.trim());
    }
  }
  candidates.push('HEAD^');

  let lastError = 'no candidates produced diff';
  for (const base of candidates) {
    // Three-dot: changes on head since merge-base with base
    for (const range of [`${base}...${headSha}`, `${base}..${headSha}`]) {
      const { exit, stdout } = await captureExec('git', ['diff', `--unified=${contextLines}`, range]);
      if ((exit === 0 || stdout.trim()) && stdout.trim()) {
        const { diff, truncated, originalBytes } = truncateDiff(stdout, maxBytes);
        return { diff, truncated, source: 'git', originalBytes };
      }
      lastError = `git diff ${range} exit=${exit}`;
    }
  }

  // Last resort: single commit
  const fallback = await captureExec('git', ['diff', `--unified=${contextLines}`, 'HEAD^..HEAD']);
  if (fallback.stdout.trim()) {
    const { diff, truncated, originalBytes } = truncateDiff(fallback.stdout, maxBytes);
    return { diff, truncated, source: 'git', originalBytes };
  }

  throw new Error(`git diff produced no output (${lastError})`);
}

export async function getChangedFiles(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxFiles: number
): Promise<ChangedFile[]> {
  try {
    const octokit = github.getOctokit(token);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: Math.min(maxFiles, 100),
    });
    return files.slice(0, maxFiles).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    core.warning(`listFiles via API failed (${msg}), falling back to git`);
    return getChangedFilesViaGit(maxFiles);
  }
}

async function getChangedFilesViaGit(maxFiles: number): Promise<ChangedFile[]> {
  const baseRef = process.env.GITHUB_BASE_REF;
  const headSha = process.env.GITHUB_SHA || 'HEAD';
  const ranges = baseRef
    ? [`origin/${baseRef}...${headSha}`, 'HEAD^..HEAD']
    : ['HEAD^..HEAD'];

  for (const range of ranges) {
    const { stdout } = await captureExec('git', ['diff', '--name-status', range]);
    const lines = stdout.trim().split('\n').filter(Boolean).slice(0, maxFiles);
    if (lines.length === 0) continue;
    return lines.map((line) => {
      const [status, ...rest] = line.split('\t');
      const file = rest.join('\t');
      return { filename: file, status: status || 'M', additions: 0, deletions: 0 };
    });
  }
  return [];
}
