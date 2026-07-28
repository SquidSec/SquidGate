# Development

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

**Always commit an updated `dist/`** after source changes.

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
```

## Releasing

```bash
npm test && npm run build
git add dist && git commit -m "build: refresh dist"
git tag v1.0.1 && git push origin v1.0.1
# optional major floating tag:
git tag -f v1 && git push -f origin v1
```

Consumers should pin `@v1` or a full SHA.
