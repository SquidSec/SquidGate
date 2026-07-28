## SquidGate v1.0.0 — GitHub Marketplace

**SquidGate** is an open source LLM-powered **PR security gate** by [SquidSec](https://squidoffense.com/).

It analyzes pull request diffs, posts annotated findings (secrets, injection, dangerous APIs, OWASP/CWE patterns), and **fails the check** so branch protection can **block merge**.

### Marketplace categories (select when publishing)

| | |
|--|--|
| **Primary** | Security |
| **Secondary** | Continuous integration |

### Install

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
      - uses: SquidSec/SquidGate@v1
        with:
          llm-api-key: ${{ secrets.LLM_API_KEY }}
```

### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `llm-api-key` | Yes | Your LLM API key (secret) |
| `llm-provider` | No | `openai` · `anthropic` · `azure` · `google` · `custom` |
| `llm-model` | No | e.g. `gpt-4o`, `grok-build-0.1` |
| `llm-base-url` | No | xAI / Azure / Ollama endpoint |
| `block-on` | No | Fail at `high` (default), `critical`, `medium`, `low`, or `none` |

### Highlights

- Language-agnostic (diff-first)
- Strict-by-default policy (tunable)
- OpenAI, Anthropic, Google, Azure, Grok/xAI, Ollama
- Line annotations + optional PR comment
- Native GitHub Check named **SquidGate**

### Links

- Docs: https://github.com/SquidSec/SquidGate#60-second-setup  
- Config: https://github.com/SquidSec/SquidGate/blob/main/docs/configuration.md  
- Privacy: https://github.com/SquidSec/SquidGate/blob/main/docs/privacy.md  
- Website: https://squidoffense.com/  
- License: MIT  

---

**Pin:** `SquidSec/SquidGate@v1` · Immutable: `SquidSec/SquidGate@v1.0.0`
