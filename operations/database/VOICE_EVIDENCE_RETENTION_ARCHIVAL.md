# Voice Evidence Retention, Legal Hold & Privileged Archival Runbook

**Reference:** UV-EXEC-021 / SD §9.2 / SD §13 / SD §15 / SA §9 / Contracts §3.9 / Evidence Policy Runbook  
**Status:** Active  
**Author:** Gemini  
**Reviewer:** Codex  

---

## 1. Overview & Threat Model

The DRTS Fleet Platform Unattended Voice Booking system persists voice sessions, conversational turns, booking confirmations, audio recording checkpoints, and operational telemetry.

Per SD §9.2, retention policy is bounded by two opposing constraints:
1. **Statutory Floor:** 汽車運輸業管理規則 §91(4) mandates that operational passenger and booking records be preserved for **at least two years** (730 days).
2. **Statutory Ceiling:** 個人資料保護法 (個資法) mandates that personal data (such as voice recordings and spoken turn transcripts) may only be kept for the duration justified by service execution or specific legal authority. Audio recordings and detailed transcripts are capped at **180 days**.

### Unconditional Rules
- **Prohibition of Indefinite Retention ("未定義保存期限不能默認永久"):** Undefined retention windows are strictly rejected. No voice evidence family may default to permanent or open-ended storage.
- **Engine-Level Append-Only Immutability:** Migration `V0086` and `V0093` install `voice.raise_append_only()` on evidence tables (`voice.session_event`, `voice.turn`, `voice.draft_revision`, `voice.booking_command_proof`, `voice.route_profile`, `voice.retention_execution_log`). Direct SQL `UPDATE`, `DELETE`, or `TRUNCATE` operations are rejected.
- **Privileged Archival Bypass:** Lawful deletion of aged evidence records is permitted **only** within an explicit transaction setting:
  ```sql
  SET LOCAL voice.allow_retention_archival = 'on';
  ```
- **Legal Hold Suppression:** If an active legal hold is recorded in `voice.legal_hold`, any automated or manual deletion sweep must skip the held evidence until an audited release is recorded by a `platform_admin`.

---

## 2. Voice Evidence Family Matrix

| Evidence Family | Authority | Hot Retention | Archive Cutover | Archive Retention | Total Window | Deletion Exception & Access Posture |
|---|---|---|---|---|---|---|
| `voice_booking_evidence` | `voice-booking` | 90 days | Day 90 | 640 days | 730 days | Preserved while linked trip, order, or complaint is open. Secondary views mask hashes and IDs. |
| `voice_transcript` | `voice-booking` | 30 days | Day 30 | 150 days | 180 days | 180-day statutory ceiling; spoken cards/passwords masked at ingress; signed download audited. |
| `voice_recording_audio` | `voice-booking` | 30 days | Day 30 | 150 days | 180 days | CTI provider ceiling; accessible only via short-lived signed URLs (15-min TTL) with per-access audit. |
| `voice_live_buffer` | `voice-booking` | 1 day | None (hot-only) | 0 days | 1 day | Transient audio frames cleared immediately after disconnect recovery window; never in general logs. |
| `voice_telemetry` | `voice-booking` | 180 days | Day 180 | 550 days | 730 days | Aggregated cost and quality metrics; labels strictly omit phone numbers, addresses, and transcripts. |

---

## 3. Legal Hold Lifecycle

1. **Placement:** `platform_admin` or `ops_user` places a hold with a case number, evidence family, subject reference, and valid reason code (`complaint_escalation`, `regulatory_inquiry`, `settlement_dispute`, `internal_investigation`, `other`).
2. **Enforcement:** Active holds suppress deletion and archival. Any sweep skipping a held record logs `skipped_held` with the associated hold ID and case number.
3. **Release:** Only `platform_admin` may release a legal hold. Releasing immediately restores eligibility for lawful retention purges.

---

## 4. Operational Execution

The privileged archival script `./operations/database/voice-evidence-retention-archival.sh` provides dry-run inspection and atomic transaction-scoped purging.

### Dry-Run Mode (Safe Inspection)
```bash
./operations/database/voice-evidence-retention-archival.sh --family voice_transcript --dry-run
./operations/database/voice-evidence-retention-archival.sh --family voice_booking_evidence --retention-days 730 --dry-run
```

### Apply Mode (Atomic Export & Privileged Purge)
```bash
./operations/database/voice-evidence-retention-archival.sh --family voice_transcript --apply --export-dir /var/log/drts/voice-archives
```

Every execution in apply mode appends an immutable record to `voice.retention_execution_log`, capturing:
- `evidence_family`
- `retention_days`
- `candidates_count`
- `purged_count`
- `skipped_held_count`
- `operator_id`
- `executed_at`

---

## 5. Verification Anchors
- `pnpm exec vitest run tests/unit/uv-exec-021.test.ts`
- `pnpm --filter @drts/api typecheck`
