import * as core from '@actions/core';
import {
  DEFAULT_CONFIG,
  OPENCODE_GO_DEFAULT_MODEL,
  canonicalCategory,
  normalizeConfidence,
  normalizeSeverity,
} from './config';
import type { Finding, LlmResponse } from './types';

export { OPENCODE_GO_DEFAULT_MODEL };

export type { Finding, LlmResponse };

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 800;

/**
 * Per-attempt request timeout. Without this a hung provider blocks the job
 * until the workflow timeout.
 */
export const LLM_REQUEST_TIMEOUT_MS = 120_000;

/** OpenCode Go chat completions. `llm-base-url` is not used. */
export const OPENCODE_GO_CHAT_COMPLETIONS_URL =
  'https://opencode.ai/inference/go/openai/v1/chat/completions';

export const OPENCODE_GO_USER_AGENT = 'SquidGate/1.0';

/** OpenAI default. Never send this to OpenCode Go. */
const OPENAI_DEFAULT_MODEL = DEFAULT_CONFIG.llm.model;

/** Header-safe session token. Invalid values fall back to squidgate-local. */
const SESSION_TOKEN = /^[A-Za-z0-9._-]{1,128}$/;

export interface OpenCodeGoRun {
  runId?: string | number | null;
  runAttempt?: string | number | null;
}

function normalizeRunValue(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  const text = String(value).trim();
  if (!text || text === 'NaN' || text === 'undefined' || !SESSION_TOKEN.test(text)) return '';
  return text;
}

/**
 * Format a stable OpenCode Go session id.
 * Pure: does not read Actions context or the environment.
 * Both values missing → `squidgate-local`.
 */
export function formatOpenCodeGoSessionId(
  runId?: string | number | null,
  runAttempt?: string | number | null
): string {
  const id = normalizeRunValue(runId);
  const attempt = normalizeRunValue(runAttempt);
  if (id && attempt) return `squidgate-${id}-${attempt}`;
  if (id || attempt) return `squidgate-${id || attempt}`;
  return 'squidgate-local';
}

/**
 * Session id for a Go request. Explicit run values win per field, then
 * GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT, then `squidgate-local`.
 */
export function resolveOpenCodeGoSessionId(run?: OpenCodeGoRun): string {
  const runId = normalizeRunValue(run?.runId) || normalizeRunValue(process.env.GITHUB_RUN_ID);
  const runAttempt =
    normalizeRunValue(run?.runAttempt) || normalizeRunValue(process.env.GITHUB_RUN_ATTEMPT);
  return formatOpenCodeGoSessionId(runId, runAttempt);
}

/** Blank or the OpenAI default must not be posted to Go. Other ids pass through. */
export function resolveOpenCodeGoRequestModel(model: string | undefined): string {
  const trimmed = (model || '').trim();
  if (!trimmed || trimmed === OPENAI_DEFAULT_MODEL) return OPENCODE_GO_DEFAULT_MODEL;
  return trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeResponse(resp: unknown): LlmResponse {
  const r = (resp && typeof resp === 'object' ? resp : {}) as Record<string, unknown>;
  const rawFindings = Array.isArray(r.findings) ? r.findings : [];
  // Models vary casing and skip fields. Normalize so policy filtering and
  // blocking decisions see canonical values.
  const findings = rawFindings.map((item) => {
    const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const startLine = Number(f.start_line);
    const endLine = Number(f.end_line);
    const category = canonicalCategory(f.category);
    return {
      ...f,
      file: typeof f.file === 'string' ? f.file : '',
      start_line: Number.isFinite(startLine) ? startLine : 1,
      end_line: Number.isFinite(endLine) ? endLine : Number.isFinite(startLine) ? startLine : 1,
      severity: normalizeSeverity(f.severity),
      confidence: normalizeConfidence(f.confidence),
      // Drop unrecognized category strings so inference works on the text instead.
      category,
    } as Finding;
  });
  const summary = typeof r.summary === 'string' ? r.summary : '';
  return { findings, summary };
}

/**
 * Repair mistakes models commonly make while still producing JSON-shaped text:
 * trailing commas, smart quotes, and single-quoted keys/strings.
 * Only applied after a strict parse fails, so valid JSON is never altered.
 */
export function repairJson(text: string): string {
  return text
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Trailing commas before a closing brace/bracket.
    .replace(/,(\s*[}\]])/g, '$1')
    // Single-quoted strings. The content group excludes quotes and escapes.
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_match, inner: string) => {
      const escaped = inner.replace(/\\'/g, "'").replace(/"/g, '\\"');
      return `"${escaped}"`;
    });
}

function parseObject(text: string): Record<string, unknown> | null {
  for (const candidate of [text, repairJson(text)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try the repaired form next */
    }
  }
  return null;
}

/**
 * Collect every top-level JSON object in the text, in order.
 * A model that prints a schema example before its answer produces two; we
 * need both to pick the right one.
 */
function findJsonObjects(text: string): string[] {
  const found: string[] = [];
  let index = text.indexOf('{');
  while (index >= 0) {
    const sliced = extractBalancedObject(text.slice(index));
    if (!sliced) break;
    found.push(sliced);
    index = text.indexOf('{', index + sliced.length);
  }
  return found;
}

/**
 * Extract the findings JSON from model output.
 *
 * Order: fenced block, then every balanced object in the text, then the whole
 * string. Among objects that parse, one with a `findings` array wins over a
 * bare `{}` or a schema example, so a leading example cannot mask the answer.
 */
export function extractJson(text: string): LlmResponse {
  if (!text || !text.trim()) {
    return {
      findings: [],
      summary: 'LLM response could not be parsed.',
      parse_error: 'empty response',
      raw: text || '',
    };
  }

  const trimmed = text.trim();
  // Some models return a bare array of findings instead of the wrapper object.
  // Check this before object scanning, which would otherwise find the inner
  // finding objects and treat them as a findings-less response.
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(repairJson(trimmed));
      if (Array.isArray(parsed)) {
        return normalizeResponse({ findings: parsed, summary: '' });
      }
    } catch {
      /* fall through to object scanning */
    }
  }

  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) candidates.push(fence[1]);
  candidates.push(...findJsonObjects(text));
  candidates.push(trimmed);

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const parsed = parseObject(candidate);
    if (!parsed) continue;
    // Prefer a real answer over a schema example. A leading example usually
    // has an empty findings array; the answer usually has entries.
    const findings = Array.isArray(parsed.findings) ? parsed.findings : null;
    let score = 0;
    if (findings) score = findings.length > 0 ? 3 : 1;
    if (score > bestScore) {
      best = parsed;
      bestScore = score;
    }
  }

  if (best) {
    return normalizeResponse(best);
  }

  core.warning('Could not parse LLM response as JSON. Returning empty findings.');
  return {
    findings: [],
    summary: 'LLM response could not be parsed.',
    parse_error: 'no valid JSON object in model output',
    raw: text.length > 2000 ? text.slice(0, 2000) + '…' : text,
  };
}

/** Find first top-level `{ ... }` with string/escape awareness. */
export function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return res;

      const errText = await res.text();
      const retryable = RETRYABLE_STATUS.has(res.status);
      lastErr = new Error(`${label} error (${res.status}): ${errText}`);
      if (!retryable || attempt === MAX_ATTEMPTS) throw lastErr;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      core.warning(`${label} ${res.status}; retry ${attempt}/${MAX_ATTEMPTS} in ${delay}ms`);
      await sleep(delay);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes(' error (')) throw e;
      // A timeout is a network-level failure and is retried like one.
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      lastErr = timedOut
        ? new Error(`${label} timed out after ${LLM_REQUEST_TIMEOUT_MS}ms`)
        : e instanceof Error
          ? e
          : new Error(String(e));
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      core.warning(`${label} network error; retry ${attempt}/${MAX_ATTEMPTS} in ${delay}ms: ${lastErr.message}`);
      await sleep(delay);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

async function callOpenAICompatible(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl?: string,
  run?: OpenCodeGoRun
): Promise<LlmResponse> {
  const requestModel = provider === 'opencode-go' ? resolveOpenCodeGoRequestModel(model) : model;

  if (provider === 'opencode-go' && baseUrl && baseUrl.trim()) {
    core.warning(
      'llm-base-url is ignored for llm-provider opencode-go; calling the OpenCode Go chat completions endpoint.'
    );
  }

  const url =
    provider === 'opencode-go'
      ? OPENCODE_GO_CHAT_COMPLETIONS_URL
      : provider === 'azure'
        ? `${baseUrl || process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${requestModel}/chat/completions?api-version=2024-02-15-preview`
        : provider === 'custom'
          ? `${(baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '')}/chat/completions`
          : 'https://api.openai.com/v1/chat/completions';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'azure') {
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Go rejects a generic HTTP-library user agent and requires a stable session id.
  // Do not attach these to openai, azure, custom, anthropic, or google.
  if (provider === 'opencode-go') {
    headers['User-Agent'] = OPENCODE_GO_USER_AGENT;
    headers['x-opencode-session'] = resolveOpenCodeGoSessionId(run);
  }

  const body = {
    model: requestModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    response_format: { type: 'json_object' as const },
    max_tokens: 4000,
  };

  const res = await fetchWithRetry(
    url,
    { method: 'POST', headers, body: JSON.stringify(body) },
    'LLM API'
  );

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    return normalizeResponse(JSON.parse(content));
  } catch {
    return extractJson(content);
  }
}

async function callAnthropic(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  retryJsonOnly = false
): Promise<LlmResponse> {
  const url = 'https://api.anthropic.com/v1/messages';
  const userContent = retryJsonOnly
    ? `${userPrompt}\n\nIMPORTANT: Your previous reply was not valid JSON. Reply with ONLY the JSON object, no markdown fences, no prose.`
    : userPrompt;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    'Anthropic'
  );

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text || '{}';
  const parsed = extractJson(text);
  if (parsed.parse_error && !retryJsonOnly) {
    core.warning('Anthropic JSON parse failed; retrying with stricter instruction');
    return callAnthropic(model, apiKey, systemPrompt, userPrompt, true);
  }
  return parsed;
}

async function callGoogle(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  retryJsonOnly = false
): Promise<LlmResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const textIn = retryJsonOnly
    ? `${systemPrompt}\n\n${userPrompt}\n\nIMPORTANT: Previous reply was not valid JSON. Return ONLY the JSON object.`
    : `${systemPrompt}\n\n${userPrompt}`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: textIn }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    },
    'Google'
  );

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = extractJson(text);
  if (parsed.parse_error && !retryJsonOnly) {
    core.warning('Google JSON parse failed; retrying with stricter instruction');
    return callGoogle(model, apiKey, systemPrompt, userPrompt, true);
  }
  return parsed;
}

export async function callLlm(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl?: string,
  run?: OpenCodeGoRun
): Promise<LlmResponse> {
  if (provider === 'openai' || provider === 'azure' || provider === 'custom' || provider === 'opencode-go') {
    return callOpenAICompatible(provider, model, apiKey, systemPrompt, userPrompt, baseUrl, run);
  }
  if (provider === 'anthropic') {
    return callAnthropic(model, apiKey, systemPrompt, userPrompt);
  }
  if (provider === 'google') {
    return callGoogle(model, apiKey, systemPrompt, userPrompt);
  }
  throw new Error(`Unsupported LLM provider: ${provider}`);
}
