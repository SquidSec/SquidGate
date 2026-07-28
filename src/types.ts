export interface Finding {
  file: string;
  start_line: number;
  end_line: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  cwe: string | null;
  owasp: string | null;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface LlmResponse {
  findings: Finding[];
  summary: string;
}

export interface SecurityScanConfig {
  version: number;
  llm: { provider: string; model: string };
  policy: {
    block_on: 'critical' | 'high' | 'medium' | 'low' | 'none';
    min_confidence: 'high' | 'medium' | 'low';
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
