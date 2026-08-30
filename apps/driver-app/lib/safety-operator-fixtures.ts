import type {
  CreateSafetyOperatorTripCloseoutCommand,
  SafetyOperatorChecklistItem,
  SafetyOperatorTakeoverDisposition,
  SafetyOperatorTakeoverReasonCode,
  SafetyOperatorTakeoverTrigger,
  SubmitSafetyOperatorTakeoverReportCommand,
} from "@drts/contracts";

export const SAFETY_OPERATOR_FIXTURE = {
  safetyOperatorId: "SO-2024-0118",
  sandboxProgramId: "FSD-TPE-01",
  deviceId: "SO-TABLET-01",
  vehicleId: "AV-7720",
  orderId: "ORD-88231",
  shiftId: "SHIFT-260626-AM",
  assignmentId: "SOA-88231",
  activeAssignmentId: "SOA-88231",
  correlationId: "CORR-88231",
  incidentId: "INC-88231",
  bookmarkId: "BM-220145",
  evidenceArtifactIds: ["CAM-FRONT-01", "CABIN-02"],
  experimentWindow: "08:00-18:00",
  coverageZone: "信義 / 南港 沙盒區",
  operatorName: "陳柏宇",
  qualified: true,
  matchedQualificationIds: [
    "Tesla FSD 沙盒資格",
    "台北市自駕營運資格",
  ],
  qualificationReasons: [
    "沙盒資格已核驗",
    "需在交班前補齊施工區段證據關聯",
  ],
  shiftStartedAt: "2026-06-28T08:00:00.000Z",
  vehicleAssignedAt: "2026-06-28T08:04:00.000Z",
  systemDetectedTakeoverAt: "2026-06-28T09:18:00.000Z",
  closeoutEndedAt: "2026-06-28T10:12:00.000Z",
  endLocationLabel: "台北市信義區松仁路 89 號",
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
    evidenceArtifactIds: overrides?.evidenceArtifactIds ?? [
      ...SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds,
    ],
    notes: overrides?.notes ?? "前方施工車臨停，安全員人工接管通過施工窄口。",
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
    evidenceArtifactIds: overrides?.evidenceArtifactIds ?? [
      ...SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds,
    ],
    notes: overrides?.notes ?? "已向下一班安全員交接道路施工風險與證據片段。",
  };
}
