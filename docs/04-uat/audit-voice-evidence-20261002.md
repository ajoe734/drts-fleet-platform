# AUDIT-VOICE-EVIDENCE-20261002

## 0.7 Acceptance and Evidence Table

| Acceptance Criteria | Reproducible Check (Command) | Old Result | New Result | Limitations |
| :--- | :--- | :--- | :--- | :--- |
| `live_never_reports_fixture_success` | `node operations/verification/unattended-voice-eval.mjs --mode LIVE` (and other invalid modes) | Exit 0, printed "LIVE TELEPHONY EVALUATION COMPLETED" with fixture metrics | Exit 1, printed "[FAIL_CLOSED] INVALID MODE REJECTED" or "LIVE MODE ABORTED" with no metrics | Exclusively tests script boundary, not internal provider internals (which are absent) |
| `fixture_provenance_and_unchanged_existing_evidence` | Run `pnpm exec vitest run tests/unit/audit-voice-evidence-20261002.test.ts` (the "existing evidence unchanged" case) | N/A (Test didn't exist) | Exit 0, existing evidence file hash/sentinel verified intact, fixture notice printed | Relies on unit test fs.mkdtemp wrapper to simulate evidence file |
| `production_adapter_blockers_precisely_recorded` | See Section 3 (Missing Production Wiring Requirements) | Vague broad absence claims | Concrete source seams, file paths, and deployment placeholders mapped | Still requires actual provider implementation in future PRs |
| `same_sha_review_ci` | Candidate CI and reviewer SHA mapping | Reopened with findings | Awaiting Review CI | To be verified in CI |

## 1. Problem Statement
The unattended voice live evaluation (`operations/verification/unattended-voice-eval.mjs`) in `--mode live` (and invalid modes) was previously computing fixture latencies and outcomes despite a lack of real telephony provider wiring, potentially overwriting prior evidence files with synthetic data disguised as live success.

## 2. Remediation
- **Separation of Fixture from Live**: Modified `operations/verification/unattended-voice-eval.mjs` to strictly enforce a fail-closed boundary. Unknown modes are rejected immediately. Live mode properly fails closed either on missing credentials or on missing production adapter, before metrics or output generation.
- **TypeScript and Unit Tests Fixes**: Fixed `unknown` type errors in `tests/unit/audit-voice-evidence-20261002.test.ts`. Added comprehensive behavioral regressions enforcing invalid modes, authorization gates, credential requirements, preservation of existing evidence files, and verification of fixture provenance outputs.

## 3. Missing Production Wiring Requirements (Concrete Seams)
As required, the concrete production telephony components missing from the current architecture are documented precisely at the following seams:

- `apps/api/src/modules/callcenter/voice-cti.adapter.ts:394` (`SandboxVoiceCtiProviderAdapter`) / `:519` (`createUnconfiguredVoiceCtiProvider`) / `:700-739`: Production gate exists but lacks actual provider implementations.
- `apps/voice-media-worker/src/providers/twm/twm-adapter.ts:68`: Fixture adapters only.
- `providers/native-voice/native-voice-adapter.ts:97-107`: Production connect rejection is hardcoded.
- `recording/sealed-recorder.ts:37`: `RecorderObjectStore` interface lacks a production backend.
- `server.ts:4`: New `MediaWorkerServer()` instantiated without recording/pipeline composition.
- `server/media-worker-server.ts:343-376` (`/drain` and `/sessions`) and `:424-471` (upgrade): Lack caller/session authorization, transport/session binding, and body/frame limits.
- `.github/workflows/deploy-dev.yml:249-257`: Active inventory does not include a voice worker.
- `infra/gcp/staging/voice-media-worker-service.yaml`: Contains placeholders; `ingress=all` alone does not prove unauthenticated IAM without actual deployment definitions.

## 4. Preservation of True Gates
- The existing manual external gates for actual live PSTN deployment remain fully intact.
- The evaluation script now strictly requires `AUTH-UV-LIVE-*` and PSTN credentials to even reach the missing adapter rejection.

## 5. Conclusion
Live evaluation has been successfully prevented from fabricating fixture results. The execution boundary fails closed, preserving historical evidence and enforcing the dependency on real provider contracts.
