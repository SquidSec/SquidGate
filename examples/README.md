# SquidGate language samples

<p align="center">
  <a href="https://squidoffense.com/">
    <img src="../assets/squidsec-logo.png" alt="SquidSec logo" width="120">
  </a>
</p>

<p align="center"><strong>A SquidSec Open Source Project</strong> · <a href="https://squidoffense.com/">SquidOffense.com</a></p>

Open a **sample PR** for your language to see SquidGate annotate real findings (hardcoded secrets, injection, dangerous APIs).

Each PR adds one small demo file under `examples/<language>/` with **intentional** vulnerabilities. Do not copy these patterns into production code.

| # | Language | Sample PR |
|---|----------|-----------|
| 1 | JavaScript | [#2](https://github.com/SquidSec/SquidGate/pull/2) |
| 2 | TypeScript | [#3](https://github.com/SquidSec/SquidGate/pull/3) |
| 3 | Python | [#4](https://github.com/SquidSec/SquidGate/pull/4) |
| 4 | Java | [#5](https://github.com/SquidSec/SquidGate/pull/5) |
| 5 | C# | [#6](https://github.com/SquidSec/SquidGate/pull/6) |
| 6 | Go | [#7](https://github.com/SquidSec/SquidGate/pull/7) |
| 7 | Rust | [#8](https://github.com/SquidSec/SquidGate/pull/8) |
| 8 | C++ | [#9](https://github.com/SquidSec/SquidGate/pull/9) |
| 9 | C | [#10](https://github.com/SquidSec/SquidGate/pull/10) |
| 10 | PHP | [#11](https://github.com/SquidSec/SquidGate/pull/11) |
| 11 | Ruby | [#12](https://github.com/SquidSec/SquidGate/pull/12) |
| 12 | Swift | [#13](https://github.com/SquidSec/SquidGate/pull/13) |
| 13 | Kotlin | [#14](https://github.com/SquidSec/SquidGate/pull/14) |
| 14 | Scala | [#15](https://github.com/SquidSec/SquidGate/pull/15) |
| 15 | Shell | [#16](https://github.com/SquidSec/SquidGate/pull/16) |
| 16 | Dart | [#17](https://github.com/SquidSec/SquidGate/pull/17) |
| 17 | PowerShell | [#18](https://github.com/SquidSec/SquidGate/pull/18) |
| 18 | SQL | [#19](https://github.com/SquidSec/SquidGate/pull/19) |
| 19 | Perl | [#20](https://github.com/SquidSec/SquidGate/pull/20) |
| 20 | Lua | [#21](https://github.com/SquidSec/SquidGate/pull/21) |

## What you should see

1. Check run named **SquidGate**  
2. Line annotations on the sample file  
3. PR comment summarizing findings  
4. Check **failure** when severity ≥ `block_on` (default `high`)  

## Use on your repo

```yaml
- uses: SquidSec/SquidGate@v1
  with:
    llm-api-key: ${{ secrets.LLM_API_KEY }}
```

Pin an immutable build: `SquidSec/SquidGate@v1.0.0-build.N` — see [Releases](https://github.com/SquidSec/SquidGate/releases).
