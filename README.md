# SquidGate

[![CI](https://github.com/SquidSec/SquidGate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SquidSec/SquidGate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-ready-2088FF?logo=githubactions&logoColor=white)](action.yml)
[![Node](https://img.shields.io/badge/node-20-green?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**LLM-powered PR security gate for GitHub**  
*by [SquidSec](https://www.SquidOffense.com)*

> One workflow. Every pull request analyzed for security issues.  
> Findings above your threshold fail the check and can block merge.

Language-agnostic. You choose (and pay for) the model — OpenAI, Anthropic, Google, Azure, **Grok / xAI**, Ollama, or any OpenAI-compatible endpoint.

---

## Why SquidGate?

| | Traditional SAST | SquidGate |
|---|---|---|
| Languages | Per-language rules | Any text-based source |
| Setup | Days of tuning | **~2 minutes** |
| Context | Whole-repo noise | **Diff-first** + context window |
| Model | Fixed engine | **Your** LLM |
| Merge gate | Separate tooling | Native GitHub Check |
| Privacy | Vendor by default | **Only** your endpoint |

Strict by default (OWASP / CWE-oriented). Relax when you mean to.

---

## 60-second setup

### 1. Add the workflow

Create `.github/workflows/squidgate.yml`:

```yaml
name: SquidGate

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  squidgate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: SquidGate
        uses: SquidSec/SquidGate@v1
        with:
          llm-api-key: ${{ secrets.LLM_API_KEY }}
```

### 2. Add your LLM API key

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `LLM_API_KEY` | Your provider key |

### 3. Block merges (recommended)

**Settings → Branches → Branch protection** on `main`:

- Require status checks to pass  
- Select **`SquidGate`**

Open a PR. Done.

---

## Using Grok (xAI)

```yaml
- uses: SquidSec/SquidGate@v1
  with:
    llm-api-key: ${{ secrets.LLM_API_KEY }}
    llm-provider: custom
    llm-model: grok-build-0.1
    llm-base-url: https://api.x.ai/v1
```

Key: [console.x.ai](https://console.x.ai/)

---

## Configuration (optional)

Defaults are production-ready. Override with `.github/squidgate.yml`:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o

policy:
  block_on: high            # critical | high | medium | low | none
  min_confidence: medium
  categories:
    secrets: true
    injection: true
    # all categories on by default — set false to disable
  custom_rules:
    - "Never log PII or session tokens"

context:
  lines_before: 30
  max_files: 50
  max_diff_bytes: 500000

output:
  comment_on_pr: true
  annotate_lines: true
  fail_on_error: true
```

Full reference: [docs/configuration.md](docs/configuration.md) · Example: [.github/squidgate.yml.example](.github/squidgate.yml.example)

---

## What it detects

- Hardcoded secrets / API keys / private keys  
- SQL / command / XSS / SSRF / path traversal  
- Insecure deserialization  
- Broken authn / authz patterns  
- Weak crypto (MD5/SHA1 for security, ECB, hardcoded IVs)  
- Dangerous APIs (`eval`, `exec`, `pickle`, `yaml.load`, …)  
- Sensitive data in logs / errors  
- Patterns aligned with **OWASP Top 10**, **API Security Top 10**, **CWE Top 25**

---

## Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `llm-api-key` | **Yes** | — | Provider API key |
| `github-token` | No | `${{ github.token }}` | `checks` + `pull-requests` + `contents` |
| `config-path` | No | `.github/squidgate.yml` | Config path |
| `llm-provider` | No | config / `openai` | `openai` \| `anthropic` \| `azure` \| `google` \| `custom` |
| `llm-model` | No | config / `gpt-4o` | Model id |
| `llm-base-url` | No | — | Azure / custom / xAI URL |
| `block-on` | No | config / `high` | Minimum failing severity |

## Outputs

| Output | Description |
|--------|-------------|
| `findings-count` | Findings after confidence filter |
| `blocking-findings-count` | Findings ≥ `block_on` |
| `conclusion` | `success` \| `failure` |

---

## Privacy

- Diffs go **only** to the LLM endpoint **you** configure  
- SquidSec does **not** receive or store your code  
- Least-privilege permissions; self-hosted runners + private models supported  

→ [docs/privacy.md](docs/privacy.md)

---

## How it works

```
PR opened / updated
        │
        ▼
  Unified diff (+ context)
        │
        ▼
  Policy-aware prompts (temperature 0, JSON)
        │
        ▼
  Your LLM
        │
        ▼
  Filter → annotate → PR comment
        │
        ▼
  Fail check if finding ≥ block_on
```

---

## Development

```bash
git clone https://github.com/SquidSec/SquidGate.git
cd SquidGate
npm ci
npm test
npm run build
```

See [docs/development.md](docs/development.md) · [CONTRIBUTING.md](CONTRIBUTING.md)

---

## SquidSec

Built by **[SquidSec](https://www.SquidOffense.com)** — security tooling that teams actually ship.

- [SquidOffense.com](https://www.SquidOffense.com)  
- [github.com/SquidSec](https://github.com/SquidSec)  
- [SquidScanner](https://github.com/DotNetRussell/SquidScanner) — AI attack-surface analysis  

---

## License

[MIT](LICENSE) © SquidSec
