import * as core from '@actions/core';
import type { Finding, LlmResponse } from './types';

export type { Finding, LlmResponse };

export function normalizeResponse(resp: any): LlmResponse {
  if (!resp) resp = {};
  if (!Array.isArray(resp.findings)) resp.findings = [];
  if (typeof resp.summary !== 'string') resp.summary = '';
  return resp as LlmResponse;
}

export function extractJson(text: string): LlmResponse {
  if (!text) return { findings: [], summary: 'LLM response could not be parsed.' };
  // Try to find the largest JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalizeResponse(parsed);
    } catch (e) {
      // fallthrough
    }
  }
  // Try code fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1]);
      return normalizeResponse(parsed);
    } catch {}
  }
  core.warning('Could not parse LLM response as JSON. Returning empty findings.');
  return { findings: [], summary: 'LLM response could not be parsed.' };
}

async function callOpenAICompatible(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl?: string
): Promise<LlmResponse> {
  const url =
    provider === 'azure'
      ? `${baseUrl || process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`
      : provider === 'custom'
      ? `${baseUrl || 'http://localhost:11434/v1'}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'azure') {
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content);
    return normalizeResponse(parsed);
  } catch {
    return extractJson(content);
  }
}

async function callAnthropic(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResponse> {
  const url = 'https://api.anthropic.com/v1/messages';

  const res = await fetch(url, {
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
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error: ${await res.text()}`);
  }

  const data: any = await res.json();
  const text = data.content?.find((c: any) => c.type === 'text')?.text || '{}';
  return extractJson(text);
}

async function callGoogle(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Google error: ${await res.text()}`);
  }

  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return extractJson(text);
}

export async function callLlm(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl?: string
): Promise<LlmResponse> {
  if (provider === 'openai' || provider === 'azure' || provider === 'custom') {
    return await callOpenAICompatible(provider, model, apiKey, systemPrompt, userPrompt, baseUrl);
  } else if (provider === 'anthropic') {
    return await callAnthropic(model, apiKey, systemPrompt, userPrompt);
  } else if (provider === 'google') {
    return await callGoogle(model, apiKey, systemPrompt, userPrompt);
  }
  throw new Error(`Unsupported LLM provider: ${provider}`);
}
