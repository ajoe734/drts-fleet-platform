# Platform Admin OpenClaw Bootstrap And Runtime Profile

Status: implemented for dev bootstrap
Date: 2026-06-03
Owner: Codex2
Task: PA-AI-INTG-001

## 1. Scope

This repo now carries a repo-local OpenClaw bootstrap path for Platform Admin
assistant experiments and dev-side worker evaluation. The goal is to make the
OpenClaw runtime reproducible without turning the repo into a general-purpose
OpenClaw fork and without requiring repo-local provider secrets.

The integration is intentionally bounded:

- OpenClaw is pinned as an external runtime, not vendored source.
- The runtime profile is isolated with repo-local `OPENCLAW_HOME` and
  `OPENCLAW_CONFIG_PATH`.
- The default smoke profile denies filesystem mutation, `exec`, browser, and
  generic web search.
- DRTS access is exposed through a repo-local MCP stub that only returns
  bounded machine-truth slices and guardrail-safe stub data.

## 2. Pinned Fetch Strategy

Pinned metadata lives in `.orchestrator/openclaw/pin.json`.

Current pin:

- Package: `openclaw`
- Version: `2026.5.28`
- GitHub release tag: `v2026.5.28`
- Release commit: `e932160`
- npm tarball integrity:
  `sha512-p7jGN9wzCrqEvHNI6Y7+eh6DWoYDzJ1iQGKTm8xqQ2uQ9/2mY1CCf87WoZeb0+m3eHKSGchlI3tN33fE1lMtEA==`

Bootstrap script:

- `.orchestrator/bin/openclaw-bootstrap.sh`

Behavior:

1. Reads the pinned package, version, tarball URL, and integrity from
   `pin.json`.
2. Verifies local Node satisfies the pinned OpenClaw engine floor
   (`>=22.19.0`).
3. Downloads the exact npm tarball into `.local/openclaw/cache/`.
4. Verifies the tarball against the pinned SHA-512 integrity string.
5. Installs the tarball into `.local/openclaw/install/<version>/` using
   `npm install --prefix`, then updates `.local/openclaw/current`.

Pinned companion plugin:

- `@openclaw/codex@2026.5.28`

The launcher ensures this plugin is installed into the isolated OpenClaw home
before executing user commands, because `openai/gpt-*` Codex-backed runs need
the external `codex` plugin in this OpenClaw release line.

This keeps the fetched runtime out of git while still making the installed
artifact deterministic from committed metadata.

## 3. Repo-Local Runtime Profile

Launcher:

- `.orchestrator/bin/openclaw-launch.sh`

Committed template:

- `.orchestrator/openclaw/runtime-profile.template.json`

Generated runtime files:

- `OPENCLAW_HOME=.local/openclaw/home/platform-admin`
- `OPENCLAW_CONFIG_PATH=.local/openclaw/home/platform-admin/openclaw.json`

Safe defaults in the generated profile:

- workspace is the current repo root
- default model is `openai/gpt-5.5` unless `DRTS_OPENCLAW_MODEL` overrides it
- agent id is `main` so OpenClaw can reuse its default-agent auth bootstrap and
  read-through behavior
- tool profile starts from `coding`
- denied tools:
  `group:fs`, `exec`, `process`, `write`, `edit`, `apply_patch`, `browser`,
  `web_search`, `cron`, `image_generate`, `music_generate`,
  `video_generate`
- repo-local MCP server `drts-local` is preconfigured

The launcher always rewrites the generated config from the committed template,
so local drift in `openclaw.json` does not silently become machine truth.

## 4. DRTS Tool Adapter And Credential Injection

Adapter:

- `.orchestrator/adapters/openclaw_drts_mcp.py`
- `.orchestrator/bin/openclaw-prepare-auth-bridge.sh`

Bounded tools exposed to OpenClaw:

- `drts_runtime_profile`
- `drts_task_slice`
- `drts_echo_guarded`

These tools are deliberately narrow:

- `drts_task_slice` shells only to `scripts/ai-status.sh show <id>`
  with a task-id regex guard.
- `drts_runtime_profile` returns booleans about injected credentials but never
  reveals token contents.
- `drts_echo_guarded` is a stub adapter for smoke verification.

Credential handling:

- No provider secrets are committed to the repo.
- No DRTS bearer token is written into `openclaw.json`.
- No OpenAI/Codex OAuth tokens are written into tracked repo files.
- If `DRTS_OPENCLAW_IAP_TOKEN_COMMAND` is provided, the launcher executes it at
  runtime and exports the result only into the OpenClaw child process as
  `DRTS_OPENCLAW_BEARER_TOKEN`.
- If a caller already exports `DRTS_OPENCLAW_BEARER_TOKEN`, the launcher uses
  it as-is and marks the MCP environment with `DRTS_OPENCLAW_TOKEN_INJECTED=true`.
- `openclaw-prepare-auth-bridge.sh` reads the existing host Codex login store
  (`${CODEX_HOME:-~/.codex}/auth.json` by default), writes a canonical
  `auth-profiles.json` bridge under `${XDG_STATE_HOME:-~/.local/state}/drts-openclaw/`,
  and symlinks the isolated agent's `auth-profiles.json` to that external
  bridge file.
- OpenClaw provider auth therefore comes from native host login state or
  shell-provided env, not from committed repo files and not from repo-local
  secret blobs.

This satisfies the direct-adoption guardrail from PA-AI-OSS-001: the repo wires
OpenClaw to ephemeral environment inputs and bounded adapters rather than broad,
long-lived repo-local credentials.

## 5. Usage

Bootstrap only:

```bash
.orchestrator/bin/openclaw-bootstrap.sh
```

Validate the generated isolated profile:

```bash
.orchestrator/bin/openclaw-launch.sh config validate
```

Run a one-shot local agent turn:

```bash
.orchestrator/bin/openclaw-launch.sh agent --local --agent main \
  --session-key drts-smoke --thinking minimal \
  --message "Call drts_runtime_profile and summarize it."
```

Run the repo smoke helper:

```bash
.orchestrator/bin/openclaw-smoke.sh
```

The smoke helper writes:

- agent JSON output under `.local/openclaw/smoke/`
- MCP call evidence under `.local/openclaw/smoke/*-mcp.jsonl`

## 6. Upgrade And Rollback

Upgrade steps:

1. Update `.orchestrator/openclaw/pin.json` with the new stable release tag,
   tarball URL, integrity, and release commit.
2. Re-run `.orchestrator/bin/openclaw-bootstrap.sh`.
3. Re-run `.orchestrator/bin/openclaw-launch.sh config validate`.
4. Re-run `.orchestrator/bin/openclaw-smoke.sh`.
5. Review OpenClaw release notes for new tool defaults, MCP behavior, auth
   behavior, and runtime-policy changes before widening access.

Rollback steps:

1. Restore the previous `pin.json`.
2. Re-run the bootstrap script.
3. Point `.local/openclaw/current` back to the older installed version by
   re-running bootstrap with the restored pin.
4. Re-run config validation and smoke.

The rollback contract is intentionally cheap because installs are versioned by
directory and selected by the committed pin, not by a mutable global package.

## 7. Smoke Acceptance Notes

Expected acceptance path for this task:

1. `openclaw-bootstrap.sh` installs the pinned runtime locally.
2. `openclaw-launch.sh config validate` succeeds.
3. `openclaw-smoke.sh` runs `openclaw agent --local`.
4. The MCP log proves at least one `tools/call` request hit the bounded DRTS
   adapter.

That smoke is sufficient for PA-AI-INTG-001 because the task only requires an
isolated start plus one bounded DRTS tool or stub adapter invocation, not a
full live control-plane mutation path.
