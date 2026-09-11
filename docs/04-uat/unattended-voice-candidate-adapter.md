# Unattended Voice Candidate Adapter: OpenAI Realtime Single Candidate Selection & Fair Comparison Report

- **Task ID**: `UV-EXEC-026`
- **Workstream**: `native-voice-comparison`
- **Phase**: `unattended-voice-booking-20260906`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Associated Requirements**: `UV-FR-003`, `UV-FR-007`, `UV-FR-010`, `UV-FR-011`, `UV-FR-031`
- **Acceptance Criterion**: `UV-AC-033`
- **Date**: `2026-09-10`

---

## 1. Single Candidate Selection Record (`single_candidate_selection_record`)

### 1.1 Candidate Selection & Rationale
In strict compliance with System Design (SD) §14.1 and the task brief instructions ("依 SD §14 從已列 OpenAI Realtime/Gemini Live 等原生語音候選挑一個具可查文件接口的最小對照 adapter。以同一工具/proof/transaction gate 跑 fixture；不擴張成全供應商/全部編排框架同時實作，正式帳號門檻在027/028"), **OpenAI Realtime** was selected as the sole candidate adapter for this fair comparison:

| Attribute | Specification | Justification & Architectural Alignment |
| :--- | :--- | :--- |
| **Candidate ID** | `openai_realtime` | Pinned candidate key in `models-profiles.json` and evaluation harness. |
| **Provider** | `openai` | Primary commercial native speech-to-speech provider candidate. |
| **Model ID** | `gpt-4o-realtime-preview-2024-12-17` | Documented OpenAI Realtime model snapshot with stable function calling. |
| **Protocol Version** | `v1` | Bidirectional WebSocket `/v1/realtime` client/server wire protocol. |
| **Telephony Codec** | G.711u (`g711_ulaw`, 8,000 Hz, 1 channel, 20ms framing) | Natively matches carrier CTI / SIP trunk audio format, eliminating multi-stage transcoding bridges. |
| **Voice Persona** | `shimmer` | Documented female voice profile for Mandarin telephony service. |
| **Turn Detection** | `server_vad` (threshold: 0.5, silence: 300ms) | Low-latency server-side voice activity detection. |

### 1.2 Comparison Against Alternative Candidates
While Gemini Live (`gemini-2.0-flash-exp`) is also listed in SD §14 as an alternative candidate, OpenAI Realtime was selected for this minimal fair comparison adapter because:
1. **Direct Telephony Protocol Alignment**: OpenAI explicitly documents native SIP trunk integration (`realtime-sip`) and native G.711u/a codecs at 8 kHz, whereas Gemini Live requires PCM16 (16/24 kHz), necessitating real-time up/down-sampling bridges in telephony worker pipelines.
2. **Deterministic Wire-Level Truncation**: OpenAI Realtime specifies explicit client/server events for `conversation.item.truncate` with exact millisecond offsets (`audio_end_ms`) and `response.cancel`, directly satisfying SD §9 and §11 requirements for local audio timing fences upon caller barge-in.
3. **Strict Function Calling Schema**: Realtime tool definitions map 1:1 to `@drts/contracts` JSON schemas without needing external third-party agent orchestration frameworks (such as LiveKit or Pipecat).

### 1.3 Official Documentation References
- **OpenAI Realtime API Guide**: [https://developers.openai.com/api/docs/guides/realtime](https://developers.openai.com/api/docs/guides/realtime)
- **OpenAI Realtime SIP Telephony Guide**: [https://developers.openai.com/api/docs/guides/realtime-sip](https://developers.openai.com/api/docs/guides/realtime-sip)
- **OpenAI Realtime Pricing & Usage Guide**: [https://developers.openai.com/api/docs/guides/realtime-costs](https://developers.openai.com/api/docs/guides/realtime-costs)

### 1.4 Hermetic Fixture Discipline & Production Guard
Neither OpenAI API keys nor commercial carrier SIP trunks are provisioned in this development environment. In accordance with SD acceptance rules:
- The adapter is implemented as an unforgeable hermetic fixture adapter (`OpenAiRealtimeFixtureAdapter`) with `isProductionCapable = false` and `mode = "fixture"`.
- Invoking `connect()` with `production: true` or unverified production credentials immediately throws `VoiceMediaProviderError("voice_fixture_forbidden")`, preventing unauthorized execution or simulated production capabilities.
- Live billing accounts and carrier network credentials remain strictly gated at `UV-EXEC-027` (vendor audit) and `UV-EXEC-028` (live PSTN validation).

### 1.5 Explicit Retention of Unknowns
The following parameters are formally classified as `unknown_pending_live`:
- **Taiwanese Hokkien (`nan-TW`) and Hakka (`hak-TW`) Dialect Quality**: While OpenAI documents Mandarin (`zh-TW`), native Taiwanese regional dialects are not officially benchmarked or guaranteed by the provider.
- **Carrier PSTN Network Telephony Characteristics**: Jitter buffer dynamics, packet loss under carrier network load, and re-INVITE timing remain unknown without live PSTN trunks.
- **Exact Production Telephony Billing**: Actual provider metering reconciliation vs. theoretical token formulas.

---

## 2. Shared Gate Adapter Architecture (`shared_gate_adapter_evidence`)

A central requirement of `UV-EXEC-026` is that the candidate model **does not invent a separate order truth or bypass business gates**:

```
+-----------------------------------------------------------------------------------------+
|                               CALLER TELEPHONY AUDIO (G.711u)                          |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                  OpenAiRealtimeFixtureAdapter (Native Voice Adapter)                    |
|  - Bidirectional WebSocket Wire Protocol (/v1/realtime)                                 |
|  - Server VAD & Audio Framing (G.711u / 8 kHz)                                          |
|  - Emits: response.audio.delta, response.function_call_arguments.done                    |
+-----------------------------------------------------------------------------------------+
                                             |
                   +-------------------------+-------------------------+
                   | (Tool Proposal Event)                             | (Barge-in / Speech Start)
                   v                                                   v
+------------------------------------+               +------------------------------------+
|     RealtimeSharedGateBridge       |               |      RealtimeSharedGateBridge      |
|  - parseRealtimeFunctionCall()     |               |  - handleBargeIn(audioEndMs)       |
|  - validateNoBypassedMutations()   |               +------------------------------------+
+------------------------------------+                                 |
                   |                                                   v
                   v                                 +------------------------------------+
+------------------------------------+               |     VoiceMediaOutputFence          |
|    Shared DRTS Tool Gateway        |               |  - localClear() synchronously      |
|  - resolve_location                |               |  - generation incremented          |
|  - check_booking_eligibility       |               +------------------------------------+
|  - prepare_booking_readback        |                                 |
|  - request_handoff                 |                                 v
+------------------------------------+               +------------------------------------+
                   |                                 |   VoiceConfirmationController      |
                   v                                 |  - interrupt("unknown_input")      |
+------------------------------------+               |  - active readback plan aborted    |
|   VoiceConfirmationService (Gate)  |               +------------------------------------+
|  - Deterministic Readback Proof    |                                 |
|  - Signs confirmation_token        |                                 v
|  - Single DB Order Truth           |               +------------------------------------+
+------------------------------------+               | conversation.item.truncate (Wire)  |
                                                     +------------------------------------+
```

### 2.1 Shared Tool Gateway Integration
All function calling events from the Realtime model are parsed by `parseRealtimeFunctionCall()` and validated against the Zod schema `voiceToolProposalSchema` from `@drts/contracts`:
- Validated tools: `resolve_location`, `check_booking_eligibility`, `prepare_booking_readback`, `get_bound_booking_status`, `request_handoff`.
- Mutation protection: Any model proposal attempting to invoke `create_booking_receipt` directly is rejected by `validateNoBypassedMutations()`. Direct database mutations cannot be triggered from dialogue output.

### 2.2 Cancellation, Truncation & Output Timing Fence
When the caller interrupts assistant speech:
1. Server VAD emits `input_audio_buffer.speech_started`.
2. `RealtimeSharedGateBridge.handleBargeIn(audioEndMs)` is triggered:
   - Invokes `VoiceMediaOutputFence.localClear()` synchronously: CTI audio sink is flushed, playback status is set to `cleared`, and playback generation is incremented.
   - Invokes `VoiceConfirmationController.interrupt("unknown_input")`: active readback plan is aborted, preventing stale completion marks.
3. The adapter sends a client wire event `conversation.item.truncate` specifying the exact playback offset (`audio_end_ms: 1150`).
4. Any uncommitted confirmation state is invalidated; caller proof cannot be accepted for truncated readbacks.

### 2.3 Single Source of Truth for Bookings
Orders are created strictly through `VoiceConfirmationService` with an unexpired `confirmation_token` and verified snapshot hash after full deterministic readback. The native voice adapter cannot mint booking receipts independently.

---

## 3. Candidate Fixture Comparison Results (`candidate_fixture_comparison`)

The fair comparison was executed using the identical 120-scenario exploration benchmark (`tests/fixtures/unattended-voice/scenarios.json`) and rate card ledger (`tests/fixtures/unattended-voice/rate-cards.json`) across the baseline and candidate architectures:

### 3.1 Head-to-Head Benchmark Metrics (Load Multiplier: 1.0x)

| Metric | Modular Pipeline Baseline (`twm_llm_twm`) | Native Voice Candidate (`openai_realtime`) | Difference / Architectural Trade-off |
| :--- | :---: | :---: | :--- |
| **Unattended Completion Rate** | 90.83% (109/120) | 90.83% (109/120) | Parity (identical conversation policy & edge handling). |
| **Booking Success Rate** | 89.17% (107/120) | 89.17% (107/120) | Parity on ground-truth serviceability. |
| **Handoff Rate** | 9.17% (11/120) | 9.17% (11/120) | Parity on ambiguity / safety handoff thresholds. |
| **Error Booking Rate** | **0.00%** | **0.00%** | Strict confirmation gate prevents unverified orders. |
| **In-Flight Correction Retention** | **100.00%** | **100.00%** | Truncation & draft invalidation fully effective. |
| **Avg Clarifications / Call** | 0.88 | 0.88 | Identical multi-turn clarification policy. |
| **First Audio Latency (p50)** | 1,200 ms | **850 ms** | **-350 ms (-29.2%)** faster time-to-first-sound. |
| **First Audio Latency (p95)** | 1,224 ms | **874 ms** | **-350 ms (-28.6%)** faster worst-case onset. |
| **Turn Response Wait (p50)** | 1,450 ms | **980 ms** | **-470 ms (-32.4%)** faster conversational turn. |
| **Turn Response Wait (p95)** | 1,474 ms | **1,004 ms** | **-470 ms (-31.9%)** conversational fluidity advantage. |
| **Tool Wait Latency (p95)** | 674 ms | 674 ms | Parity (shared DRTS tool gateway). |
| **Barge-In Cutoff Latency (p95)**| 124 ms | 124 ms | Parity (local CTI OutputFence clear < 300 ms SLA). |

### 3.2 Full Cost Ledger Breakdown (NTD per Call, Avg 2.5 min duration)

| Cost Component (NTD) | Baseline (`twm_llm_twm`) | Native Candidate (`openai_realtime`) | Cost Analysis & Unit Economics |
| :--- | :---: | :---: | :--- |
| **Telephony Leg Cost** | NT$ 1.500 | NT$ 1.500 | Inbound carrier rate (NT$ 0.60/min × 2.5 min). |
| **Speech Layer Cost** | NT$ 1.850 | NT$ 11.652 | TWM ASR (NT$ 0.74/min) vs Realtime Audio Tokens ($100/M in, $200/M out). |
| **LLM Reasoning Cost** | NT$ 0.158 | Included in Audio | Text LLM (Claude 3.7 Sonnet) vs Native multi-modal token stream. |
| **Storage & Checkpoint** | NT$ 0.150 | NT$ 0.150 | Dual-channel audio recording & immutable checkpoints. |
| **Amortized Human Labor** | NT$ 0.638 | NT$ 0.638 | 9.17% handoff rate × 2 min × NT$ 3.48/min labor cost. |
| **Total Cost Per Call** | **NT$ 4.297** | **NT$ 13.942** | **Native Realtime is 3.24x more expensive** than modular pipeline. |
| **Cost / Successful Booking** | **NT$ 4.819** | **NT$ 15.635** | Financial trade-off: 470ms latency saving costs +NT$ 10.816 per booking. |

### 3.3 Per-Language Breakdown

| Language Code | Total Scenarios | Completed Rate | Booked Rate | Avg Clarifications | Live Validation Status |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `zh-TW` (Mandarin) | 48 | 91.7% | 89.6% | 0.85 | Documented native support. |
| `nan-TW` (Taiwanese Hokkien) | 36 | 88.9% | 88.9% | 0.92 | **Unknown pending live (UV-EXEC-028)**. |
| `hak-TW` (Taiwanese Hakka) | 24 | 91.7% | 87.5% | 0.92 | **Unknown pending live (UV-EXEC-028)**. |
| `en-mixed` (Code-switching) | 12 | 91.7% | 91.7% | 0.83 | Documented multi-lingual support. |

> [!IMPORTANT]
> **Notice on Fixture Mode vs. Production Telephony Quality**:
> This fixture evaluation validates harness logic, conversation policies, tool boundaries, state consistency, and cost ledgers under hermetic test conditions. It does **NOT** claim production carrier PSTN voice quality or production carrier SLA. Real-world audio quality and Taiwanese dialect recognition require live PSTN trunk testing under `UV-EXEC-028`.

---

## 4. Verification & Acceptance Traceability

| Verification Step | Command | Result | Evidence |
| :--- | :--- | :---: | :--- |
| **1. Unit Test Suite** | `pnpm exec vitest run tests/unit/uv-exec-026.test.ts` | **PASS (11/11)** | Verified candidate profile, wire protocol trace, barge-in truncation, tool schemas, mutation containment, in-flight correction, and unknown retention. |
| **2. TypeScript Strict Check** | `pnpm --filter @drts/voice-media-worker typecheck` | **PASS (0 errors)** | Zero compilation or typing errors across media worker and native voice provider. |
| **3. Evaluation Harness** | `node operations/verification/unattended-voice-eval.mjs --mode fixture` | **PASS (code 0)** | Evaluates all candidates across 120 exploration scenarios with latency and cost ledgers. |
| **4. Coverage & Traceability**| `python3 operations/verification/check-unattended-voice-coverage.py` | **PASS (48/48 ACs)**| All 32 FRs and 48 ACs traceable; no monolithic dumping into 025. |

---

## 5. Required Acceptance Evidence Summary

- `single_candidate_selection_record`: Documented selection of OpenAI Realtime (`gpt-4o-realtime-preview-2024-12-17`, API `v1`, G.711u 8 kHz telephony codec), official documentation citations, justification over Gemini Live, fixture discipline (`isProductionCapable = false`, `mode = 'fixture'`), and formal retention of unknowns for Taiwanese dialects and live costs.
- `shared_gate_adapter_evidence`: Verification that Realtime function calling events are strictly mapped to `@drts/contracts` tool schemas, direct database writes are blocked, caller barge-in triggers `conversation.item.truncate` and synchronously clears `VoiceMediaOutputFence` and invalidates `VoiceConfirmationController`, and order truth is minted solely via `VoiceConfirmationService`.
- `candidate_fixture_comparison`: Side-by-side evaluation across 120 exploration scenarios comparing `twm_llm_twm` and `openai_realtime`: native voice achieves 850ms p50 first audio and 980ms turn response latency (-32.4% vs modular baseline), with an economic trade-off of NT$ 13.942 vs NT$ 4.297 per call (3.24x cost ratio).
- `reviewed_candidate_sha`: Handoff to reviewer `Codex2` for candidate SHA verification prior to PR and CI merge.
