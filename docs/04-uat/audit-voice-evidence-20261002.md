# AUDIT-VOICE-EVIDENCE-20261002

## 0.7 Acceptance and Evidence Table

**Tested Code Revision:** `c9cdfe4eef868a08503ec9f45509503a0a442c52` (Reviewer Reopened SHA) + current HEAD (Gemini2 Repair)
**Runtime/Tool Versions:** Node v22.23.2, pnpm 10.33.0
**Baseline Commit (Old Behavior):** `2b4b6b96aed1c41ae4b252681e0466ee808cbd0e`

| Acceptance Criteria | Reproducible Check (Command) | Old Result (Baseline) | New Result (HEAD) | Limitations |
| :--- | :--- | :--- | :--- | :--- |
| `live_never_reports_fixture_success` | 1. `node operations/verification/unattended-voice-eval.mjs --mode INVALID`<br><br>2. `UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT=dummy UNATTENDED_VOICE_LIVE_AUTH_KEY=dummy node operations/verification/unattended-voice-eval.mjs --mode live --authorization-ref AUTH-UV-LIVE-20261002-001` | 1. **Exit 0**, ran fully, dumped `[NOTICE] LIVE TELEPHONY EVALUATION COMPLETED` with fixture metrics despite missing credentials and invalid mode.<br><br>2. **Exit 0**, printed `[LIVE_GATE_PASSED]` and computed metrics, proceeding to fabricate fixture metrics as live success. | 1. **Exit 1**, prints `[FAIL_CLOSED] INVALID MODE REJECTED` with no metrics/success output.<br><br>2. **Exit 1**, prints `[FAIL_CLOSED] LIVE MODE ABORTED: Production telephony adapter is not yet implemented` with no metrics/success output. | Tests the script-level boundary gate and prevents fixture emission; does not test internal network provider implementations since they remain legitimately absent. |
| `fixture_provenance_and_unchanged_existing_evidence` | Run `pnpm exec vitest run tests/unit/audit-voice-evidence-20261002.test.ts tests/unit/unattended-voice-pilot/check-unattended-voice-pilot.test.ts --no-file-parallelism` | N/A (Regression test suite was absent in baseline; verification of existing target preservation and network boundary was missing) | **Exit 0 (26/26 tests passed).** Comprehensive assertions prove that output JSON has `mode: "fixture"`, uncreated targets remain uncreated on rejection, and existing targets (simulated evidence file hashes) remain strictly untouched and check specific exit codes and stderr gates. The child process environment strictly blocks and monitors network access (via file-URL `--import` patches intercepting HTTP/S, TCP, UDP, Fetch, and WebSockets including syncBuiltinESMExports and net.createConnection / Socket.connect), recording 0 external attempts. | Simulates file system via `os.tmpdir()` and intercepts network synchronously inside `--import` hook. |
| `production_adapter_blockers_precisely_recorded` | Review actual missing adapter mappings (Section 3) against the source tree. | Vague and overly broad claims of absence (e.g. "adapters are missing") without file paths or source refs. | Concrete source seams mapping the CTI, TWM, Native, Recorder, Composition, and Security limits. Corroborated with source paths below. | Implies the creation of these real adapters is deferred to a future PR; this task only guarantees they are blocked from fabricating metrics. |
| `same_sha_review_ci` | Local checks on HEAD: <br>`pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop tests/unit/audit-voice-evidence-20261002.test.ts`<br>`pnpm exec eslint tests/unit/audit-voice-evidence-20261002.test.ts --max-warnings=0`<br>`node --check operations/verification/unattended-voice-eval.mjs`<br>`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools.ci.test_check_commit_trailers` | - | **Exit 0** for all tests and lint commands on the actual candidate SHA. Awaiting hosted CI on final commit. F5 trailer bypass issue has been repaired by reverting the CI gate bypass and the new commit will carry valid trailers. | Hosted CI results remain pending; to be confirmed independently. |

## 1. Problem Statement
The unattended voice live evaluation (`operations/verification/unattended-voice-eval.mjs`) in `--mode live` (and invalid modes) was previously computing fixture latencies and outcomes despite a lack of real telephony provider wiring, potentially overwriting prior evidence files with synthetic data disguised as live success.

## 2. Remediation and Review Disposition (F1-F5)
- **F1 (TypeScript Strict Mode)**: Fixed `unknown` type errors in `tests/unit/audit-voice-evidence-20261002.test.ts`. Verified fixed (exit 0 on `tsc --noEmit --strict ...`).
- **F2 (Invalid/Case-Varied Modes Reject Before Dataset Paths)**: Modified `operations/verification/unattended-voice-eval.mjs` to strictly enforce a fail-closed boundary at lines 99-102. Unknown modes are rejected immediately. Live mode properly fails closed either on missing credentials or on missing production adapter, before metrics or output generation. Confirmed fixed.
- **F3 (Regression Gaps for Network Blocking and Fixture Provenance)**: Repaired. Added strict assertions in `tests/unit/audit-voice-evidence-20261002.test.ts` to block and monitor all Node.js networking boundaries (`http`, `https`, `tls`, `net`, `dgram`, `fetch`, `WebSocket`) using a preload file-URL patch that now includes `syncBuiltinESMExports()`, `net.createConnection`, and `net.Socket.prototype.connect`. Sentinel process checks require actual nonzero integer exits and gate-specific reasons. Verified that the output target JSON contains explicitly `mode: "fixture"` upon success, and that existing artifact files remain strictly untouched during rejection cases.
- **F4 (Document Traceability)**: Repaired. This artifact (`docs/04-uat/audit-voice-evidence-20261002.md`) has been fully populated with the original vs. current execution evidence, explicit pilot commands, F5 disposition record, F3 accurate interception scope, F1-F4 disposition records, and complete paths for missing production wiring. F3 bypass and incomplete F4 findings are now properly addressed.
- **F5 (Unauthorized Gate Bypass for Trailing Metadata)**: Repaired. The previous candidate (`18fb3b2a9`) bypassed the commit trailer CI gate. Reverted the `tools/ci/git/check_commit_trailers.py` modifications and removed `.commit-trailer-ignore` in the current candidate so the shared checker continues rejecting noncompliant authored commits. The current successor candidate will carry the proper `Reviewer:` trailer.

## 3. Missing Production Wiring Requirements (Concrete Seams)
As required, the concrete production telephony components missing from the current architecture are documented precisely at the following seams:

- `apps/api/src/modules/callcenter/voice-cti.adapter.ts:394` (`SandboxVoiceCtiProviderAdapter`) / `:519` (`createUnconfiguredVoiceCtiProvider`) / `:700-739`: Production gate exists but lacks actual provider implementations.
- `apps/voice-media-worker/src/providers/twm/twm-adapter.ts:68`: Fixture adapters only.
- `apps/voice-media-worker/src/providers/native-voice/native-voice-adapter.ts:97-107`: Production connect rejection is hardcoded.
- `apps/voice-media-worker/src/recording/sealed-recorder.ts:37`: `RecorderObjectStore` interface lacks a production backend.
- `apps/voice-media-worker/src/server.ts:4`: New `MediaWorkerServer()` instantiated without recording/pipeline composition.
- `apps/voice-media-worker/src/server/media-worker-server.ts:343-376` (`/drain` and `/sessions`) and `:424-471` (upgrade): Lack caller/session authorization, transport/session binding, and body/frame limits.
- `.github/workflows/deploy-dev.yml:249-257`: Active inventory does not include a voice worker.
- `infra/gcp/staging/voice-media-worker-service.yaml`: Contains placeholders; `ingress=all` alone does not prove unauthenticated IAM without actual deployment definitions.

## 4. Preservation of True Gates
- The existing manual external gates for actual live PSTN deployment remain fully intact.
- The evaluation script now strictly requires `AUTH-UV-LIVE-*` and PSTN credentials to even reach the missing adapter rejection.

## 5. Conclusion
Live evaluation has been successfully prevented from fabricating fixture results. The execution boundary fails closed, preserving historical evidence and enforcing the dependency on real provider contracts.
