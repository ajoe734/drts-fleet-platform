#!/usr/bin/env python3
"""Dispatch the Phase 2 Tesla FSD Sandbox backend/contracts/test wave.

Registers each task via ``scripts/ai-status.sh assign`` (env-var carried
metadata), exactly like ``dispatch-ui-impl-wave-tasks.py``. Idempotent:
re-running updates existing tasks in place (ai_status.py ``command_assign``).

Scope: ONLY the repo-buildable (Gate B) tasks — contracts, DDL/migrations,
backend modules, mock adapters, unit/integration/E2E-repo-local. UI build is
deliberately excluded (needs design canvas; see the gaps doc). External
contract values (Tesla regulatory endpoint, approval conditions, recorder
vendor) stay capability-gated and are NOT invented by workers.

Source:
  docs/02-architecture/phase2_tesla_fsd_sandbox_execution_plan_20260625.md
  docs/02-architecture/phase2-tesla-fsd-sandbox/ (SA/SD/PRD/contracts/DDL/WBS)

Owner/reviewer follow workload ratio
Claude:Claude2:Gemini:Gemini2:Codex:Codex2:Copilot = 10:10:5:5:35:35:5
(supervisor availability-first may reshuffle — best-effort hints).

Usage::

    AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-wave.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

# 3s between assigns — avoids the supervisor concurrent-read OOM that hit
# prior large batches (see dispatch-ui-handoff-tasks-followup.sh precedent).
INTER_ASSIGN_SLEEP_SECONDS = 3

REPO = Path(__file__).resolve().parents[1]
PHASE = "phase2-tesla-fsd-sandbox-202606"
PLANNING_REF = (
    "docs/02-architecture/phase2_tesla_fsd_sandbox_execution_plan_20260625.md"
)

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv,
#              artifacts_csv, acceptance_text)
TASKS = [
    (
        "P2-WP0",
        "Claude",
        "Codex",
        "Phase2 contracts + DDL migrations + module scaffolds + shared envelopes",
        "依 SD §2/§3 與 DDL draft：packages/contracts/src/ 新增並 export 全 Phase2 DTO/event/error "
        "(Phase2SourceMetadata, ProviderCapabilityRequirement, CommandReceipt, SandboxDispatchDecision, "
        "Tesla* regulatory DTO, EvidenceManifestItem, error-code enum)；apps/api/src/migrations 新增 "
        "av_sandbox + av_evidence schema（比照 10_phase2_data_model_ddl_draft.sql，命名/ownership 對齊 Phase1）；"
        "建立並 register 10 個模組 scaffold：tesla-integration, tesla-telemetry, tesla-regulatory-events, "
        "sandbox-governance, sandbox-dispatch-gate, safety-operator, roc-operations, vehicle-evidence, "
        "accident-investigation, regulatory-reporting；定義 TeslaRegulatoryEventProvider / "
        "TeslaPublicTelemetryAdapter / recorder adapter interface（僅 interface）。",
        "",
        "packages/contracts/src/,apps/api/src/migrations/,apps/api/src/modules/tesla-integration/,apps/api/src/modules/tesla-regulatory-events/,apps/api/src/modules/sandbox-governance/,apps/api/src/modules/sandbox-dispatch-gate/,apps/api/src/modules/safety-operator/,apps/api/src/modules/roc-operations/,apps/api/src/modules/vehicle-evidence/,apps/api/src/modules/accident-investigation/,apps/api/src/modules/regulatory-reporting/",
        "Contracts compile & exported; migrations apply cleanly on PostGIS; 10 modules registered; "
        "adapter interfaces compile; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass",
    ),
    (
        "P2-TESLA-001",
        "Codex",
        "Claude2",
        "Tesla Public Fleet integration + mock (OAuth/VIN/virtual-key/telemetry/commands)",
        "依 SD §3.1、WBS P2-TESLA-001：OAuth/business token store-refresh-revoke、region handling、VIN discover+bind "
        "到 Phase1 vehicle、virtual-key pairing state、Fleet Telemetry configure/status、allowlisted non-driving "
        "command broker 回 CommandReceipt（僅 Tesla 公開且沙盒政策允許之 command）、cost/rate-limit metrics；"
        "TeslaPublicTelemetryAdapter 實作 + mock。命令 broker 不得被解讀為可控 FSD。",
        "P2-WP0",
        "apps/api/src/modules/tesla-integration/,packages/shared-test-fixtures/",
        "Endpoints per catalog §Tesla Integration live; mock telemetry produces valid projection; command "
        "broker rejects non-allowlisted commands; CommandReceipt persisted with audit; unit+integration green",
    ),
    (
        "P2-TESLA-002",
        "Codex2",
        "Codex",
        "Tesla Regulatory provider adapter + mock + capability profile + reason-code store",
        "依 SD §3.2、spec 04：TeslaRegulatoryEventProvider 之 TeslaRegulatorySandboxAdapter（契約占位，"
        "不假設真 endpoint）與 TeslaRegulatoryMockAdapter；getCapabilities→TeslaRegulatoryCapabilityProfile 儲存；"
        "FSD session / autonomy transition / session summary / incident evidence reference DTO 與儲存；"
        "reason-code dictionary 儲存（保留原碼，不自行重分類為責任）。Mock adapter 不能當外部實證。",
        "P2-WP0",
        "apps/api/src/modules/tesla-regulatory-events/,packages/shared-test-fixtures/",
        "Capability profile stored & queryable via GET /api/tesla/vehicles/{vin}/capabilities; mock adapter "
        "emits signed sample events; reason-code dictionary versioned; required-capability-missing gates passenger "
        "service; unit+integration green",
    ),
    (
        "P2-TESLA-003",
        "Codex",
        "Codex2",
        "Tesla regulatory event ingress (mTLS/JWS, raw vault, normalize, idempotency)",
        "依 SD §4、spec 04 §3：POST /internal/providers/tesla/regulatory-events；mTLS + JWS/detached signature "
        "verify wrapper、replay window、allowlisted provider identity、payload size limit、exact raw header capture、"
        "payload sha256；raw immutable vault（tesla_regulatory_raw_events）；idempotency (provider_code, provider_event_id) "
        "+ receipt；normalizer registry by schemaVersion→canonical transition event；hash mismatch on same "
        "providerEventId⇒security incident；alert hook。",
        "P2-TESLA-002",
        "apps/api/src/modules/tesla-regulatory-events/",
        "Acceptance tests 04 §7 #1-3,#6 pass (valid signed accepted / invalid rejected+audited / duplicate idempotent "
        "/ unknown schema quarantined raw-preserved); receipt returned; canonical event store populated; integration green",
    ),
    (
        "P2-TESLA-004",
        "Codex2",
        "Codex",
        "Provider gap detection / backfill / quarantine / health / telemetry quality",
        "依 SD §4.2、flows §6：per-VIN/session sequence tracker、missing-sequence/stale-heartbeat 偵測、backfill query "
        "(vin/from-to/sessionId/eventId/sequenceAfter/pageToken)、unknown-schema quarantine、provider health 狀態機 "
        "(healthy→delayed→gap_detected→backfill→complete|incomplete_hold→regulator_data_incident)、telemetry "
        "data-quality score（per NFR §6，影響 eligibility 不影響 Tesla 駕駛）；超門檻⇒regulatory_data_incomplete + "
        "stop new AV assignment。",
        "P2-TESLA-003",
        "apps/api/src/modules/tesla-regulatory-events/,apps/api/src/modules/tesla-telemetry/",
        "Acceptance 04 §7 #4,#5,#9 pass (out-of-order preserved / gap triggers backfill / downtime causes dispatch "
        "hold after threshold); quality score affects gate; gap detection <=60s after threshold (test harness); integration green",
    ),
    (
        "P2-GOV-001",
        "Codex",
        "Gemini",
        "Sandbox experiment / jurisdiction / approval-document governance + snapshot",
        "依 spec 05 §2、WBS P2-GOV-001：SandboxExperimentProgram / JurisdictionProfile / ApprovalDocumentVersion CRUD "
        "+ 版本化 + effective-dating；approval artifact upload + hash + supersedes；notification matrix 結構；"
        "SandboxComplianceSnapshot 組裝 API（蒐集 experiment/jurisdiction/route/schedule/enrollment/capability/policy 版本）。"
        "通報時限/保存年限等實值 policy-driven，留 config 佔位不硬編。",
        "P2-WP0",
        "apps/api/src/modules/sandbox-governance/",
        "Experiments CRUD+publish/suspend/resume-authorizations endpoints live; approval doc hash stored; versions "
        "rollbackable & effective-dated; compliance snapshot reproducible; unit+integration green",
    ),
    (
        "P2-GOV-002",
        "Codex2",
        "Claude",
        "PostGIS operating-area / route / schedule + vehicle & operator enrollment",
        "依 SD §5.2、spec 05 §3、DDL：approved_operating_areas(MultiPolygon)/approved_routes(MultiLineString)/"
        "pickup_dropoff_zone + schedule（days/time/exception/holiday/max-concurrent）+ vehicle_enrollments + "
        "safety_operator_qualifications，全 effective-dated/versioned；geofence containment + route-on-approved-route "
        "query helper（GIST index）。僅監管/派遣資格用，非高精地圖/路側設備。",
        "P2-WP0",
        "apps/api/src/modules/sandbox-governance/",
        "PostGIS geometry stored with GIST index; point-in-approved-area & route-containment helpers correct on "
        "fixtures; enrollment status lifecycle enforced; routes/vehicles/safety-operators endpoints live; integration green",
    ),
    (
        "P2-GATE-001",
        "Claude",
        "Codex2",
        "Sandbox Dispatch Gate eligibility evaluator + snapshot + Phase1 hook (fail-closed)",
        "依 SD §6、PRD §4：評估 Phase1 booking+candidate vehicle+safety operator+experiment snapshot；全 eligibility "
        "檢核（entitlement/time/area/route/enrollment/operator/capability+health/telemetry+regulatory freshness/SOC/"
        "hold/trip+mileage limit/recorder health）；輸出全 SandboxDispatchDecision enum；evaluation snapshot 隨 "
        "assignment 保存（政策版本可還原）；fail-closed；manual release action；Phase1 dispatch hook（assignment 前呼叫）；"
        "fallback reason mapping；SANDBOX_* error codes。",
        "P2-GOV-002,P2-TESLA-002",
        "apps/api/src/modules/sandbox-dispatch-gate/",
        "POST /api/sandbox/dispatch/evaluate returns correct decision per fixture matrix; snapshot persisted; "
        "missing data => ineligible (fail-closed) not eligible; manual-release path audited; Phase1 hook integration "
        "green; E2E-P2-002 covered",
    ),
    (
        "P2-SAFE-001",
        "Codex",
        "Claude2",
        "Safety Operator backend: shift / checklist / takeover report / offline sync",
        "依 spec 07 §B、06 §1.2：device-bound identity+scope、shift start/end、qualification check、vehicle assignment、"
        "pre-trip checklist、SafetyOperatorTakeoverReport（含 trigger/reason/disposition/fsdResumed/bookmark）、"
        "offline queue 以 clientGeneratedReportId 去重（at-least-once，server receipt）、incident/evidence upload、"
        "trip closeout。報告不得覆蓋 Tesla provider event。",
        "P2-WP0,P2-GOV-002",
        "apps/api/src/modules/safety-operator/",
        "Endpoints per catalog §Safety Operator live; duplicate clientGeneratedReportId idempotent; takeover report "
        "linked to correlationId without overwriting provider data; offline-replay test passes; unit+integration green",
    ),
    (
        "P2-CORR-001",
        "Codex2",
        "Codex",
        "Takeover three-source correlation engine + discrepancy cases",
        "依 SD §7、spec 06 §2、flows §3：以 takeoverCorrelationId 關聯 TeslaAutonomyTransitionEvent + "
        "SafetyOperatorTakeoverReport + RocTakeoverResponseRecord；correlation priority 1(session/event+VIN+window)→"
        "2(VIN+time+trip)→3(manual)；產出 CorrelatedTakeoverCase 保留原始時間/來源不合併成單一真相；不一致建 "
        "EvidenceDiscrepancyCase（平台不裁定）。",
        "P2-TESLA-003,P2-SAFE-001",
        "apps/api/src/modules/roc-operations/,apps/api/src/modules/accident-investigation/",
        "Correlation matches on fixtures across all 3 priorities; conflicting sources create discrepancy case with no "
        "silent overwrite; correlated case retains distinct timestamps/sources; E2E-P2-004 covered; unit+integration green",
    ),
    (
        "P2-ROC-001",
        "Codex",
        "Codex2",
        "ROC backend read models + operational actions (no remote driving)",
        "依 SD §9、spec 07 §A：read models overview/vehicles/trips/takeovers/alerts/provider-health；actions "
        "ack/assign/stop-new-dispatch/operational-hold/request-safety-action/open-incident/start-evidence-freeze/"
        "fallback-to-human/notify/resolve；每 alert 回 availableActions（UI 不自推權限）；telemetry freshness 與 "
        "regulatory freshness 分開。禁止 remote steering/braking/FSD engage-disengage。",
        "P2-TESLA-004,P2-CORR-001",
        "apps/api/src/modules/roc-operations/",
        "ROC endpoints per catalog live; availableActions reflects backend authority; stop-new-dispatch + hold take "
        "effect on gate; no driving-control endpoint exists; unit+integration green",
    ),
    (
        "P2-EVD-001",
        "Gemini",
        "Codex",
        "Onboard evidence recorder adapter + registry + health + segment index",
        "依 spec 06 §3、WBS P2-EVD-001：recorder vendor adapter interface + registry；health（device-id/clock-sync/"
        "storage/camera/last-segment/encryption/upload-queue/firmware）；segment index；event bookmark；upload retry；"
        "mock recorder。required recorder unhealthy⇒no-new-dispatch 訊號給 gate。不依賴路側、不參與 FSD 控制。",
        "P2-WP0",
        "apps/api/src/modules/vehicle-evidence/,packages/shared-test-fixtures/",
        "Recorder registry + health endpoints live; unhealthy state emits no-new-dispatch signal consumed by gate; "
        "segment index + bookmark queryable; mock recorder drives tests; unit+integration green",
    ),
    (
        "P2-EVD-002",
        "Codex2",
        "Claude2",
        "Evidence freeze + manifest + hash + legal hold + controlled export",
        "依 SD §8、spec 06 §4-6、NFR §4：freeze orchestration（trigger §4.1；window policy-driven）；EvidenceManifest "
        "（sha256 hash tree + provider signature + source/custody）；object lock / legal hold；chain-of-custody access "
        "log（view/preview/download/signed-url/export/handoff/redaction/hold）；controlled export（≤15min signed URL、"
        "step-up MFA、reason、watermark、case ref）。sealed 後 manifest 不可改，補件以新 version 關聯。",
        "P2-EVD-001,P2-TESLA-003",
        "apps/api/src/modules/vehicle-evidence/",
        "Freeze state machine (requested→collecting→sealed/partial/failed) enforced; manifest hashes verify; legal "
        "hold blocks deletion; export requires step-up+reason+short-URL and writes access log; EVIDENCE_* error codes; "
        "E2E-P2-006 + UAT-AV-009 covered; integration green",
    ),
    (
        "P2-ACC-001",
        "Codex",
        "Codex2",
        "Accident case lifecycle + synchronized timeline + discrepancy + external docs",
        "依 spec 06 §7-9、flows §4：accident_cases 狀態機（detected→roc_acknowledged→operation_suspended→"
        "emergency_response_active→evidence_frozen→initial_notification_sent→...→closed）；synchronized timeline "
        "assembler，每 fact 標 data-confidence（provider_signed…unknown），system-derived 需 derivation rule+confidence "
        "且不覆蓋 provider-signed；discrepancy 連結；external police/insurer doc import。",
        "P2-EVD-002,P2-CORR-001",
        "apps/api/src/modules/accident-investigation/",
        "Accident state machine transitions valid-only; timeline marks confidence per item; provider-signed facts "
        "never overwritten by derived; GET /api/accident-cases/{id}/timeline correct on fixtures; unit+integration green",
    ),
    (
        "P2-ACC-002",
        "Codex2",
        "Codex",
        "Accident investigation bundle (synchronized export, manifest, controlled download)",
        "依 spec 06 §8：investigation bundle 含 §8 全 section（case/booking/experiment+jurisdiction snapshot/vehicle+"
        "Tesla state/FSD session+events/safety reports/ROC actions/telemetry+gaps/synced video/route+geofence compare/"
        "commands+receipts/notifications/external docs/manifest+custody/known-gaps）；controlled download；明示 "
        "unavailable provider data。系統不輸出責任結論。",
        "P2-ACC-001",
        "apps/api/src/modules/accident-investigation/",
        "POST /api/accident-cases/{id}/bundles produces manifest+custody package; known-gaps section present; no "
        "liability conclusion emitted; controlled download audited; E2E-P2-007 covered; integration green",
    ),
    (
        "P2-REG-001",
        "Claude2",
        "Codex",
        "Regulatory notification policy engine + deadlines + submit/ack",
        "依 spec 05 §5、08 catalog §Regulatory：event-level notification matrix（informational…injury_or_fatality/"
        "cybersecurity）；deadline timer + reminder；draft/review/submit/acknowledge；REGULATORY_NOTIFICATION_OVERDUE；"
        "who-can-approve；initial/follow-up/final report 版本。時限實值 policy-driven。",
        "P2-GOV-001",
        "apps/api/src/modules/regulatory-reporting/",
        "Notification matrix drives recipients+deadline; overdue computed from policy; submit/ack lifecycle audited; "
        "POST /api/regulatory/notifications + acknowledge live; unit+integration green",
    ),
    (
        "P2-REG-002",
        "Codex",
        "Codex2",
        "Regulatory report jobs + templates + compliance summary + resume dossier",
        "依 SA §5.8、SD §10：report jobs（daily ops / trip / takeover / FSD session / telemetry completeness / incident）"
        "+ template + export artifact（共用 Phase1 artifact lifecycle）；compliance-summary API；resume-authorization "
        "dossier。report 必須可由原始 evidence 追溯。",
        "P2-REG-001,P2-TESLA-004",
        "apps/api/src/modules/regulatory-reporting/",
        "POST /api/regulatory/reports/jobs generates each report type from canonical data; compliance-summary "
        "endpoint live; report traces back to source evidence; resume dossier assembled; E2E-P2-010 covered; integration green",
    ),
    (
        "P2-FBK-001",
        "Claude2",
        "Codex2",
        "Human taxi fallback on AV failure (same booking, ETA, audit chain)",
        "依 SD §10、flows §5、PRD 硬規則 §10：AV 不可履約時沿用同一 booking/order 建立 Phase1 人駕 fallback "
        "assignment、修正乘客 ETA/服務狀態、產 sandbox-exception report；不得斷開 SLA/billing/audit chain。"
        "由 gate fallback_required 與 ROC fallback-to-human 觸發。",
        "P2-GATE-001",
        "apps/api/src/modules/sandbox-dispatch-gate/,apps/api/src/modules/owned-mobility/",
        "POST /api/roc/trips/{id}/fallback-to-human reuses original booking/order; new human assignment created; "
        "revised ETA emitted; billing+audit chain intact; E2E-P2-008 + UAT-AV-010 covered; integration green",
    ),
    (
        "P2-NFR-001",
        "Gemini2",
        "Codex",
        "Phase2 infra/security config + retention + DR runbook (repo-local, no live apply)",
        "依 spec 12：storage bucket layout（raw-provider-events/telemetry-archive/video-normal/video-incident-locked/"
        "investigation-bundles/regulatory-reports）含 versioning/retention/object-hold/CMEK 設定；Pub/Sub topic 定義；"
        "Secret Manager/KMS wiring 文件；retention policy config（policy-driven）；DR runbook（multi-zone/durable queue/"
        "restore test/manifest verify/ROC degraded mode/no-new-AV-dispatch）；telemetry data-quality 欄位表。repo-local，"
        "不 apply 真 GCP。",
        "P2-WP0",
        "docs/03-runbooks/,infra/,apps/api/src/config/",
        "Bucket+topic+retention config landed as code/config; DR runbook complete; no live GCP mutation; config "
        "validated by lint/test where applicable",
    ),
    (
        "P2-E2E-001",
        "Copilot",
        "Codex2",
        "Repo-local E2E suite E2E-P2-001..010 (mock adapters)",
        "依 test plan §1 E2E、§5 Gate B：建立 repo-local E2E（mock Tesla public + regulatory + recorder adapters）涵蓋 "
        "E2E-P2-001 onboarding / 002 eligibility / 003 normal trip / 004 takeover correlation / 005 gap+backfill / "
        "006 evidence freeze / 007 investigation bundle / 008 human fallback / 009 suspend+resume / 010 report package；"
        "掛進 root vitest/playwright include glob。Mock 不能升 gate 成 Tesla sandbox evidence。",
        "P2-GATE-001,P2-ROC-001,P2-EVD-002,P2-ACC-002,P2-REG-002,P2-FBK-001",
        "tests/e2e/,apps/api/tests/integration/",
        "All 10 E2E scenarios green against mock adapters in CI; suite wired into include globs; each asserts "
        "fail-closed + no-FSD-fact-invention; documented as Gate-B evidence only",
    ),
]


def register(task) -> bool:
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = summary_zh
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "scripts/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    print(f"  {task_id:16s}  {owner:>8s} -> {reviewer:>8s}  | {title[:74]}")
    return True


def main() -> int:
    print(
        f"Registering {len(TASKS)} Phase 2 tasks under phase '{PHASE}'\n"
        f"(repo-buildable / Gate B only; UI + external-contract work excluded)\n"
    )
    success = 0
    for i, task in enumerate(TASKS):
        if register(task):
            success += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(
        f"\nDone: {success}/{len(TASKS)} tasks registered. "
        f"Supervisor picks them up on next scan (~60s). P2-WP0 has no deps and "
        f"unblocks the rest."
    )
    return 0 if success == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
