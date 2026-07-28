# security-scan

LLM-powered GitHub Action that acts as a configurable PR security gate.

It analyzes the diff of a pull request using an LLM (chosen and paid for by you) and fails the required status check when findings meet or exceed your configured severity threshold.

- Language-agnostic (any text)
- Diff-first + configurable context
- Strict-by-default, fully tunable
- Supports OpenAI, Anthropic, Google, Azure, custom OpenAI-compatible endpoints
- Creates annotated GitHub Checks + optional PR comment
- Blocks merges via standard "Require status checks"

## Quick Start

1. Add the workflow:

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: your-org/security-scan@v1
        with:
          llm-api-key: ${{ secrets.LLM_API_KEY }}
```

2. Store your LLM key as a repository secret `LLM_API_KEY`.

3. (Recommended) Enable branch protection: **Require status checks** → select `security-scan`.

## Configuration

Primary configuration lives in `.github/security-scan.yml` (or override via action inputs).

See `.github/security-scan.yml.example` for the full reference.

### Minimal config (strict defaults)

```yaml
version: 1
llm:
  provider: openai
  model: gpt-4o
policy:
  block_on: high
```

### Key settings

- `policy.block_on`: `critical` | `high` | `medium` | `low` | `none`
- `llm.provider`: `openai` | `anthropic` | `azure` | `google` | `custom`
- All categories under `policy.categories` are enabled by default.

To relax, explicitly set `block_on: medium` or disable categories.

## Action Inputs

| Input           | Required | Default                    | Description                              |
|-----------------|----------|----------------------------|------------------------------------------|
| `github-token`  | No       | `${{ github.token }}`      | Needs `checks:write`, `pull-requests:write` |
| `llm-api-key`   | Yes      | —                          | Your LLM provider key (use secrets!)     |
| `config-path`   | No       | `.github/security-scan.yml`| Path to YAML config                      |
| `llm-provider`  | No       | from config                | Override provider                        |
| `llm-model`     | No       | from config                | Override model                           |
| `block-on`      | No       | from config                | Override severity threshold              |
| `llm-base-url`  | No       | —                          | For custom endpoints / Azure             |

## Supported Providers & Models (examples)

- **openai**: `gpt-4o`, `gpt-4o-mini`, `o1-preview` (use models that support JSON mode)
- **anthropic**: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`
- **google**: `gemini-1.5-pro`, `gemini-1.5-flash`
- **azure**: Set `llm-provider: azure` + `llm-base-url`
- **custom**: Any OpenAI-compatible server (Ollama, vLLM, LiteLLM, local, etc.)

## Outputs

- `findings-count`
- `blocking-findings-count`
- `conclusion`: `success` | `failure`

## Privacy & Security

- Your code and diffs are sent **only** to the LLM endpoint you configure.
- No data is stored by this action's maintainers.
- Uses least-privilege permissions.
- Supports private/self-hosted LLMs and self-hosted runners.

## Development

```bash
npm install
npm run build:ts
npm run package
```

The bundled `dist/index.js` is what the action executes.

## License

MIT (or your choice)
