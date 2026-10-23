import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  loadConfig,
  filterFindings,
  shouldBlock,
  readConfiguredLlm,
  resolveRuntimeLlm,
  type ConfigOverrides,
} from './config';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { callLlm } from './llm';
import type { BlockOn, LlmResponse } from './types';
import { createCheckRun, postPrComment } from './checks';
import { getChangedFiles, getPullRequestDiff } from './diff';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const apiKey = core.getInput('llm-api-key', { required: true });

    const configPath = core.getInput('config-path') || '.github/squidgate.yml';
    const overrideProvider = core.getInput('llm-provider');
    const overrideModel = core.getInput('llm-model');
    const overrideBlockOn = core.getInput('block-on') as BlockOn | '';
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

    const fileLlm = readConfiguredLlm(configPath);
    const runtimeLlm = resolveRuntimeLlm(
      fileLlm.provider,
      fileLlm.model,
      overrideProvider,
      overrideModel
    );
    for (const warning of runtimeLlm.warnings) {
      core.warning(warning);
    }

    const overrides: ConfigOverrides = {
      llm: { provider: runtimeLlm.provider, model: runtimeLlm.model },
    };
    if (overrideBlockOn) {
      overrides.policy = { block_on: overrideBlockOn };
    }

    const config = loadConfig(configPath, overrides);

    core.info(
      `Using provider=${config.llm.provider} model=${config.llm.model} block_on=${config.policy.block_on}`
    );

    const diffResult = await getPullRequestDiff(
      token,
      owner,
      repo,
      pullNumber,
      config.context.max_diff_bytes,
      config.context.lines_before,
      config.context.lines_after
    );
    const changedFiles = await getChangedFiles(
      token,
      owner,
      repo,
      pullNumber,
      config.context.max_files
    );

    core.info(
      `Diff source=${diffResult.source} size=${diffResult.diff.length} bytes` +
        (diffResult.truncated ? ` (truncated from ${diffResult.originalBytes})` : '') +
        `, ${changedFiles.length} files`
    );

    if (!diffResult.diff.trim()) {
      core.notice('No file changes to review. Skipping the security scan.');
      core.setOutput('findings-count', '0');
      core.setOutput('blocking-findings-count', '0');
      core.setOutput('conclusion', 'success');
      return;
    }

    const systemPrompt = buildSystemPrompt(config);
    const userPrompt = buildUserPrompt(
      diffResult.diff,
      changedFiles,
      config,
      diffResult.truncated
    );

    core.info('Calling LLM for security analysis...');
    let llmResponse: LlmResponse;
    try {
      llmResponse = await callLlm(
        config.llm.provider,
        config.llm.model,
        apiKey,
        systemPrompt,
        userPrompt,
        baseUrl,
        {
          runId: context.runId,
          runAttempt: (context as { runAttempt?: number | string }).runAttempt,
        }
      );
    } catch (llmErr: unknown) {
      const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
      core.error(`LLM call failed: ${msg}`);
      // A scan that did not run must never look like a clean scan.
      const conclusion = config.output.fail_on_error ? 'failure' : 'neutral';
      try {
        await createCheckRun(
          token,
          owner,
          repo,
          headSha,
          [],
          `LLM call failed: ${msg}`,
          config.policy.block_on,
          false,
          config.output.fail_on_error
            ? 'Check failed because the LLM provider call errored (fail_on_error: true).'
            : 'fail_on_error is false — no security scan ran, so the gate did not pass.',
          conclusion
        );
      } catch {
        /* ignore check create failure */
      }
      core.setOutput('findings-count', '0');
      core.setOutput('blocking-findings-count', '0');
      core.setOutput('conclusion', conclusion);
      if (config.output.fail_on_error) {
        core.setFailed(`LLM call failed: ${msg}`);
      } else {
        core.warning('fail_on_error is false, so the job did not fail. No scan ran.');
      }
      return;
    }

    if (llmResponse.parse_error) {
      core.warning(`LLM JSON parse issue: ${llmResponse.parse_error}`);
      // Unparseable output is not evidence of a clean diff. Fail closed unless
      // the caller opted out, matching the provider-error behavior.
      const conclusion = config.output.fail_on_error ? 'failure' : 'neutral';
      try {
        await createCheckRun(
          token,
          owner,
          repo,
          headSha,
          [],
          `LLM response could not be parsed: ${llmResponse.parse_error}`,
          config.policy.block_on,
          false,
          'The model did not return parseable JSON, so no findings were evaluated.',
          conclusion
        );
      } catch {
        /* ignore check create failure */
      }
      core.setOutput('findings-count', '0');
      core.setOutput('blocking-findings-count', '0');
      core.setOutput('conclusion', conclusion);
      if (config.output.fail_on_error) {
        core.setFailed(`LLM response could not be parsed: ${llmResponse.parse_error}`);
      }
      return;
    }

    const filtered = filterFindings(llmResponse.findings, config);
    core.info(
      `LLM returned ${llmResponse.findings.length} findings, ${filtered.length} after filtering`
    );

    const extraNotes: string[] = [];
    if (diffResult.truncated) {
      extraNotes.push(
        `⚠️ Diff was truncated (${diffResult.originalBytes} → ${config.context.max_diff_bytes} bytes). ` +
          `Findings may be incomplete.`
      );
    }

    const blockingCount = filtered.filter((f) =>
      shouldBlock(f.severity, config.policy.block_on)
    ).length;
    const conclusion = blockingCount > 0 ? 'failure' : 'success';

    try {
      await createCheckRun(
        token,
        owner,
        repo,
        headSha,
        filtered,
        llmResponse.summary,
        config.policy.block_on,
        config.output.annotate_lines,
        extraNotes.length ? extraNotes.join('\n') : undefined
      );
    } catch (checkErr: unknown) {
      const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
      core.warning(`Failed to create GitHub check run after retries: ${msg}`);
    }

    if (config.output.comment_on_pr) {
      try {
        await postPrComment(
          token,
          owner,
          repo,
          pullNumber,
          filtered,
          llmResponse.summary,
          blockingCount
        );
      } catch (commentErr: unknown) {
        const msg = commentErr instanceof Error ? commentErr.message : String(commentErr);
        core.warning(`Failed to post PR comment after retries: ${msg}`);
      }
    }

    core.setOutput('findings-count', filtered.length.toString());
    core.setOutput('blocking-findings-count', blockingCount.toString());
    core.setOutput('conclusion', conclusion);

    if (conclusion === 'failure') {
      core.setFailed(
        `${blockingCount} security finding(s) reached or exceeded the block_on severity of '${config.policy.block_on}'`
      );
    } else {
      core.info('Security scan passed.');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    core.setFailed(msg);
  }
}

run();

export {
  loadConfig,
  filterFindings,
  shouldBlock,
  inferCategory,
  deepMerge,
  readConfiguredModel,
  readConfiguredLlm,
  resolveOpenCodeGoModel,
  resolveRuntimeLlm,
} from './config';
export { inferLanguage, buildSystemPrompt, buildUserPrompt } from './prompts';
export {
  callLlm,
  extractJson,
  extractBalancedObject,
  normalizeResponse,
  formatOpenCodeGoSessionId,
  resolveOpenCodeGoSessionId,
} from './llm';
export { createCheckRun, postPrComment } from './checks';
export { getPullRequestDiff, getChangedFiles } from './diff';
export type { Finding, LlmResponse, SecurityScanConfig } from './types';
