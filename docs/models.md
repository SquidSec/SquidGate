# OpenCode Go models

Catalog checked **2026-10-22** against the public [OpenCode Go](https://opencode.ai/v2/docs/console/go/) model list. That catalog changes. This page is documentation, not a live probe.

SquidGate's `opencode-go` provider speaks **OpenAI chat completions** only. It POSTs the existing body (`model`, system and user messages, `temperature` 0, `response_format` `{ "type": "json_object" }`, `max_tokens` 4000) to:

`https://opencode.ai/inference/go/openai/v1/chat/completions`

It also sends `User-Agent: SquidGate/1.0` and `x-opencode-session`. Do not add a local proxy to attach those headers, and do not point this client at a Responses, Anthropic, or Gemini Go URL.

## What a SquidGate model needs

- Served on OpenAI chat completions
- Returns JSON in `message.content` inside the 4000-token budget
- Is not trained on prompts
- Is cheap enough to run on every pull request

## Recommended

**`glm-5.3-flash`**

Go lists GLM-5.3-Flash as not used for training, 0-day retention, and chat completions. The model id is `glm-5.3-flash`. It is the known-good model for this action's existing request body. If `llm-provider` is `opencode-go` and no model is set, or the model is `gpt-4o`, SquidGate uses this id. It does not send `gpt-4o`. A model configured for another provider is not reused when the provider input switches to `opencode-go`.

```yaml
- uses: SquidSec/SquidGate@v1
  with:
    llm-api-key: ${{ secrets.LLM_API_KEY }}
    llm-provider: opencode-go
    llm-model: glm-5.3-flash
```

Store an [OpenCode Console](https://opencode.ai/console) key as the repository secret `LLM_API_KEY`. Never write a key into the workflow. Require status checks job `squidgate` and check run `SquidGate`.

## Same API, not scored

These ids were on Go chat completions on 2026-10-22. They match the request shape only. This is not a quality ranking and not a recommendation.

- `glm-5.3`
- `glm-5.2`
- `kimi-k3`
- `kimi-k2.7-code`
- `longcat-2.0`
- `longcat-2.5-preview-free`
- `deepseek-v4.1-flash`
- `deepseek-v4-pro`

Go's published zero-retention agreement for DeepSeek is renewed monthly and runs through 31 Oct 2026.
- `mimo-v2.6-flash`
- `mimo-v2.6-pro`
- `mimo-v2.5`
- `mimo-v2.5-pro`
- `minimax-m3.1-flash`
- `hy4-preview`
- `hy3`
- `step-5-preview`
- `beam-free`

## Unsupported

These are unsupported because SquidGate does not speak that Go API. They are not model-quality failures.

### Responses

Go serves these on `https://opencode.ai/inference/go/openai/v1/responses`. This action does not call Responses.

- `grok-4.7`
- `gpt-6-luna`
- `gpt-5.6-luna`
- `muse-spark-1.3-contributor`
- `muse-spark-1.2-contributor`

### Anthropic Messages on Go

Go serves these on `https://opencode.ai/inference/go/anthropic/v1/messages`. SquidGate's `anthropic` provider hardcodes `https://api.anthropic.com/v1/messages`, so it cannot reach them.

- `claude-haiku-5-5`
- `qwen3.8-max`
- `qwen3.8-flash`
- `qwen3.7-plus`
- `minimax-m3`

`minimax-m3.1-flash` is a different id and is on chat completions. `minimax-m3` is not.

### Gemini on Go

- `gemini-4-argon-contributor` — Go serves this on the Gemini API (`https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon-contributor`). SquidGate does not speak that API.

Do not send diffs to `gemini-4-argon-contributor`. Go documents that prompts may be used for training.
