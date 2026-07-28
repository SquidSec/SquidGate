import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { SecurityScanConfig } from './types';

export type { SecurityScanConfig } from './types';

export interface PolicyConfig {
  block_on: 'critical' | 'high' | 'medium' | 'low' | 'none';
  min_confidence: 'high' | 'medium' | 'low';
  categories: Record<string, boolean>;
  custom_rules: string[];
}

export interface LlmConfig {
  provider: string;
  model: string;
}

export const DEFAULT_CONFIG: SecurityScanConfig = {
  version: 1,
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
  },
  policy: {
    block_on: 'high',
    min_confidence: 'medium',
    categories: {
      secrets: true,
      injection: true,
      authn_authz: true,
      cryptography: true,
      insecure_deserialization: true,
      path_traversal: true,
      ssrf: true,
      xss: true,
      csrf: true,
      supply_chain: true,
      hardcoded_credentials: true,
      dangerous_functions: true,
      misconfiguration: true,
    },
    custom_rules: [],
  },
  context: {
    lines_before: 30,
    lines_after: 30,
    max_files: 50,
    max_diff_bytes: 500000,
  },
  output: {
    comment_on_pr: true,
    annotate_lines: true,
    fail_on_error: true,
  },
};

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
  none: -1,
};

export function shouldBlock(severity: string, threshold: string): boolean {
  const sev = SEVERITY_ORDER[severity] ?? -1;
  const thr = SEVERITY_ORDER[threshold] ?? 999;
  return sev >= thr;
}

function deepMerge(target: any, source: any): any {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export function loadConfig(configPath: string, overrides: Partial<SecurityScanConfig> = {}): SecurityScanConfig {
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // deep clone

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(raw) as Partial<SecurityScanConfig>;
      if (parsed) {
        config = deepMerge(config, parsed);
      }
    } catch (e) {
      // caller can warn
      console.warn(`Failed to parse config at ${configPath}: ${e}`);
    }
  }

  // Apply overrides (inputs)
  if (overrides.llm) {
    config.llm = { ...config.llm, ...overrides.llm };
  }
  if (overrides.policy) {
    config.policy = { ...config.policy, ...overrides.policy };
    if (overrides.policy.categories) {
      config.policy.categories = { ...config.policy.categories, ...overrides.policy.categories };
    }
    if (overrides.policy.custom_rules) {
      config.policy.custom_rules = overrides.policy.custom_rules;
    }
  }
  if (overrides.context) {
    config.context = { ...config.context, ...overrides.context };
  }
  if (overrides.output) {
    config.output = { ...config.output, ...overrides.output };
  }

  return config as SecurityScanConfig;
}

export function filterFindings(findings: any[], config: SecurityScanConfig): any[] {
  const minConf = config.policy.min_confidence;
  const confOrder: Record<string, number> = { high: 2, medium: 1, low: 0 };

  return findings.filter((f: any) => {
    if (!f.confidence || confOrder[f.confidence] < confOrder[minConf]) return false;
    return true;
  });
}
