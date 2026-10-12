# SR-CI-VOICE-CHECKPOINT-PG-20261012

Owner: Codex. Reviewer: Gemini2. Source repair only; hosted acceptance pending.

## Scope and source evidence

- Spec: `/home/lupin/workspace/drts-fleet-platform/.local/full-system-goal-20261011/voice-checkpoint-pg-ci-repair-spec.txt`, SHA-256 `5602577a98f1b28ea4e934757875783a207c189f0f44815c79d1f6c7d6b69e81`.
- Base: `656c64fdb4c1e72035dc917c942cd1c7cedc6193` (`dev`). Observed final release: `a1899b8baa0bfa5878c9eb779ad933019c098973`.
- Existing `tests/integration/uv-exec-010-checkpoint.integration.test.ts` uses `describe.skipIf(!connectionString)` with `UV_RECORDER_TEST_DATABASE_URL`. `beforeAll` creates its own UUID-named database and applies the actual V0086 append-only function, checkpoint table, index and triggers, with a minimal call-session FK prerequisite. `afterAll` drops only that database.
- All four cases call `VoiceCheckpointRepository.appendVerified` or the real checkpoint triggers. The repository implements immutable insert/retry convergence, evidence conflict refusal and transaction composition. No product, migration, test, helper, lockfile or provider edits.
- Product smoke receives the existing GitHub-hosted PostgreSQL admin URL. Its new `if: always()` gate reads the existing `unit-test-results.json`, requires exactly one exact-path suite with a passing suite/hook result, exactly four passing assertions, and all four original full names. Missing/malformed evidence, duplicates, wrong counts and every non-passed status fail closed. Existing gates, artifacts, jobs, timeouts, services and settings are retained.

## Findings and acceptance evidence

| Finding / acceptance | Source and repair | Before → after | Command / version / evidence | Pending / limits |
| --- | --- | --- | --- | --- |
| Existing four checkpoint PG regressions silently skipped | Test opt-in guard; `.github/workflows/ci.yml` Product smoke env and report gate | Actual old report has four `skipped` assertions although suite status is `passed`; new gate validation pending | [CI 38196844265](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38196844265), head `a1899b8baa0bfa5878c9eb779ad933019c098973`; downloaded `test-results` artifact 11724046227 under `.local/SR-CI-VOICE-CHECKPOINT-PG-20261012/old-report/` | No PG or product runtime started on this VM |
| `voice_checkpoint_real_hosted_four_cases_zero_skips` | Existing production repository and V0086 checkpoint tests, enabled by job env | Pending candidate hosted execution | Exact candidate report/run to be read after ordinary PR CI | Local report probes cannot establish real PG acceptance |
| `voice_checkpoint_exact_sha_review_ci_protected_merge` | Candidate lifecycle, assigned independent Gemini2 review | Pending final candidate / review / full CI / protected merge | Final pushed SHA, branch and PR recorded through CLI handoff | Owner does not call `done` or claim deployment |

Original release/tag aliases, separate dev deployment, PAX QA gates and all existing source/history/provider/legal/manual/restore holds remain unchanged. This repair does not establish live/native/PSTN/recording-cloud or production readiness.
