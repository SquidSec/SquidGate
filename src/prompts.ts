import * as path from 'path';
import type { SecurityScanConfig } from './types';

export function inferLanguage(filename: string): string {
  const base = path.basename(filename).toLowerCase();
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'Dockerfile';

  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.rs': 'Rust',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
    '.sh': 'Shell',
    '.bash': 'Shell',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.json': 'JSON',
    '.xml': 'XML',
    '.sql': 'SQL',
    '.md': 'Markdown',
    '.dockerfile': 'Dockerfile',
  };
  return map[ext] || 'Unknown';
}

const FEW_SHOT = `
EXAMPLE FINDING (secret):
{
  "file": "src/config.py",
  "start_line": 12,
  "end_line": 12,
  "severity": "critical",
  "title": "Hardcoded API key",
  "description": "A live-looking API key is embedded in source on a changed line.",
  "cwe": "CWE-798",
  "owasp": "A07:2021",
  "recommendation": "Load secrets from environment or a secret manager; rotate the exposed key.",
  "confidence": "high",
  "category": "secrets"
}

EXAMPLE FINDING (injection):
{
  "file": "api/users.py",
  "start_line": 40,
  "end_line": 42,
  "severity": "high",
  "title": "SQL injection via string concatenation",
  "description": "User input is concatenated into a SQL query without parameterization.",
  "cwe": "CWE-89",
  "owasp": "A03:2021",
  "recommendation": "Use parameterized queries or an ORM binder; never interpolate untrusted input into SQL.",
  "confidence": "high",
  "category": "injection"
}
`.trim();

export function buildSystemPrompt(config: SecurityScanConfig): string {
  const enabledCategories = Object.entries(config.policy.categories)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');

  const disabledCategories = Object.entries(config.policy.categories)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const custom =
    config.policy.custom_rules.length > 0
      ? 'CUSTOM RULES (must also enforce):\n' +
        config.policy.custom_rules.map((r: string) => '- ' + r).join('\n')
      : '';

  const disabledNote =
    disabledCategories.length > 0
      ? `DISABLED CATEGORIES (do NOT report findings in these categories): ${disabledCategories.join(', ')}`
      : 'All listed categories are enabled.';

  return `You are an expert application security code reviewer with deep knowledge of secure coding practices.

Your task is to analyze the provided pull request diff STRICTLY for security issues.

SECURITY STANDARDS TO ENFORCE (be conservative - prefer reporting over missing issues for high severity):
- OWASP Top 10 (2021) and OWASP API Security Top 10
- CWE Top 25 Most Dangerous Software Weaknesses
- Language-specific secure coding guidelines
- SANS/CWE secure coding practices
- Modern cryptography standards (no MD5/SHA1 for security, no ECB, no hardcoded keys/IVs)

DEFAULT ENABLED RULE CATEGORIES: ${enabledCategories}
${disabledNote}

${custom}

STRICT RULES FOR ANALYSIS:
1. ONLY analyze the code in the DIFF and provided context. Do not speculate about unshown code.
2. Focus on the CHANGED lines. Surrounding context is for understanding only.
3. Report a finding ONLY if there is a clear or highly likely security issue.
4. For high/critical severity, be conservative: report if uncertain rather than miss.
5. Map to CWE and OWASP where applicable. Use null if none fit.
6. Provide actionable recommendation with code suggestion when possible.
7. Assign confidence: high (clear vulnerability), medium, low (possible issue).
8. Set "category" to one of the enabled category keys (e.g. secrets, injection, xss).
9. Do not invent findings outside the enabled categories.

${FEW_SHOT}

OUTPUT REQUIREMENTS:
- Respond with ONLY a single valid JSON object. No markdown, no explanations outside the JSON.
- Use this exact schema:
{
  "findings": [
    {
      "file": "string (relative path from repo root)",
      "start_line": number,
      "end_line": number,
      "severity": "critical|high|medium|low|info",
      "title": "short title",
      "description": "detailed but concise explanation of the security issue",
      "cwe": "CWE-XXX or null",
      "owasp": "A01:2021 or null",
      "recommendation": "how to fix it, preferably with example",
      "confidence": "high|medium|low",
      "category": "secrets|injection|authn_authz|cryptography|insecure_deserialization|path_traversal|ssrf|xss|csrf|supply_chain|hardcoded_credentials|dangerous_functions|misconfiguration"
    }
  ],
  "summary": "1-2 sentence overall assessment"
}

If no security issues are found, return: {"findings": [], "summary": "No security issues detected in the changes."}

NEVER include any text before or after the JSON.`;
}

export function buildUserPrompt(
  diff: string,
  files: Array<{ filename: string; status?: string }>,
  config: SecurityScanConfig,
  truncated = false
): string {
  const fileList = files
    .map((f) => {
      const lang = inferLanguage(f.filename);
      return `- ${f.filename} (${lang})`;
    })
    .join('\n');

  const policySummary = `block_on: ${config.policy.block_on}
min_confidence: ${config.policy.min_confidence}
categories: ${JSON.stringify(config.policy.categories)}`;

  const truncNote = truncated
    ? '\n\nNOTE: The unified diff was truncated due to size limits. Only analyze what is present; do not assume missing hunks are safe or unsafe.\n'
    : '';

  return `## Pull Request Changes

Files changed:
${fileList}

## Policy
${policySummary}
${truncNote}
## Unified Diff (with context)
\`\`\`diff
${diff}
\`\`\`

Analyze the diff above according to the system instructions and policy. Return ONLY the JSON object.`;
}
