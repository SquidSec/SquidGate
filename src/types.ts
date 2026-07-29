export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type BlockOn = 'critical' | 'high' | 'medium' | 'low' | 'none';

/** Policy category keys (matches DEFAULT_CONFIG.policy.categories). */
export type FindingCategory =
  | 'secrets'
  | 'injection'
  | 'authn_authz'
  | 'cryptography'
  | 'insecure_deserialization'
  | 'path_traversal'
  | 'ssrf'
  | 'xss'
  | 'csrf'
  | 'supply_chain'
  | 'hardcoded_credentials'
  | 'dangerous_functions'
  | 'misconfiguration'
  | string;

export interface Finding {
  file: string;
  start_line: number;
  end_line: number;
  severity: Severity;
  title: string;
  description: string;
  cwe: string | null;
  owasp: string | null;
  recommendation: string;
  confidence: Confidence;
  /** Optional category used for policy.categories filtering. */
  category?: FindingCategory | null;
}

export interface LlmResponse {
  findings: Finding[];
  summary: string;
  /** Set when the model output could not be parsed as JSON. */
  parse_error?: string;
  raw?: string;
}

export interface SecurityScanConfig {
  version: number;
  llm: { provider: string; model: string };
  policy: {
    block_on: BlockOn;
    min_confidence: Confidence;
    categories: Record<string, boolean>;
    custom_rules: string[];
  };
  context: {
    lines_before: number;
    lines_after: number;
    max_files: number;
    max_diff_bytes: number;
  };
  output: {
    comment_on_pr: boolean;
    annotate_lines: boolean;
    fail_on_error: boolean;
  };
}
