# SquidGate language samples

Open a **sample PR** for your language to see SquidGate annotate real findings (hardcoded secrets, injection, dangerous APIs).

Each PR adds one small demo file under `examples/<language>/` with **intentional** vulnerabilities. Do not copy these patterns into production code.

| # | Language | Sample PR |
|---|----------|-----------|
| 1 | JavaScript | [sample/javascript](https://github.com/SquidSec/SquidGate/compare/main...sample/javascript?expand=1) |
| 2 | TypeScript | [sample/typescript](https://github.com/SquidSec/SquidGate/compare/main...sample/typescript?expand=1) |
| 3 | Python | [sample/python](https://github.com/SquidSec/SquidGate/compare/main...sample/python?expand=1) |
| 4 | Java | [sample/java](https://github.com/SquidSec/SquidGate/compare/main...sample/java?expand=1) |
| 5 | C# | [sample/csharp](https://github.com/SquidSec/SquidGate/compare/main...sample/csharp?expand=1) |
| 6 | Go | [sample/go](https://github.com/SquidSec/SquidGate/compare/main...sample/go?expand=1) |
| 7 | Rust | [sample/rust](https://github.com/SquidSec/SquidGate/compare/main...sample/rust?expand=1) |
| 8 | C++ | [sample/cpp](https://github.com/SquidSec/SquidGate/compare/main...sample/cpp?expand=1) |
| 9 | C | [sample/c](https://github.com/SquidSec/SquidGate/compare/main...sample/c?expand=1) |
| 10 | PHP | [sample/php](https://github.com/SquidSec/SquidGate/compare/main...sample/php?expand=1) |
| 11 | Ruby | [sample/ruby](https://github.com/SquidSec/SquidGate/compare/main...sample/ruby?expand=1) |
| 12 | Swift | [sample/swift](https://github.com/SquidSec/SquidGate/compare/main...sample/swift?expand=1) |
| 13 | Kotlin | [sample/kotlin](https://github.com/SquidSec/SquidGate/compare/main...sample/kotlin?expand=1) |
| 14 | Scala | [sample/scala](https://github.com/SquidSec/SquidGate/compare/main...sample/scala?expand=1) |
| 15 | Shell | [sample/shell](https://github.com/SquidSec/SquidGate/compare/main...sample/shell?expand=1) |
| 16 | Dart | [sample/dart](https://github.com/SquidSec/SquidGate/compare/main...sample/dart?expand=1) |
| 17 | PowerShell | [sample/powershell](https://github.com/SquidSec/SquidGate/compare/main...sample/powershell?expand=1) |
| 18 | SQL | [sample/sql](https://github.com/SquidSec/SquidGate/compare/main...sample/sql?expand=1) |
| 19 | Perl | [sample/perl](https://github.com/SquidSec/SquidGate/compare/main...sample/perl?expand=1) |
| 20 | Lua | [sample/lua](https://github.com/SquidSec/SquidGate/compare/main...sample/lua?expand=1) |

After the sample PRs are opened, this table is updated with direct PR links in the README root “Try it” section.

## What you should see

On each sample PR, SquidGate should:

1. Create a **SquidGate** check run  
2. Annotate lines (secret / injection / dangerous function)  
3. Comment on the PR with a summary  
4. **Fail** the check when severity ≥ `block_on` (default `high`)  

## Run the same patterns on your repo

```yaml
- uses: SquidSec/SquidGate@v1
  with:
    llm-api-key: ${{ secrets.LLM_API_KEY }}
```
