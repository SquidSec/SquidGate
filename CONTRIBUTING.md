# Contributing to SquidGate

<p align="center">
  <a href="https://squidoffense.com/"><img src="assets/squidsec-logo.png" alt="SquidSec" width="100"></a>
</p>

Thanks for helping. **SquidGate** is a [SquidSec](https://squidoffense.com/) open source project.

## Quick path

1. Fork + branch from `main`  
2. `npm ci && npm test`  
3. Make changes; keep modules small and tested  
4. `npm run build` (updates `dist/`)  
5. Open a PR — SquidGate will scan it  

## Guidelines

- **Tests required** for behavior changes  
- **No secrets** in commits  
- Match existing TypeScript style  
- Prefer pure functions in `config` / `prompts` / `llm`  
- Update docs when schema or inputs change  

## Good first PRs

- Provider adapters  
- Better JSON recovery from noisy models  
- Optional SARIF upload  
- Annotation / PR comment UX  
- Docs and monorepo examples  

## Security research

See [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under MIT.
