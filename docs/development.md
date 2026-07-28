# Development

**SquidGate** — a [SquidSec](https://squidoffense.com/) open source project.

## Prerequisites

- Node.js 20+  
- npm 10+  

## Setup

```bash
git clone https://github.com/SquidSec/SquidGate.git
cd SquidGate
npm ci
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm test` | Unit tests |
| `npm run test:coverage` | Coverage |
| `npm run build:ts` | TypeScript → `lib/` |
| `npm run package` | ncc → `dist/index.js` |
| `npm run build` | compile + bundle |

**Always commit an updated `dist/`** after source changes (CI enforces this).

## Layout

```
src/
  index.ts      # Entry — diff fetch, orchestration
  config.ts     # YAML, defaults, filtering
  prompts.ts    # System / user prompts
  llm.ts        # Providers + JSON extraction
  checks.ts     # Check Run + PR comments
  types.ts
__tests__/
dist/           # Published bundle (committed)
action.yml
assets/         # SquidSec branding
```

## Versioning & releases

| Tag | Created by | Purpose |
|-----|------------|---------|
| `v1.0.0-build.N` | CI on every `main` push | Immutable build |
| `v1.0.0` | CI (floating to latest build of that semver) | Exact line |
| `v1.0` | CI floating | Minor pin |
| `v1` | CI floating | **Recommended consumer pin** |

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

Base version lives in `package.json` (`version` field). Bump it intentionally for breaking/feature releases; build number comes from `github.run_number`.

### Manual release (maintainers)

Usually unnecessary — push to `main` is enough. To force a version bump:

```bash
# edit package.json version, e.g. 1.1.0
npm test && npm run build
git add -A && git commit -m "release: v1.1.0"
git push origin main
# CI tags v1.1.0-build.N and moves v1 / v1.1
```

## Consumer pin examples

```yaml
uses: SquidSec/SquidGate@v1
uses: SquidSec/SquidGate@v1.0
uses: SquidSec/SquidGate@v1.0.0-build.12
```
