# Configuration reference

**SquidGate** primary config: **`.github/squidgate.yml`**  
Action inputs override the same fields for one-off runs.

## Full schema

```yaml
version: 1

llm:
  provider: openai          # openai | anthropic | azure | google | custom
  model: gpt-4o

policy:
  block_on: high            # critical | high | medium | low | none
  min_confidence: medium    # high | medium | low
  categories:
    secrets: true
    injection: true
    authn_authz: true
    cryptography: true
    insecure_deserialization: true
    path_traversal: true
    ssrf: true
    xss: true
    csrf: true
    supply_chain: true
    hardcoded_credentials: true
    dangerous_functions: true
    misconfiguration: true
  custom_rules: []

context:
  lines_before: 30
  lines_after: 30
  max_files: 50
  max_diff_bytes: 500000

output:
  comment_on_pr: true
  annotate_lines: true
  fail_on_error: true
```

## `policy.block_on`

| Value | Behavior |
|-------|----------|
| `critical` | Only critical findings fail |
| `high` | **Default.** high + critical fail |
| `medium` | medium and above fail |
| `low` | almost everything fails |
| `none` | Soft mode — report only |

## `policy.min_confidence`

| Value | Behavior |
|-------|----------|
| `high` | Only clear issues |
| `medium` | **Default** |
| `low` | Include speculative findings |

## Providers

| Provider | `llm-provider` | Notes |
|----------|----------------|-------|
| OpenAI | `openai` | JSON mode; e.g. `gpt-4o` |
| Anthropic | `anthropic` | Claude 3.5+ |
| Google | `google` | Gemini |
| Azure OpenAI | `azure` | Set `llm-base-url` |
| xAI Grok | `custom` | `llm-base-url: https://api.x.ai/v1` |
| Ollama / vLLM / LiteLLM | `custom` | Your server URL |

## Custom rules

```yaml
policy:
  custom_rules:
    - "Reject MD5 for password hashing"
    - "All user-facing HTML must be escaped"
```

## Action input overrides

| Input | Overrides |
|-------|-----------|
| `llm-provider` | `llm.provider` |
| `llm-model` | `llm.model` |
| `llm-base-url` | endpoint (not stored in YAML) |
| `block-on` | `policy.block_on` |
| `config-path` | path to YAML |
