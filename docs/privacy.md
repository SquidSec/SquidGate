# Privacy & security

## What leaves your runner

On each PR, **SquidGate** sends:

1. The **unified diff** (truncated by `max_diff_bytes`)  
2. **File paths** and language hints  
3. Your **policy configuration**  

to the **LLM HTTP endpoint you configure**. Nothing else.

## What SquidSec does *not* do

- No telemetry back to SquidSec  
- No code retention by the action maintainers  
- No training on your diffs  
- No third-party analytics  

Your relationship is with **your** model provider. Use enterprise / zero-retention options where available.

## Permissions

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

## Secrets

Store keys only in GitHub Actions secrets. Never commit API keys.

## Self-hosted & air-gapped

- Self-hosted runners  
- `llm-provider: custom` + `llm-base-url` → private model  
- Diff never needs to leave your network  

## Supply chain

- Pre-built `dist/index.js` (ncc)  
- Pin `SquidSec/SquidGate@v1` or a full commit SHA  
- CI tests and verifies `dist/` on every push to `main`  
