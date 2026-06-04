# Platform Admin LLM Assistant Design & Development Plan

Status: implementation-aligned backend configuration baseline
Last updated: 2026-06-02

## 1. Scope

This document defines the backend-only runtime configuration and deployment guardrails for the Platform Admin assistant. Provider credentials stay in API runtime only. `platform-admin-web` may receive a public feature toggle, but no provider selection, model identifiers beyond UI-safe visibility, or API keys.

## 2. Delivery Goals

- enable the API runtime to boot with an explicit assistant feature gate
- keep local development and CI green without requiring a real LLM provider key
- reserve real provider credentials for Secret Manager backed API deployment only
- prevent `platform-admin-web` from receiving provider credentials through build-time or runtime env injection

## 3. Backend Runtime Contract

The API runtime owns these env vars:

| Variable                                | Purpose                                                   | Default           |
| --------------------------------------- | --------------------------------------------------------- | ----------------- |
| `PLATFORM_ADMIN_ASSISTANT_ENABLED`      | master feature flag for assistant backend routes/services | `false`           |
| `LLM_GATEWAY_PROVIDER`                  | requested provider slug (`mock`, `openai`, etc.)          | `mock`            |
| `LLM_GATEWAY_API_KEY`                   | provider credential from Secret Manager                   | unset             |
| `LLM_GATEWAY_BASE_URL`                  | optional provider-compatible base URL override            | unset             |
| `LLM_GATEWAY_CHAT_MODEL`                | primary assistant response model                          | `mock-chat-v1`    |
| `LLM_GATEWAY_SUMMARIZER_MODEL`          | cheaper summarization / compression model                 | `mock-summary-v1` |
| `LLM_GATEWAY_DAILY_BUDGET_USD`          | soft daily budget ceiling                                 | `25`              |
| `LLM_GATEWAY_REQUESTS_PER_MINUTE`       | request rate ceiling                                      | `30`              |
| `LLM_GATEWAY_INPUT_TOKENS_PER_MINUTE`   | aggregate input token ceiling                             | `120000`          |
| `LLM_GATEWAY_OUTPUT_TOKENS_PER_MINUTE`  | aggregate output token ceiling                            | `16000`           |
| `LLM_GATEWAY_TRANSCRIPT_RETENTION_DAYS` | assistant conversation retention window                   | `30`              |

## 4. Mock Provider Policy

- `mock` is the default provider.
- If a real provider is requested without `LLM_GATEWAY_API_KEY`, the runtime falls back to `mock` in local development and CI.
- If production enables the assistant with a non-`mock` provider and no key, startup must fail fast.
- `LLM_GATEWAY_BASE_URL` may point at an OpenAI-compatible gateway such as OpenRouter or a local Ollama bridge.

This keeps local/CI test surfaces deterministic while still making production misconfiguration visible.

## 5. Frontend Runtime Boundary

`platform-admin-web` may read:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED`

`platform-admin-web` must not receive:

- `LLM_GATEWAY_API_KEY`
- `LLM_GATEWAY_PROVIDER`
- model names
- budget or rate-limit values

The frontend should treat the assistant enabled flag as a pure UI capability toggle and continue routing all assistant traffic through the existing API origin.

## 6. Staging Deployment Shape

`infra/gcp/staging/api-service.yaml` should mount:

- assistant feature flag
- provider slug
- model names
- budget / rate / retention limits
- `LLM_GATEWAY_API_KEY` from Secret Manager secret `drts-staging-llm-gateway-api-key`

`infra/gcp/staging/platform-admin-web-service.yaml` should mount only:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED`

## 7. Secret Manager Naming

Use environment-specific secrets:

| Environment | Secret name                        |
| ----------- | ---------------------------------- |
| dev         | `drts-dev-llm-gateway-api-key`     |
| staging     | `drts-staging-llm-gateway-api-key` |
| prod        | `drts-prod-llm-gateway-api-key`    |

Only the API Cloud Run service account should receive `roles/secretmanager.secretAccessor` on these secrets. The `platform-admin-web` service account must not receive access.

## 8. Runtime / Secret Rollout Plan

1. Create the environment-specific `drts-<env>-llm-gateway-api-key` secrets in Secret Manager.
2. Bind the API runtime service account for each environment to `roles/secretmanager.secretAccessor` on the matching secret.
3. Set `PLATFORM_ADMIN_ASSISTANT_ENABLED=false` plus `LLM_GATEWAY_PROVIDER=mock` by default until a real provider rollout is approved.
4. When enabling a real provider, set the requested provider slug and model names in the API service env, then store the real API key only in the API secret.
5. Propagate only `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED` to `platform-admin-web`.
6. `deploy-dev.yml` may auto-switch dev API runtime from `mock` to the configured real provider when `drts-dev-llm-gateway-api-key` exists; without that secret it stays on `mock`.
7. Keep `NEXT_PUBLIC_API_URL` unchanged so the frontend continues talking to the normal control-plane API origin.

This section is the deployment baseline for dev, staging, and prod until a later task introduces real assistant routes and persistence.
