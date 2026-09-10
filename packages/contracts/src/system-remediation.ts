/**
 * System Remediation 20260906: Leaf Contracts
 *
 * Covers:
 * - Family 1: Driver Leave Workflow (Gap N01, Capability C052)
 * - Family 2: Driver Academy & Fleet Training (Gap N02, Capabilities C059, C071)
 * - Family 3: Host Vehicle Restricted Read-Only Projection (Gap N03, Capability C012)
 * - Family 4: Contract Operational Terms Read Model (Gap N14, Capability C134)
 *
 * Authority references:
 * - docs/04-uat/system-remediation-20260906/feature-contracts.md
 * - phase1_prd_detailed_v1.md §9.4.7, §9.4.9, §12.6
 */

// ============================================================================
// 1. Family 1: Driver Leave Workflow (N01 / C052)
// ============================================================================

export const DRIVER_LEAVE_TYPES = [
  "annual", // 特休
  "sick", // 病假
  "personal", // 事假
  "bereavement", // 喪假
  "emergency", // 緊急事假
] as const;
export type DriverLeaveType = (typeof DRIVER_LEAVE_TYPES)[number];

export const DRIVER_LEAVE_STATUSES = [
  "pending", // 待審核
  "approved", // 已核准
  "rejected", // 已駁回
  "withdrawn", // 已撤回
] as const;
export type DriverLeaveStatus = (typeof DRIVER_LEAVE_STATUSES)[number];

export const MAX_PAST_APPLICATION_GRACE_MS = 15 * 60 * 1000; // 15 分鐘寬限期

export interface DriverLeaveRecord {
  leaveId: string;
  driverId: string;
  leaveType: DriverLeaveType;
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  reason: string;
  status: DriverLeaveStatus;
  reviewedByPrincipalId: string | null;
  reviewedAt: string | null; // ISO 8601 UTC
  reviewNotes: string | null;
  impactedShiftIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverLeaveCommand {
  leaveType: DriverLeaveType;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface WithdrawDriverLeaveCommand {
  reason?: string;
}

export interface ReviewDriverLeaveCommand {
  decision: "approve" | "reject";
  reviewNotes?: string;
}

export interface DriverLeaveQueryFilter {
  driverId?: string;
  status?: DriverLeaveStatus;
  startTimeFrom?: string;
  endTimeTo?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// 2. Family 2: Driver Academy & Fleet Training (N02 / C059, C071)
// ============================================================================

export const TRAINING_STATUSES = [
  "not_started",
  "in_progress",
  "passed",
  "failed",
  "expired",
] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const ACADEMY_MODULE_TYPES = ["video", "sop", "article"] as const;
export type AcademyModuleType = (typeof ACADEMY_MODULE_TYPES)[number];

export interface AcademyModule {
  moduleId: string;
  title: string;
  type: AcademyModuleType;
  contentUrl: string;
  durationMinutes: number;
}

export interface QuizQuestionOption {
  optionId: string;
  text: string;
}

export interface QuizQuestionPublic {
  questionId: string;
  prompt: string;
  options: QuizQuestionOption[];
}

export const ACADEMY_COURSE_CATEGORIES = [
  "compliance",
  "service_quality",
  "safety",
  "operations",
] as const;
export type AcademyCourseCategory = (typeof ACADEMY_COURSE_CATEGORIES)[number];

export interface AcademyCourseSummary {
  courseId: string;
  courseCode: string;
  title: string;
  category: AcademyCourseCategory;
  isRequired: boolean;
  validityDays: number | null;
  passingScore: number;
  version: number;
  modulesCount: number;
  userStatus?: TrainingStatus;
}

export interface AcademyCourseDetail extends AcademyCourseSummary {
  description: string;
  modules: AcademyModule[];
  questions: QuizQuestionPublic[];
}

export interface QuizSubmissionAnswer {
  questionId: string;
  selectedOptionId: string;
}

export interface QuizSubmissionCommand {
  courseVersion: number;
  answers: QuizSubmissionAnswer[];
}

export interface QuizResultRecord {
  attemptId: string;
  courseId: string;
  courseVersion: number;
  score: number;
  passed: boolean;
  attemptedAt: string;
  feedback?: string;
}

export interface DriverQuizAttemptAnswerSummary {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
}

export interface DriverQuizAttemptDetail extends QuizResultRecord {
  driverId: string;
  answersSummary: DriverQuizAttemptAnswerSummary[];
}

export interface DriverTrainingRecord {
  recordId: string;
  driverId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  status: TrainingStatus;
  highestScore: number | null;
  passed: boolean;
  attemptsCount: number;
  completedAt: string | null;
  expiresAt: string | null;
  isOverdue: boolean;
  lastAttemptAt: string | null;
}

export interface FleetTrainingSummaryRow {
  course: string;
  en: string;
  completed: number;
  total: number;
  pct: number;
}

export interface FleetTrainingView {
  fleetPartnerId: string;
  rows: FleetTrainingSummaryRow[];
  summary: {
    completionPct: string; // e.g. "95%"
    pendingHeadcount: string; // e.g. "5"
    overdueIncomplete: number;
  };
  source: "authoritative";
}

export interface FleetDriverRosterItem {
  driverId: string;
  driverName: string;
  courseCode: string;
  status: TrainingStatus;
  score: number | null;
  completedAt: string | null;
  isOverdue: boolean;
  latestAttemptId: string | null;
}

// ============================================================================
// 3. Family 3: Host Vehicle Ownership Restricted Projection (N03 / C012)
// ============================================================================

export interface HostVehicleContractPeriod {
  startAt: string;
  endAt: string;
  status: string;
}

export interface HostVehicleSummary {
  vehicleId: string;
  plateNo: string;
  vinMasked: string; // 遮蔽後 6 碼 (e.g. 1HGCR2F83HA******)
  vehicleForm: string; // sedan, mpv, etc.
  licenseClass: string; // taxi, rental, multi_taxi
  energyType: string; // fuel, electric, hybrid
  currentStatus: string; // active, maintenance, inactive
  operatingFleetName: string; // 營運車行名稱
  contractPeriod: HostVehicleContractPeriod | null;
}

export interface HostVehicleEarningsSummary {
  vehicleId: string;
  period: string; // YYYY-MM
  currency: "TWD";
  grossRevenue: number; // 該車產出之總車資
  platformFee: number; // 平台服務費
  fleetCommission: number | null; // 待車行分潤政策確定 (決策落點: SR-HOST-BE-001，暫為 null)
  netEarnings: number | null; // 車主淨分潤 (若未定 split 政策，為 null，不可自創偽數據)
  tripsCount: number; // 完成趟次
  operatingDays: number; // 出勤天數
  settlementStatus: "calculated" | "pending_policy";
}

export const HOST_VEHICLE_MAINTENANCE_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "overdue",
] as const;
export type HostVehicleMaintenanceStatus =
  (typeof HOST_VEHICLE_MAINTENANCE_STATUSES)[number];

export interface HostVehicleMaintenanceItem {
  maintenanceId: string;
  vehicleId: string;
  type: string;
  description: string;
  status: HostVehicleMaintenanceStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  cost: number | null;
  notesSummary: string | null;
}

export interface HostVehicleTripItem {
  tripId: string;
  vehicleId: string;
  startedAt: string;
  completedAt: string | null;
  areaSummary: string; // e.g. "大安區 → 南港區"
  distanceKm: number;
  fareAmount: number;
  status: string;
}

export const HOST_VEHICLE_CASE_CATEGORIES = [
  "vehicle_condition",
  "accident",
  "equipment",
  "service_feedback",
] as const;
export type HostVehicleCaseCategory =
  (typeof HOST_VEHICLE_CASE_CATEGORIES)[number];

export const HOST_VEHICLE_CASE_STATUSES = [
  "open",
  "investigating",
  "resolved",
  "closed",
] as const;
export type HostVehicleCaseStatus = (typeof HOST_VEHICLE_CASE_STATUSES)[number];

export interface HostVehicleCaseItem {
  caseId: string;
  vehicleId: string;
  category: HostVehicleCaseCategory;
  status: HostVehicleCaseStatus;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionSummary: string | null;
}

// ============================================================================
// 4. Family 4: Contract Operational Terms Read Model (N14 / C134)
// ============================================================================

export type ContractOperationalDataStatus =
  | "available"
  | "not_applicable"
  | "missing_data";

export interface ContractOperationalTerms {
  contractId: string;
  modifiableWindowMinutes: number | null;
  proofRequirements: string[] | null;
  waitingRuleMinutes: number | null;
  noShowRuleMinutes: number | null;
  slaProfileCode: string | null;
  effectiveVersion: string | null;
  authMode: string | null;
  status: ContractOperationalDataStatus;
}

export interface ContractOperationalViewRecord {
  contractId: string;
  modifiableWindow: {
    leadTimeMinutes: number;
    cutoffMinutes: number;
    description?: string;
  } | null;
  proofRequirements: {
    requiredDocuments: string[];
    signatureRequired: boolean;
    digitalProofAllowed: boolean;
  } | null;
  waitingRule: {
    gracePeriodMinutes: number;
    chargeableIntervalMinutes?: number;
  } | null;
  noShowRule: {
    thresholdMinutes: number;
    feeApplicable: boolean;
  } | null;
  slaProfile: {
    profileId: string;
    targetResponseMinutes: number;
    pickupWindowMinutes: number;
    businessDispatchSubtype?: string;
  } | null;
  effectiveVersion: {
    versionNumber: number;
    versionTag: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  } | null;
  authMode: {
    mode: string;
    eligibilityMode?: string;
  } | null;
  dataStatus: {
    modifiableWindow: ContractOperationalDataStatus;
    proofRequirements: ContractOperationalDataStatus;
    waitingRule: ContractOperationalDataStatus;
    noShowRule: ContractOperationalDataStatus;
    slaProfile: ContractOperationalDataStatus;
    effectiveVersion: ContractOperationalDataStatus;
    authMode: ContractOperationalDataStatus;
  };
}

// ============================================================================
// 5. System Remediation Error Codes & Catalog
// ============================================================================

export const SYSTEM_REMEDIATION_ERROR_CODES = {
  // Family 1: Driver Leave Workflow
  LEAVE_INVALID_TIME_RANGE: "LEAVE_INVALID_TIME_RANGE",
  LEAVE_MISSING_REQUIRED_FIELDS: "LEAVE_MISSING_REQUIRED_FIELDS",
  LEAVE_FORBIDDEN_ACCESS: "LEAVE_FORBIDDEN_ACCESS",
  LEAVE_NOT_FOUND: "LEAVE_NOT_FOUND",
  LEAVE_OVERLAPPING_REQUEST: "LEAVE_OVERLAPPING_REQUEST",
  LEAVE_INVALID_STATE_TRANSITION: "LEAVE_INVALID_STATE_TRANSITION",
  DRIVER_ON_LEAVE: "DRIVER_ON_LEAVE",

  // Family 2: Driver Academy & Fleet Training
  QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION:
    "QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION",
  COURSE_VERSION_STALE: "COURSE_VERSION_STALE",
  COURSE_NOT_FOUND: "COURSE_NOT_FOUND",
  ACADEMY_FORBIDDEN_FLEET_ACCESS: "ACADEMY_FORBIDDEN_FLEET_ACCESS",
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",

  // Family 3: Host Vehicle Ownership Restricted Projection
  HOST_UNAUTHORIZED: "HOST_UNAUTHORIZED",
  HOST_FORBIDDEN: "HOST_FORBIDDEN",
  HOST_VEHICLE_NOT_FOUND: "HOST_VEHICLE_NOT_FOUND",
  HOST_MUTATION_NOT_SUPPORTED: "HOST_MUTATION_NOT_SUPPORTED",

  // Family 4: Contract Operational Terms
  CONTRACT_OPERATIONAL_VIEW_NOT_FOUND: "CONTRACT_OPERATIONAL_VIEW_NOT_FOUND",
  CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN: "CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN",
} as const;

export type SystemRemediationErrorCode =
  (typeof SYSTEM_REMEDIATION_ERROR_CODES)[keyof typeof SYSTEM_REMEDIATION_ERROR_CODES];
