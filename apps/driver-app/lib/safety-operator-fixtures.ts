import type {
  CreateSafetyOperatorTripCloseoutCommand,
  SafetyOperatorChecklistItem,
  SafetyOperatorTakeoverDisposition,
  SafetyOperatorTakeoverReasonCode,
  SafetyOperatorTakeoverTrigger,
  SubmitSafetyOperatorTakeoverReportCommand,
} from "@drts/contracts";

export const SAFETY_OPERATOR_FIXTURE = {
  safetyOperatorId: "so_2024_0118",
  sandboxProgramId: "exp_fsd_taipei_01",
  vehicleId: "AV-7720",
  orderId: "order_av_88231",
  shiftId: "shift_so_260626_am",
  assignmentId: "soa_88231",
  correlationId: "corr_takeover_88231",
  incidentId: "incident_av_88231",
  bookmarkId: "bookmark_220145",
  evidenceArtifactIds: ["artifact_cam_front_01", "artifact_cabin_02"],
  experimentWindow: "08:00-18:00",
  coverageZone: "信義 / 南港 沙盒區",
  operatorName: "陳柏宇",
} as const;

export const SAFETY_OPERATOR_CHECKLIST_TEMPLATE: readonly SafetyOperatorChecklistItem[] =
  [
    { itemKey: "vehicle_exterior", status: "pass", note: null },
    { itemKey: "cab_cleanliness", status: "pass", note: null },
    { itemKey: "seatbelts", status: "pass", note: null },
    { itemKey: "brakes", status: "pass", note: null },
    { itemKey: "lights", status: "pass", note: null },
    { itemKey: "tires", status: "pass", note: null },
    { itemKey: "mirrors", status: "pass", note: null },
    { itemKey: "recorder_health", status: "pass", note: null },
    { itemKey: "autonomy_stack", status: "pass", note: null },
    {
      itemKey: "fallback_comms",
      status: "fail",
      note: "備援對講機已換電池，待重新確認。",
    },
  ];

export const SAFETY_OPERATOR_INCIDENT_TAGS = [
  "車載錄製",
  "安全員回報",
  "Tesla 提供",
] as const;

export function buildTakeoverCommand(
  overrides?: Partial<SubmitSafetyOperatorTakeoverReportCommand>,
): SubmitSafetyOperatorTakeoverReportCommand {
  return {
    clientGeneratedReportId:
      overrides?.clientGeneratedReportId ?? `takeover-${Date.now()}`,
    safetyOperatorId:
      overrides?.safetyOperatorId ?? SAFETY_OPERATOR_FIXTURE.safetyOperatorId,
    vehicleId: overrides?.vehicleId ?? SAFETY_OPERATOR_FIXTURE.vehicleId,
    orderId: overrides?.orderId ?? SAFETY_OPERATOR_FIXTURE.orderId,
    sandboxProgramId:
      overrides?.sandboxProgramId ?? SAFETY_OPERATOR_FIXTURE.sandboxProgramId,
    shiftId: overrides?.shiftId ?? SAFETY_OPERATOR_FIXTURE.shiftId,
    assignmentId:
      overrides?.assignmentId ?? SAFETY_OPERATOR_FIXTURE.assignmentId,
    correlationId:
      overrides?.correlationId ?? SAFETY_OPERATOR_FIXTURE.correlationId,
    trigger:
      overrides?.trigger ??
      ("safety_operator" satisfies SafetyOperatorTakeoverTrigger),
    reasonCode:
      overrides?.reasonCode ??
      ("obstacle" satisfies SafetyOperatorTakeoverReasonCode),
    disposition:
      overrides?.disposition ??
      ("continued_manual" satisfies SafetyOperatorTakeoverDisposition),
    fsdResumed: overrides?.fsdResumed ?? false,
    bookmarkId: overrides?.bookmarkId ?? SAFETY_OPERATOR_FIXTURE.bookmarkId,
    incidentId: overrides?.incidentId ?? null,
    evidenceArtifactIds:
      overrides?.evidenceArtifactIds ??
      [...SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds],
    notes:
      overrides?.notes ??
      "前方施工車臨停，安全員人工接管通過施工窄口。",
    occurredAt: overrides?.occurredAt ?? new Date().toISOString(),
  };
}

export function buildShiftHandoverCommand(
  overrides?: Partial<CreateSafetyOperatorTripCloseoutCommand>,
): CreateSafetyOperatorTripCloseoutCommand {
  return {
    assignmentId:
      overrides?.assignmentId ?? SAFETY_OPERATOR_FIXTURE.assignmentId,
    shiftId: overrides?.shiftId ?? SAFETY_OPERATOR_FIXTURE.shiftId,
    safetyOperatorId:
      overrides?.safetyOperatorId ?? SAFETY_OPERATOR_FIXTURE.safetyOperatorId,
    vehicleId: overrides?.vehicleId ?? SAFETY_OPERATOR_FIXTURE.vehicleId,
    orderId: overrides?.orderId ?? SAFETY_OPERATOR_FIXTURE.orderId,
    closeoutStatus: overrides?.closeoutStatus ?? "handoff",
    takeoverReportIds: overrides?.takeoverReportIds ?? [],
    incidentId: overrides?.incidentId ?? SAFETY_OPERATOR_FIXTURE.incidentId,
    evidenceArtifactIds:
      overrides?.evidenceArtifactIds ??
      [...SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds],
    notes:
      overrides?.notes ??
      "已向下一班安全員交接道路施工風險與證據片段。",
  };
}
