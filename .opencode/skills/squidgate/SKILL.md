---
name: squidgate
description: Configure the SquidGate GitHub Action for OpenCode Go using glm-5.3-flash
---

## Configure SquidGate

Use this when adding or updating the SquidGate pull request security gate so it calls OpenCode Go.

1. Set `llm-provider` to `opencode-go` and `llm-model` to `glm-5.3-flash`.
2. Store the OpenCode Console key as the repository secret named `LLM_API_KEY`.
3. Never write an API key into a workflow file. Pass only `${{ secrets.LLM_API_KEY }}`.
4. Require both status checks before merge: job `squidgate` and check run `SquidGate`.
5. Before choosing any model other than `glm-5.3-flash`, read `https://raw.githubusercontent.com/SquidSec/SquidGate/main/docs/models.md`. Do not look for that file in the consumer repository. Do not send Responses-only ids (`grok-4.7`, `gpt-6-luna`, `gpt-5.6-luna`, `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor`), Anthropic Go ids (`claude-haiku-5-5`, `qwen3.8-max`, `qwen3.8-flash`, `qwen3.7-plus`, `minimax-m3`), or `gemini-4-argon-contributor`.
6. Do not invent a local proxy.
7. Do not point a chat-completions client at a Responses, Anthropic, or Gemini Go URL.

```yaml
- uses: SquidSec/SquidGate@v1
  with:
    llm-api-key: ${{ secrets.LLM_API_KEY }}
    llm-provider: opencode-go
    llm-model: glm-5.3-flash
```

`llm-base-url` is ignored for `opencode-go`. The request stays chat completions: `temperature` 0, `response_format` `json_object`, `max_tokens` 4000.
