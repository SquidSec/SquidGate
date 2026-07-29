# Changelog

All notable changes to **SquidGate** ([SquidSec](https://squidoffense.com/)) are documented here.

Release tags: **`v{semver}-build.{N}`**, with floating **`v1`** / **`v1.0`**.

## Unreleased

### Fixed / Improved

- **Diff acquisition:** prefer GitHub API (fork/shallow-safe); git fallback uses `merge-base` and multiple base candidates; honor `lines_before` / `lines_after` via unified context
- **LLM resilience:** retries with exponential backoff on 429/5xx; Anthropic/Google re-prompt on JSON parse failure
- **JSON extraction:** balanced-brace parser (nested objects / braces in strings); surface `parse_error` on the check summary
- **Category filtering:** post-filter findings against `policy.categories` (plus CWE/text inference when `category` omitted)
- **Prompts:** few-shot secret/injection examples; disabled-category instructions; `category` field in schema
- **Checks:** single `shouldBlock` implementation; truncation warnings in check output
- **`block_on: none`:** correctly never blocks merge

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
