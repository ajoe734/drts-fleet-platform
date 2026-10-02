# AUDIT-VOICE-EVIDENCE-20261002

## 1. Problem Statement
The unattended voice live evaluation (`operations/verification/unattended-voice-eval.mjs`) in `--mode live` was previously computing fixture latencies and outcomes despite a lack of real telephony provider wiring, potentially overwriting prior evidence files with synthetic data disguised as live success.

## 2. Remediation
- **Separation of Fixture from Live**: Modified `operations/verification/unattended-voice-eval.mjs` to strictly enforce a fail-closed boundary. When `--mode live` is executed, the script now aborts after the authorization gate with an explicit error indicating that the production adapter is missing. It halts before any fixture metrics are calculated or output is generated.
- **Fixture Provenance**: The script output prominently displays `[NOTICE] FIXTURE MODE EVALUATION COMPLETED` in fixture mode, clarifying that it does not claim production PSTN quality or SLA.
- **Behavior Regressions Added**: Authored `tests/unit/audit-voice-evidence-20261002.test.ts` to assert that live mode properly fails closed (both when credentials are omitted and when valid-looking credentials are provided but the production adapter is un-wired) and that fixture mode completes successfully without network side effects.

## 3. Missing Production Wiring Requirements (F06 Preparation)
As recorded during this audit, the following concrete production telephony components are completely missing from the current architecture. A real provider adapter must be wired before live mode can truly be executed:

- **Missing CTI/ASR/TTS Providers**: No production carrier or provider adapters exist for PSTN telephony integration, Automatic Speech Recognition, or Text-to-Speech generation.
- **Missing Audio Recorder & Worker Wiring**: There is no live architecture for streaming, persisting, or analyzing real bidirectional audio recordings from live carrier sessions.
- **Missing Safe Transport/Auth**: Production telephony requires proper TLS transport and secure exchange of provider API keys that are missing. The current environment gate checks `UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT` and `UNATTENDED_VOICE_LIVE_AUTH_KEY`, but there is no underlying codebase (e.g., SIP/WSS transports) to use them.

## 4. Preservation of True Gates
- The existing manual external gates for actual live PSTN deployment (`test_telephony_authorization`, `sandbox_dispatch_isolation_evidence`, `live_bidirectional_recording_evidence`, `live_barge_in_dtmf_transfer_evidence`) remain fully intact and unmet, requiring true physical telephony enablement.
- Previously synthetic acceptance criteria have NOT been set to pass.

## 5. Conclusion
Live evaluation has been successfully prevented from fabricating fixture results. The execution boundary fails closed, preserving historical evidence and enforcing the dependency on real provider contracts.
