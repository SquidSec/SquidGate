# SquidGate

<p align="center">
  <a href="https://squidoffense.com/">
    <img src="assets/squidsec-logo.png" alt="SquidSec logo" width="180">
  </a>
</p>

<p align="center">
  <strong>A SquidSec Open Source Project</strong><br>
  <a href="https://squidoffense.com/">SquidOffense.com</a> ·
  <a href="https://github.com/SquidSec/SquidGate">GitHub</a>
</p>

<p align="center">
  <a href="https://github.com/SquidSec/SquidGate/actions/workflows/ci.yml"><img src="https://github.com/SquidSec/SquidGate/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/SquidSec/SquidGate/actions/workflows/release.yml"><img src="https://github.com/SquidSec/SquidGate/actions/workflows/release.yml/badge.svg" alt="Build and Release"></a>
  <a href="https://github.com/SquidSec/SquidGate/releases/latest"><img src="https://img.shields.io/github/v/release/SquidSec/SquidGate?label=latest%20build" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="action.yml"><img src="https://img.shields.io/badge/GitHub%20Action-ready-2088FF?logo=githubactions&logoColor=white" alt="GitHub Action"></a>
</p>

**SquidGate** is an open source LLM-powered **PR security gate** for GitHub, created and managed by **[SquidSec](https://squidoffense.com/)**. It analyzes pull request diffs, posts annotated findings, and fails the check when issues cross your severity threshold — so you can block merges with standard branch protection.

| | |
|--|--|
| **Organization** | [SquidSec](https://squidoffense.com/) |
| **Website** | [https://squidoffense.com/](https://squidoffense.com/) |
| **App version** | **v1.0.0** |
| **Latest release** | [![GitHub release](https://img.shields.io/github/v/release/SquidSec/SquidGate)](https://github.com/SquidSec/SquidGate/releases/latest) |
| **Pin in workflows** | `SquidSec/SquidGate@v1` |
| **License** | [MIT](LICENSE) |
| **Runtime** | Node 20 (bundled action) |

Merges to `main` automatically run tests, rebuild the action bundle, and publish a GitHub Release (tag `v1.0.0-build.N`). The floating tags **`v1`** and **`v1.0`** always point at the latest successful build for that line.

---

## About SquidSec

SquidGate is built and maintained by **[SquidSec](https://squidoffense.com/)** for the security community — appsec engineers, platform teams, and developers who want a merge-blocking PR gate without standing up a full SAST platform.

- **Website:** [https://squidoffense.com/](https://squidoffense.com/)
- **Project:** [https://github.com/SquidSec/SquidGate](https://github.com/SquidSec/SquidGate)
- **Related:** [BloodBash](https://github.com/SquidSec/BloodBash) · [SquidScanner](https://github.com/DotNetRussell/SquidScanner)

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
| `LLM_API_KEY` | Your provider key (OpenAI, xAI, Anthropic, …) |

### 3. Block merges (recommended)

**Settings → Branches → Branch protection** on `main`:

- Require status checks to pass  
- Select **`SquidGate`**

Open a PR. Done.

---

## Try it on your language

**20 open sample PRs** — one per major language — each with intentional findings:

**[Browse language sample PRs →](examples/README.md)**

| | | | |
|--|--|--|--|
| [JavaScript](https://github.com/SquidSec/SquidGate/pull/2) | [TypeScript](https://github.com/SquidSec/SquidGate/pull/3) | [Python](https://github.com/SquidSec/SquidGate/pull/4) | [Java](https://github.com/SquidSec/SquidGate/pull/5) |
| [C#](https://github.com/SquidSec/SquidGate/pull/6) | [Go](https://github.com/SquidSec/SquidGate/pull/7) | [Rust](https://github.com/SquidSec/SquidGate/pull/8) | [C++](https://github.com/SquidSec/SquidGate/pull/9) |
| [C](https://github.com/SquidSec/SquidGate/pull/10) | [PHP](https://github.com/SquidSec/SquidGate/pull/11) | [Ruby](https://github.com/SquidSec/SquidGate/pull/12) | [Swift](https://github.com/SquidSec/SquidGate/pull/13) |
| [Kotlin](https://github.com/SquidSec/SquidGate/pull/14) | [Scala](https://github.com/SquidSec/SquidGate/pull/15) | [Shell](https://github.com/SquidSec/SquidGate/pull/16) | [Dart](https://github.com/SquidSec/SquidGate/pull/17) |
| [PowerShell](https://github.com/SquidSec/SquidGate/pull/18) | [SQL](https://github.com/SquidSec/SquidGate/pull/19) | [Perl](https://github.com/SquidSec/SquidGate/pull/20) | [Lua](https://github.com/SquidSec/SquidGate/pull/21) |

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

## Why SquidGate?

| | Traditional SAST | SquidGate |
|---|---|---|
| Languages | Per-language rules | Any text-based source |
| Setup | Days of tuning | **~2 minutes** |
| Context | Whole-repo noise | **Diff-first** + context |
| Model | Fixed engine | **Your** LLM |
| Merge gate | Separate tooling | Native GitHub Check |
| Privacy | Vendor by default | **Only** your endpoint |

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
  custom_rules: []

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
- Weak crypto · dangerous APIs (`eval`, `exec`, `pickle`, …)  
- Patterns aligned with **OWASP Top 10**, **API Security Top 10**, **CWE Top 25**

---

## Versions & tags

| Tag | Meaning | Use when |
|-----|---------|----------|
| `v1` | Latest stable major (floating) | **Recommended** for most repos |
| `v1.0` | Latest 1.0.x line (floating) | Minor pin |
| `v1.0.0` | Exact semver release | Rare; prefer build tags below |
| `v1.0.0-build.N` | Immutable CI build from `main` | Audit / pin to a known build |

```yaml
# Recommended
uses: SquidSec/SquidGate@v1

# Pin to an immutable build
uses: SquidSec/SquidGate@v1.0.0-build.12

# Or full commit SHA
uses: SquidSec/SquidGate@abc123def
```

**All releases:** https://github.com/SquidSec/SquidGate/releases  
**Latest:** https://github.com/SquidSec/SquidGate/releases/latest  

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

## License

[MIT](LICENSE) © SquidSec
