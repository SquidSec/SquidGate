import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type {
  BlockOn,
  Confidence,
  Finding,
  FindingCategory,
  SecurityScanConfig,
  Severity,
} from './types';

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

export const OPENCODE_GO_PROVIDER = 'opencode-go';
export const OPENCODE_GO_DEFAULT_MODEL = 'glm-5.3-flash';

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
    // Noise that rarely holds reviewable security context and often consumes
    // the token budget. Users can override this list.
    ignore: [
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
      '**/Cargo.lock',
      '**/go.sum',
      '**/composer.lock',
      '**/poetry.lock',
      '**/*.min.js',
      '**/*.min.css',
      '**/*.map',
      '**/dist/**',
      '**/vendor/**',
      '**/node_modules/**',
    ],
    max_file_bytes: 100000,
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

export const CONFIDENCE_ORDER: Record<string, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

export const VALID_BLOCK_ON: readonly BlockOn[] = ['critical', 'high', 'medium', 'low', 'none'];
export const VALID_CONFIDENCE: readonly Confidence[] = ['high', 'medium', 'low'];

/** Category keys the policy can toggle, in prompt order. */
export const KNOWN_CATEGORIES: readonly FindingCategory[] = [
  'secrets',
  'injection',
  'authn_authz',
  'cryptography',
  'insecure_deserialization',
  'path_traversal',
  'ssrf',
  'xss',
  'csrf',
  'supply_chain',
  'hardcoded_credentials',
  'dangerous_functions',
  'misconfiguration',
];

/**
 * Spellings models produce for each category. Matching is done on a
 * normalized key (lowercase, non-alphanumerics collapsed to `_`), so
 * "SQL Injection", "sql-injection", and "SQLInjection" all collapse here.
 */
const CATEGORY_ALIASES: Record<string, FindingCategory> = {
  secret: 'secrets',
  secrets: 'secrets',
  credential: 'secrets',
  credentials: 'secrets',
  hardcoded_credentials: 'hardcoded_credentials',
  hardcoded_secret: 'hardcoded_credentials',
  hardcoded_secrets: 'hardcoded_credentials',
  hardcoded_password: 'hardcoded_credentials',
  injection: 'injection',
  sqli: 'injection',
  sql_injection: 'injection',
  command_injection: 'injection',
  os_command_injection: 'injection',
  code_injection: 'injection',
  authn_authz: 'authn_authz',
  authentication: 'authn_authz',
  authorization: 'authn_authz',
  auth: 'authn_authz',
  broken_access_control: 'authn_authz',
  access_control: 'authn_authz',
  idor: 'authn_authz',
  cryptography: 'cryptography',
  crypto: 'cryptography',
  weak_crypto: 'cryptography',
  insecure_deserialization: 'insecure_deserialization',
  deserialization: 'insecure_deserialization',
  path_traversal: 'path_traversal',
  directory_traversal: 'path_traversal',
  ssrf: 'ssrf',
  server_side_request_forgery: 'ssrf',
  xss: 'xss',
  cross_site_scripting: 'xss',
  csrf: 'csrf',
  cross_site_request_forgery: 'csrf',
  supply_chain: 'supply_chain',
  dependency: 'supply_chain',
  dangerous_functions: 'dangerous_functions',
  dangerous_function: 'dangerous_functions',
  dangerous_api: 'dangerous_functions',
  code_execution: 'dangerous_functions',
  rce: 'dangerous_functions',
  misconfiguration: 'misconfiguration',
  misconfig: 'misconfiguration',
  security_misconfiguration: 'misconfiguration',
};

function categoryKey(value: string): string {
  return value
    .trim()
    // Split camelCase/PascalCase so "DangerousFunctions" -> "dangerous_functions".
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Map a model-supplied category onto a policy key.
 * Returns null when the value matches no known category, so the caller can
 * fall back to text inference instead of trusting an arbitrary string.
 */
export function canonicalCategory(value: unknown): FindingCategory | null {
  if (typeof value !== 'string') return null;
  const key = categoryKey(value);
  if (!key) return null;
  const direct = CATEGORY_ALIASES[key];
  if (direct) return direct;
  // "SQLInjection" has no camel boundary, so it collapses to one word.
  const collapsed = key.replace(/_/g, '');
  for (const [alias, cat] of Object.entries(CATEGORY_ALIASES)) {
    if (alias.replace(/_/g, '') === collapsed) return cat;
  }
  return null;
}

/**
 * Models do not reliably honor casing. Normalize before any comparison so
 * `Critical`/`High` still gate the pull request.
 */
export function normalizeSeverity(value: unknown): Severity {
  const key = String(value ?? '').trim().toLowerCase();
  return key in SEVERITY_ORDER ? (key as Severity) : 'info';
}

export function normalizeConfidence(value: unknown): Confidence {
  const key = String(value ?? '').trim().toLowerCase();
  return key in CONFIDENCE_ORDER ? (key as Confidence) : 'low';
}

export function shouldBlock(severity: string, threshold: string): boolean {
  const thrKey = String(threshold ?? '').trim().toLowerCase();
  if (thrKey === 'none') return false;
  const sev = SEVERITY_ORDER[normalizeSeverity(severity)];
  const thr = SEVERITY_ORDER[thrKey];
  // An unknown threshold must not silently disable the gate.
  if (thr === undefined) return sev >= SEVERITY_ORDER.high;
  return sev >= thr;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursive deep merge (arrays replaced, not concatenated). */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = out[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      out[key] = deepMerge(tv, sv);
    } else if (sv !== undefined) {
      out[key] = sv;
    }
  }
  return out as T;
}

export interface ConfiguredLlm {
  provider: string;
  model: string;
}

function readYamlString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Provider and model written in the config file. Missing fields are ''. */
export function readConfiguredLlm(configPath: string): ConfiguredLlm {
  const empty = { provider: '', model: '' };
  if (!configPath || !fs.existsSync(configPath)) return empty;
  try {
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as {
      llm?: { provider?: unknown; model?: unknown };
    } | null;
    return {
      provider: readYamlString(parsed?.llm?.provider),
      model: readYamlString(parsed?.llm?.model),
    };
  } catch {
    return empty;
  }
}

/** Model id written in the config file, or '' when the file does not set one. */
export function readConfiguredModel(configPath: string): string {
  return readConfiguredLlm(configPath).model;
}

/**
 * Model to use for OpenCode Go.
 * An omitted model, or the OpenAI default `gpt-4o`, becomes `glm-5.3-flash`.
 * Any other explicitly configured id is kept.
 */
export function resolveOpenCodeGoModel(model: string | undefined, modelExplicit: boolean): string {
  const trimmed = (model || '').trim();
  if (!modelExplicit || !trimmed || trimmed === DEFAULT_CONFIG.llm.model) {
    return OPENCODE_GO_DEFAULT_MODEL;
  }
  return trimmed;
}

export interface RuntimeLlm {
  provider: string;
  model: string;
  warnings: string[];
}

function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 200);
}

/**
 * Merge a config-file LLM with action inputs.
 * Each input replaces only its own field. Changing provider without a model
 * does not reuse the previous provider's model id.
 */
export function resolveRuntimeLlm(
  fileProvider: string,
  fileModel: string,
  inputProvider: string,
  inputModel: string
): RuntimeLlm {
  const fileProviderTrimmed = fileProvider.trim();
  const fileModelTrimmed = fileModel.trim();
  const inputProviderTrimmed = inputProvider.trim();
  const inputModelTrimmed = inputModel.trim();

  const effectiveFileProvider = fileProviderTrimmed || DEFAULT_CONFIG.llm.provider;
  const provider = inputProviderTrimmed || effectiveFileProvider;
  const providerChanged =
    Boolean(inputProviderTrimmed) && inputProviderTrimmed !== effectiveFileProvider;

  const warnings: string[] = [];
  let model: string;

  if (inputModelTrimmed) {
    model = inputModelTrimmed;
  } else if (fileModelTrimmed && !providerChanged) {
    model = fileModelTrimmed;
  } else {
    model = provider === OPENCODE_GO_PROVIDER ? OPENCODE_GO_DEFAULT_MODEL : DEFAULT_CONFIG.llm.model;
    if (fileModelTrimmed && providerChanged && fileModelTrimmed !== model) {
      warnings.push(
        `Not sending '${oneLine(fileModelTrimmed)}' to ${oneLine(provider)}; it was configured for ${oneLine(effectiveFileProvider)}. Using ${model}.`
      );
    }
  }

  if (provider === OPENCODE_GO_PROVIDER) {
    const explicit = Boolean(inputModelTrimmed) || (Boolean(fileModelTrimmed) && !providerChanged);
    const requested = explicit ? inputModelTrimmed || fileModelTrimmed : '';
    const resolved = resolveOpenCodeGoModel(requested, explicit);
    if (requested === DEFAULT_CONFIG.llm.model && resolved === OPENCODE_GO_DEFAULT_MODEL) {
      warnings.push(`Not sending ${DEFAULT_CONFIG.llm.model} to OpenCode Go; using ${OPENCODE_GO_DEFAULT_MODEL}.`);
    }
    model = resolved;
  }

  return { provider, model, warnings };
}

export type ConfigOverrides = Omit<Partial<SecurityScanConfig>, 'llm' | 'policy'> & {
  llm?: Partial<SecurityScanConfig['llm']>;
  policy?: Partial<SecurityScanConfig['policy']>;
};

export function loadConfig(
  configPath: string,
  overrides: ConfigOverrides = {}
): SecurityScanConfig {
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as SecurityScanConfig;

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(raw) as Partial<SecurityScanConfig> | null;
      if (parsed && isPlainObject(parsed)) {
        config = deepMerge(
          config as unknown as Record<string, unknown>,
          parsed as Record<string, unknown>
        ) as unknown as SecurityScanConfig;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to parse config at ${configPath}: ${msg}`);
    }
  }

  if (overrides.llm) {
    config.llm = {
      provider: overrides.llm.provider || config.llm.provider,
      model: overrides.llm.model || config.llm.model,
    };
  }
  if (overrides.policy) {
    const { categories, custom_rules, ...rest } = overrides.policy;
    config.policy = { ...config.policy, ...rest };
    if (categories) {
      config.policy.categories = { ...config.policy.categories, ...categories };
    }
    if (custom_rules) {
      config.policy.custom_rules = custom_rules;
    }
  }
  if (overrides.context) {
    config.context = { ...config.context, ...overrides.context };
  }
  if (overrides.output) {
    config.output = { ...config.output, ...overrides.output };
  }

  config.policy.block_on = validateBlockOn(config.policy.block_on, configPath);
  config.policy.min_confidence = validateConfidence(config.policy.min_confidence, configPath);

  return config;
}

/**
 * Fall back to the strict default instead of accepting a value that would make
 * `shouldBlock` unintentionally permissive.
 */
export function validateBlockOn(value: unknown, source = 'config'): BlockOn {
  const key = String(value ?? '').trim().toLowerCase();
  if ((VALID_BLOCK_ON as readonly string[]).includes(key)) return key as BlockOn;
  console.warn(`Invalid block_on '${String(value)}' in ${source}; using 'high'.`);
  return DEFAULT_CONFIG.policy.block_on;
}

export function validateConfidence(value: unknown, source = 'config'): Confidence {
  const key = String(value ?? '').trim().toLowerCase();
  if ((VALID_CONFIDENCE as readonly string[]).includes(key)) return key as Confidence;
  console.warn(`Invalid min_confidence '${String(value)}' in ${source}; using 'medium'.`);
  return DEFAULT_CONFIG.policy.min_confidence;
}

/** Map free-text / CWE hints to a policy category when the model omits `category`. */
export function inferCategory(finding: Finding): FindingCategory | null {
  const explicit = canonicalCategory(finding.category);
  if (explicit) return explicit;

  const blob = [
    finding.title,
    finding.description,
    finding.cwe || '',
    finding.owasp || '',
    finding.recommendation,
  ]
    .join(' ')
    .toLowerCase();

  const rules: Array<[RegExp, FindingCategory]> = [
    // Specific phrases must win over broad words like "password"/"key".
    [/\bhardcoded\b.*\b(password|secret|key|token|credential)/, 'hardcoded_credentials'],
    [/\b(secret|api[_ ]?key|private[_ ]?key|token|password|credential|cwe-798|cwe-259)\b/, 'secrets'],
    [/\b(sql\s*injection|command\s*injection|code\s*injection|os\s+command|sqli|cwe-89|cwe-78|cwe-77)\b/, 'injection'],
    [/\b(xss|cross-site scripting|cwe-79)\b/, 'xss'],
    [/\b(ssrf|server-side request|cwe-918)\b/, 'ssrf'],
    [/\b(path\s*traversal|directory\s*traversal|cwe-22)\b/, 'path_traversal'],
    [/\b(csrf|cross-site request forgery|cwe-352)\b/, 'csrf'],
    [/\b(deserializ|pickle|yaml\.load|cwe-502)\b/, 'insecure_deserialization'],
    [/\b(md5|sha1|ecb|weak\s*crypto|cwe-327|cwe-328)\b/, 'cryptography'],
    [/\b(authn|authz|authorization|authentication|idor|broken access|cwe-287|cwe-862|cwe-863)\b/, 'authn_authz'],
    // `eval(` / `exec(` end on a non-word char, so a trailing \b can never match.
    [/\b(eval\s*\(|exec\s*\(|child_process|dangerous\s+function|code\s+execution|cwe-95)/, 'dangerous_functions'],
    [/\b(supply.?chain|dependency|typosquat|malicious package)\b/, 'supply_chain'],
    [/\b(misconfig|debug\s*=\s*true|permissive cors)\b/, 'misconfiguration'],
  ];

  for (const [re, cat] of rules) {
    if (re.test(blob)) return cat;
  }
  return null;
}

export function filterFindings(findings: Finding[], config: SecurityScanConfig): Finding[] {
  const minConf = config.policy.min_confidence;
  const minScore = CONFIDENCE_ORDER[minConf] ?? 1;
  const categories = config.policy.categories || {};

  // If every known category is enabled (or categories empty), only confidence filters.
  const disabled = new Set(
    Object.entries(categories)
      .filter(([, enabled]) => enabled === false)
      .map(([k]) => categoryKey(k))
  );

  return findings.filter((f) => {
    const conf = CONFIDENCE_ORDER[f.confidence] ?? -1;
    if (conf < minScore) return false;

    if (disabled.size === 0) return true;

    const cat = inferCategory(f);
    if (!cat) {
      // Unknown category: keep (do not drop on inference failure)
      return true;
    }
    return !disabled.has(categoryKey(cat));
  });
}
