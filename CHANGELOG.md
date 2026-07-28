# Changelog

All notable changes to **SquidGate** ([SquidSec](https://squidoffense.com/)) are documented here.

Release tags: **`v{semver}-build.{N}`**, with floating **`v1`** / **`v1.0`**.

## [1.0.0] — 2026-07-28

### Added

- Initial public release under MIT as **SquidGate**  
- Diff-first LLM PR security gate (GitHub Action)  
- Providers: OpenAI, Anthropic, Google, Azure, custom (xAI Grok, Ollama, …)  
- Strict default policy (OWASP / CWE-oriented)  
- Configurable `block_on`, confidence filter, custom rules  
- GitHub Check Run (`SquidGate`) + line annotations + optional PR comment  
- Unit tests for config, prompts, parsing, checks  
- SquidSec branding (logo, About section)  
- CI release pipeline: `v1.0.0-build.N` + floating `v1` / `v1.0`  
- Branch protection: SquidGate required to merge to `main`  

- 20 language sample PRs  
