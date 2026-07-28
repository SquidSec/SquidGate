import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { exec } from '@actions/exec';

import {
  DEFAULT_CONFIG,
  loadConfig,
  filterFindings,
} from './config';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { callLlm } from './llm';
import type { LlmResponse } from './types';
import { createCheckRun, postPrComment } from './checks';

async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxBytes: number,
  contextLines: number = 30
): Promise<string> {
  if (fs.existsSync('.git')) {
    try {
      return await getDiffViaGit(maxBytes, contextLines);
    } catch (e: any) {
      core.warning(`Local git diff failed (${e.message}), falling back to GitHub API`);
    }
  }

  const octokit = github.getOctokit(token);
  try {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: 'diff' },
    });

    let diff = String(response.data);
    if (diff.length > maxBytes) {
      diff = diff.substring(0, maxBytes) + '\n... [diff truncated]';
      core.warning(`Diff truncated to ${maxBytes} bytes`);
    }
    return diff;
  } catch (error: any) {
    core.warning(`Failed to fetch diff via GitHub API: ${error.message}`);
    throw error;
  }
}

async function getDiffViaGit(maxBytes: number, contextLines: number = 30): Promise<string> {
  const baseRef = process.env.GITHUB_BASE_REF;
  const headSha = process.env.GITHUB_SHA || 'HEAD';

  let base = 'HEAD^';
  if (baseRef) {
    base = `origin/${baseRef}`;
    try {
      await exec('git', ['fetch', 'origin', baseRef, '--depth=100'], { silent: true });
    } catch {}
  }

  let diff = '';
  const options: any = {
    listeners: { stdout: (data: Buffer) => { diff += data.toString(); } },
    silent: true,
    ignoreReturnCode: true,
  };

  let exit = await exec('git', ['diff', `--unified=${contextLines}`, `${base}...${headSha}`], options);
  if (exit !== 0 && !diff) {
    await exec('git', ['diff', `--unified=${contextLines}`, 'HEAD^..HEAD'], options);
  }

  if (diff.length > maxBytes) {
    diff = diff.substring(0, maxBytes) + '\n... [diff truncated]';
  }
  if (!diff.trim()) {
    throw new Error('git diff produced no output');
  }
  return diff;
}

async function getChangedFiles(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  maxFiles: number
): Promise<Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>> {
  try {
    const octokit = github.getOctokit(token);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: maxFiles,
    });
    return files.slice(0, maxFiles);
  } catch (e) {
    core.warning('listFiles via API failed, falling back to git');
    return await getChangedFilesViaGit(maxFiles);
  }
}

async function getChangedFilesViaGit(maxFiles: number) {
  let out = '';
  const opts: any = { listeners: { stdout: (d: Buffer) => { out += d.toString(); } }, silent: true, ignoreReturnCode: true };
  await exec('git', ['diff', '--name-status', 'HEAD^..HEAD'], opts);
  const lines = out.trim().split('\n').filter(Boolean).slice(0, maxFiles);
  return lines.map(line => {
    const [status, ...rest] = line.split('\t');
    const file = rest.join('\t');
    return { filename: file, status: status || 'M', additions: 0, deletions: 0 };
  });
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const apiKey = core.getInput('llm-api-key', { required: true });

    const configPath = core.getInput('config-path') || '.github/security-scan.yml';
    const overrideProvider = core.getInput('llm-provider');
    const overrideModel = core.getInput('llm-model');
    const overrideBlockOn = core.getInput('block-on') as any;
    const baseUrl = core.getInput('llm-base-url') || undefined;

    const context = github.context;
    const { owner, repo } = context.repo;

    if (!context.payload.pull_request) {
      core.warning('This action is designed to run on pull_request events. Skipping.');
      return;
    }

    const pullNumber = context.payload.pull_request.number;
    const headSha = context.payload.pull_request.head.sha;

    core.info(`Analyzing PR #${pullNumber} @ ${headSha}`);

    const overrides: any = {};
    if (overrideProvider || overrideModel) {
      overrides.llm = {
        provider: overrideProvider || DEFAULT_CONFIG.llm.provider,
        model: overrideModel || DEFAULT_CONFIG.llm.model,
      };
    }
    if (overrideBlockOn) {
      overrides.policy = { block_on: overrideBlockOn };
    }

    const config = loadConfig(configPath, overrides);

    core.info(`Using provider=${config.llm.provider} model=${config.llm.model} block_on=${config.policy.block_on}`);

    const diff = await getPullRequestDiff(
      token,
      owner,
      repo,
      pullNumber,
      config.context.max_diff_bytes,
      config.context.lines_before
    );
    const changedFiles = await getChangedFiles(token, owner, repo, pullNumber, config.context.max_files);

    core.info(`Diff size: ${diff.length} bytes, ${changedFiles.length} files`);

    const systemPrompt = buildSystemPrompt(config);
    const userPrompt = buildUserPrompt(diff, changedFiles, config);

    core.info('Calling LLM for security analysis...');
    let llmResponse: LlmResponse;
    try {
      llmResponse = await callLlm(
        config.llm.provider,
        config.llm.model,
        apiKey,
        systemPrompt,
        userPrompt,
        baseUrl
      );
    } catch (llmErr: any) {
      core.error(`LLM call failed: ${llmErr.message}`);
      if (config.output.fail_on_error) {
        try {
          await createCheckRun(token, owner, repo, headSha, [], `LLM call failed: ${llmErr.message}`, 'high', false);
        } catch {}
        core.setFailed(`LLM call failed: ${llmErr.message}`);
      } else {
        core.warning('fail_on_error is false, marking neutral.');
      }
      return;
    }

    const filtered = filterFindings(llmResponse.findings, config);
    core.info(`LLM returned ${llmResponse.findings.length} findings, ${filtered.length} after filtering`);

    const { conclusion, blockingCount } = await createCheckRun(
      token,
      owner,
      repo,
      headSha,
      filtered,
      llmResponse.summary,
      config.policy.block_on,
      config.output.annotate_lines
    );

    if (config.output.comment_on_pr) {
      await postPrComment(token, owner, repo, pullNumber, filtered, llmResponse.summary, blockingCount);
    }

    core.setOutput('findings-count', filtered.length.toString());
    core.setOutput('blocking-findings-count', blockingCount.toString());
    core.setOutput('conclusion', conclusion);

    if (conclusion === 'failure') {
      core.setFailed(`${blockingCount} security finding(s) reached or exceeded the block_on severity of '${config.policy.block_on}'`);
    } else {
      core.info('Security scan passed.');
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();

export { loadConfig, filterFindings, shouldBlock } from './config';
export { inferLanguage, buildSystemPrompt, buildUserPrompt } from './prompts';
export { callLlm, extractJson, normalizeResponse } from './llm';
export { createCheckRun, postPrComment } from './checks';
export type { Finding, LlmResponse, SecurityScanConfig } from './types';
