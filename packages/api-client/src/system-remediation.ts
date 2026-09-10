/**
 * System Remediation 20260906: Typed API Client Extension
 *
 * Provides typed methods and helpers for:
 * - Driver Leave Workflow (Gap N01, Capability C052)
 * - Driver Academy & Fleet Training (Gap N02, Capabilities C059, C071)
 * - Host Vehicle Restricted Projection (Gap N03, Capability C012)
 *
 * Authority: docs/04-uat/system-remediation-20260906/feature-contracts.md
 */

import type {
  AcademyCourseDetail,
  AcademyCourseSummary,
  ApiListData,
  ApiSuccessEnvelope,
  CreateDriverLeaveCommand,
  DriverLeaveQueryFilter,
  DriverLeaveRecord,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  FleetDriverRosterItem,
  FleetTrainingView,
  HostVehicleCaseItem,
  HostVehicleEarningsSummary,
  HostVehicleMaintenanceItem,
  HostVehicleSummary,
  HostVehicleTripItem,
  QuizResultRecord,
  QuizSubmissionCommand,
  ReviewDriverLeaveCommand,
  WithdrawDriverLeaveCommand,
} from "@drts/contracts";
import type { ApiClient, RequestOptions } from "./index";

export type {
  DriverLeaveType,
  DriverLeaveStatus,
  DriverLeaveRecord,
  CreateDriverLeaveCommand,
  WithdrawDriverLeaveCommand,
  ReviewDriverLeaveCommand,
  DriverLeaveQueryFilter,
  TrainingStatus,
  AcademyModuleType,
  AcademyModule,
  QuizQuestionOption,
  QuizQuestionPublic,
  AcademyCourseCategory,
  AcademyCourseSummary,
  AcademyCourseDetail,
  QuizSubmissionAnswer,
  QuizSubmissionCommand,
  QuizResultRecord,
  DriverQuizAttemptAnswerSummary,
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
  FleetTrainingSummaryRow,
  FleetTrainingView,
  FleetDriverRosterItem,
  HostVehicleContractPeriod,
  HostVehicleSummary,
  HostVehicleEarningsSummary,
  HostVehicleMaintenanceStatus,
  HostVehicleMaintenanceItem,
  HostVehicleTripItem,
  HostVehicleCaseCategory,
  HostVehicleCaseStatus,
  HostVehicleCaseItem,
  ContractOperationalDataStatus,
  ContractOperationalTerms,
  ContractOperationalViewRecord,
  SystemRemediationErrorCode,
} from "@drts/contracts";

export {
  DRIVER_LEAVE_TYPES,
  DRIVER_LEAVE_STATUSES,
  MAX_PAST_APPLICATION_GRACE_MS,
  TRAINING_STATUSES,
  ACADEMY_MODULE_TYPES,
  ACADEMY_COURSE_CATEGORIES,
  HOST_VEHICLE_MAINTENANCE_STATUSES,
  HOST_VEHICLE_CASE_CATEGORIES,
  HOST_VEHICLE_CASE_STATUSES,
  SYSTEM_REMEDIATION_ERROR_CODES,
} from "@drts/contracts";

export interface SystemRemediationClientInterface {
  // Family 1: Driver Leave Workflow
  createDriverLeave(
    command: CreateDriverLeaveCommand,
    options?: RequestOptions,
  ): Promise<DriverLeaveRecord>;
  listDriverLeaves(
    query?: DriverLeaveQueryFilter,
    options?: RequestOptions,
  ): Promise<ApiListData<DriverLeaveRecord>>;
  listDriverLeavesEnvelope(
    query?: DriverLeaveQueryFilter,
    options?: RequestOptions,
  ): Promise<ApiSuccessEnvelope<ApiListData<DriverLeaveRecord>>>;
  withdrawDriverLeave(
    leaveId: string,
    command?: WithdrawDriverLeaveCommand,
    options?: RequestOptions,
  ): Promise<DriverLeaveRecord>;
  reviewDriverLeave(
    leaveId: string,
    command: ReviewDriverLeaveCommand,
    options?: RequestOptions,
  ): Promise<DriverLeaveRecord>;

  // Family 2: Driver Academy & Fleet Training
  listAcademyCourses(
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<AcademyCourseSummary>>;
  getAcademyCourse(
    courseId: string,
    options?: RequestOptions,
  ): Promise<AcademyCourseDetail>;
  submitQuiz(
    courseId: string,
    command: QuizSubmissionCommand,
    options?: RequestOptions,
  ): Promise<QuizResultRecord>;
  listDriverTrainingRecords(
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<DriverTrainingRecord>>;
  getDriverQuizAttempt(
    courseId: string,
    attemptId: string,
    options?: RequestOptions,
  ): Promise<DriverQuizAttemptDetail>;
  getFleetTrainingSummary(options?: RequestOptions): Promise<FleetTrainingView>;
  listFleetDriverRoster(
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<FleetDriverRosterItem>>;
  getFleetDriverQuizAttempt(
    driverId: string,
    attemptId: string,
    options?: RequestOptions,
  ): Promise<DriverQuizAttemptDetail>;

  // Family 3: Host Vehicle Restricted Read-Only Projection
  listHostVehicles(
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<HostVehicleSummary>>;
  getHostVehicleEarnings(
    vehicleId: string,
    query?: { month?: string },
    options?: RequestOptions,
  ): Promise<HostVehicleEarningsSummary>;
  listHostVehicleMaintenance(
    vehicleId: string,
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<HostVehicleMaintenanceItem>>;
  listHostVehicleTrips(
    vehicleId: string,
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<HostVehicleTripItem>>;
  listHostVehicleCases(
    vehicleId: string,
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<HostVehicleCaseItem>>;
}

/**
 * Functional adapter functions allowing modular invocation over any ApiClient instance.
 */
export async function createDriverLeaveRequest(
  client: ApiClient,
  command: CreateDriverLeaveCommand,
  options?: RequestOptions,
): Promise<DriverLeaveRecord> {
  return client.createDriverLeave(command, options);
}

export async function listDriverLeaveRequests(
  client: ApiClient,
  query?: DriverLeaveQueryFilter,
  options?: RequestOptions,
): Promise<ApiListData<DriverLeaveRecord>> {
  return client.listDriverLeaves(query, options);
}

export async function withdrawDriverLeaveRequest(
  client: ApiClient,
  leaveId: string,
  command?: WithdrawDriverLeaveCommand,
  options?: RequestOptions,
): Promise<DriverLeaveRecord> {
  return client.withdrawDriverLeave(leaveId, command, options);
}

export async function reviewDriverLeaveRequest(
  client: ApiClient,
  leaveId: string,
  command: ReviewDriverLeaveCommand,
  options?: RequestOptions,
): Promise<DriverLeaveRecord> {
  return client.reviewDriverLeave(leaveId, command, options);
}

export async function getAcademyCourses(
  client: ApiClient,
  query?: { page?: number; pageSize?: number },
  options?: RequestOptions,
): Promise<ApiListData<AcademyCourseSummary>> {
  return client.listAcademyCourses(query, options);
}

export async function getAcademyCourseDetail(
  client: ApiClient,
  courseId: string,
  options?: RequestOptions,
): Promise<AcademyCourseDetail> {
  return client.getAcademyCourse(courseId, options);
}

export async function submitCourseQuiz(
  client: ApiClient,
  courseId: string,
  command: QuizSubmissionCommand,
  options?: RequestOptions,
): Promise<QuizResultRecord> {
  return client.submitQuiz(courseId, command, options);
}

export async function getDriverTrainingHistory(
  client: ApiClient,
  query?: { page?: number; pageSize?: number },
  options?: RequestOptions,
): Promise<ApiListData<DriverTrainingRecord>> {
  return client.listDriverTrainingRecords(query, options);
}

export async function getFleetTrainingDashboard(
  client: ApiClient,
  options?: RequestOptions,
): Promise<FleetTrainingView> {
  return client.getFleetTrainingSummary(options);
}

export async function getHostOwnedVehicles(
  client: ApiClient,
  query?: { page?: number; pageSize?: number },
  options?: RequestOptions,
): Promise<ApiListData<HostVehicleSummary>> {
  return client.listHostVehicles(query, options);
}

export async function getHostVehicleEarningsReport(
  client: ApiClient,
  vehicleId: string,
  query?: { month?: string },
  options?: RequestOptions,
): Promise<HostVehicleEarningsSummary> {
  return client.getHostVehicleEarnings(vehicleId, query, options);
}
