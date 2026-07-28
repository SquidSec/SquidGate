import * as path from 'path';

export function inferLanguage(filename: string): string {
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

export function buildSystemPrompt(config: any): string {
  const enabledCategories = Object.entries(config.policy.categories)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');

  const custom = config.policy.custom_rules.length > 0
    ? 'CUSTOM RULES (must also enforce):\n' + config.policy.custom_rules.map((r: string) => '- ' + r).join('\n')
    : '';

  return `You are an expert application security code reviewer with deep knowledge of secure coding practices.

Your task is to analyze the provided pull request diff STRICTLY for security issues.

SECURITY STANDARDS TO ENFORCE (be conservative - prefer reporting over missing issues for high severity):
- OWASP Top 10 (2021) and OWASP API Security Top 10
- CWE Top 25 Most Dangerous Software Weaknesses
- Language-specific secure coding guidelines
- SANS/CWE secure coding practices
- Modern cryptography standards (no MD5/SHA1 for security, no ECB, no hardcoded keys/IVs)

DEFAULT ENABLED RULE CATEGORIES: ${enabledCategories}

${custom}

STRICT RULES FOR ANALYSIS:
1. ONLY analyze the code in the DIFF and provided context. Do not speculate about unshown code.
2. Focus on the CHANGED lines. Surrounding context is for understanding only.
3. Report a finding ONLY if there is a clear or highly likely security issue.
4. For high/critical severity, be conservative: report if uncertain rather than miss.
5. Map to CWE and OWASP where applicable. Use null if none fit.
6. Provide actionable recommendation with code suggestion when possible.
7. Assign confidence: high (clear vulnerability), medium, low (possible issue).

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
      "confidence": "high|medium|low"
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
  config: any
): string {
  const fileList = files
    .map(f => {
      const lang = inferLanguage(f.filename);
      return `- ${f.filename} (${lang})`;
    })
    .join('\n');

  const policySummary = `block_on: ${config.policy.block_on}
min_confidence: ${config.policy.min_confidence}
categories: ${JSON.stringify(config.policy.categories)}`;

  return `## Pull Request Changes

Files changed:
${fileList}

## Policy
${policySummary}

## Unified Diff (with context)
\`\`\`diff
${diff}
\`\`\`

Analyze the diff above according to the system instructions and policy. Return ONLY the JSON object.`;
}
