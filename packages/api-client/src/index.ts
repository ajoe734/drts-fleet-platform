/**
 * @drts/api-client - Shared API client for DRTS client surfaces
 *
 * Provides a typed fetch wrapper around the Phase 1 API.
 * Supports both app-issued Bearer auth and legacy bootstrap header fallback.
 */

import type {
  AcknowledgeOpsApprovalRequestBreachCommand,
  AddComplaintCaseNoteCommand,
  AddReconciliationIssueCommentCommand,
  ApplyManualFareOverrideCommand,
  ApproveExceptionOverrideCommand,
  AnnounceCallAgentIdentityCommand,
  ApproveReimbursementBatchCommand,
  AuditLogRecord,
  AssignReconciliationIssueCommand,
  AssignComplaintCaseCommand,
  AttachCallRecordingCommand,
  ApiSuccessEnvelope,
  AttendanceRecord,
  BookingRecord,
  CallbackTaskRecord,
  CallSessionRecord,
  ClockInCommand,
  ClockOutCommand,
  CloseCallSessionCommand,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  CompleteCallbackTaskCommand,
  CreateDriverMasterCommand,
  CreateEvidenceDeletionExceptionCommand,
  CreateEvidenceLegalHoldCommand,
  DriverForwardedOrderAcceptCommand,
  DriverForwardedOrderRejectCommand,
  CreatePartnerChannelEntryCommand,
  CreatePartnerBootstrapSessionCommand,
  IssuePartnerIngressCredentialCommand,
  CreateTenantBootstrapSessionCommand,
  CreateDriverProfileCommand,
  CreateOwnedOrderCommand,
  CreatePublicInfoVersionCommand,
  CreatePlatformAdminUserCommand,
  CreatePlatformNoticeCommand,
  CreatePlatformPricingRuleCommand,
  CreatePlatformTenantCommand,
  CreateReportJobCommand,
  CreateTenantBookingCommand,
  CreateCallCenterOrderCommand,
  CreateCallbackTaskCommand,
  CreateComplaintCaseCommand,
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  CreateReconciliationIssueCommand,
  CompleteVehicleDebrandingCommand,
  CreateMaintenanceRecordCommand,
  DispatchExclusivityRecord,
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DisableTenantCostCenterCommand,
  DriverAcceptTaskCommand,
  DriverArrivedPickupCommand,
  DriverDeviceProvisioningSession,
  DriverEtaResponse,
  DriverLocationSnapshot,
  DriverDepartTaskCommand,
  DriverFeePlanRecord,
  DriverLocationHeartbeatCommand,
  DriverProfileRecord,
  DriverRegistryRecord,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  DriverStatementRecord,
  DriverTaskRecord,
  UnifiedDriverTaskView,
  ForwardedDriverActionResponse,
  EvidenceDeletionExceptionRecord,
  EvidenceGovernanceCatalog,
  EvidenceLegalHoldRecord,
  EvidenceRetentionFamily,
  EvidenceRetentionPolicyRecord,
  EvidenceSubjectGovernanceRecord,
  FeatureFlag,
  FeatureFlagSummary,
  FilingPackageAccepted,
  FilingPackageDetailRecord,
  FilingPackageListRecord,
  GenerateDriverStatementCommand,
  GenerateFilingPackageCommand,
  GeneratePlacardVersionCommand,
  GenerateTenantInvoiceCommand,
  IncidentRecord,
  IncidentTimelineEntry,
  RecordServiceRecoveryActionCommand,
  ServiceRecoveryActionRecord,
  InitiateVehicleOffboardingCommand,
  InsurancePolicyRecord,
  IssueTenantApiKeyCommand,
  LinkCallOrderCommand,
  MaintenanceRecord,
  MarkReimbursementPaidCommand,
  NotificationRecord,
  OpenCallSessionCommand,
  OperationalObservabilitySnapshot,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PartnerBootstrapSession,
  PartnerEligibilityReviewQueueItem,
  PartnerEligibilityReviewResolution,
  PartnerEligibilityVerificationRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
  PlacardVersionRecord,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  PlatformEarningsByPlatformResponse,
  PlatformEarningsSummary,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformTenantGovernanceSummaryQuery,
  PlatformTenantGovernanceSummaryResponse,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  PlatformPricingRuleRecord,
  ProductRuleCatalog,
  PublishDriverFeePlanCommand,
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  PublicInfoVersionRecord,
  QuoteCallEtaCommand,
  RefreshDriverDeviceSessionCommand,
  RejectExclusivityCommand,
  ReimbursementBatchRecord,
  ReconciliationIssueRecord,
  RevokePartnerIngressCredentialCommand,
  RegisterDriverDeviceCommand,
  ReopenComplaintCaseCommand,
  ReleaseEvidenceLegalHoldCommand,
  ReportJobAccepted,
  ReportJobDetailRecord,
  ReportJobRecord,
  ResolveReconciliationIssueCommand,
  ResolveComplaintCaseCommand,
  ResolveEvidenceDeletionExceptionCommand,
  ReopenReconciliationIssueCommand,
  RejectExceptionOverrideCommand,
  RequestExceptionOverrideCommand,
  ResolveExceptionHoldCommand,
  ResolvePartnerEligibilityReviewCommand,
  RevokeDriverDeviceBindingCommand,
  RotateTenantApiKeyCommand,
  SetPlatformMaintenanceModeCommand,
  SetPlatformTenantRolloutStageCommand,
  SetPlatformOfflineCommand,
  SetPlatformOnlineCommand,
  PlatformAdapter,
  UpdatePlatformAdapterCommand,
  SettlementMatrixRecord,
  ShiftRecord,
  TenantAddressRecord,
  TenantAddressExportViewRecord,
  TenantApiKeyRecord,
  TenantApiKeyIssued,
  TenantBillingProfile,
  TenantBootstrapSession,
  TenantBookingApprovalRequestRecord,
  TenantApprovalEvaluationResult,
  TenantApprovalRuleRecord,
  TenantBookingQuotaImpactPreview,
  ApproveTenantBookingApprovalRequestCommand,
  EscalateTenantBookingApprovalRequestCommand,
  EvaluateTenantApprovalRuleCommand,
  ListTenantBookingApprovalRequestsQuery,
  ListOpsPendingApprovalRequestsQuery,
  ListTenantApprovalRulesQuery,
  NudgeOpsApprovalRequestCommand,
  OpsPendingApprovalRequestRecord,
  ReorderTenantApprovalRulesCommand,
  RejectTenantBookingApprovalRequestCommand,
  TenantCostCenterCoverageReport,
  TenantCostCenterRecord,
  TenantCostCenterQuotaSummary,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
  TenantPassengerRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaPolicyRecord,
  TenantQuotaSummary,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  TransferCallToComplaintCommand,
  TransferCallToIncidentCommand,
  EscalateComplaintToIncidentCommand,
  LinkComplaintToIncidentCommand,
  SubmitExclusivityReviewCommand,
  ApproveExclusivityCommand,
  UpdateDriverMasterLifecycleCommand,
  UpdateDriverWorkStateCommand,
  UpdateDriverProfileCommand,
  UpdateIncidentCommand,
  UpdateMaintenanceRecordCommand,
  UpdatePlatformAdminUserRoleCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePartnerChannelEntryCommand,
  UpdatePlatformTenantSettingsCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpdateTenantWebhookEndpointCommand,
  UpdateVehicleComplianceCommand,
  UpsertTenantAddressCommand,
  UpsertTenantApprovalRuleCommand,
  UpsertTenantCostCenterCommand,
  UpsertTenantPassengerCommand,
  UpsertTenantQuotaPolicyCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
  VerifyPartnerEligibilityCommand,
  WebhookDeliveryRecord,
  CancelOwnedOrderCommand,
  AssignDispatchCommand,
  ReassignDispatchCommand,
  DriverCompleteTaskCommand,
  UpdateTenantBookingCommand,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  InviteTenantRoleCommand,
  AcknowledgeTenantRoleCommand,
} from "@drts/contracts";

export interface ApiClientConfig {
  baseUrl: string;
  /** Headers to include in every request (auth identity, tenant context) */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Optional path transform applied before concatenating with baseUrl. */
  pathTransform?: (path: string) => string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

interface ListEnvelope<T> {
  items: T[];
}

interface ItemEnvelope<T> {
  item: T;
}

function snakeToCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function deepToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepToCamelCase(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        snakeToCamelCase(key),
        deepToCamelCase(nestedValue),
      ]),
    );
  }

  return value;
}

function createRequestToken(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === target);
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private pathTransform: ((path: string) => string) | undefined;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...config.defaultHeaders,
    };
    this.timeout = config.timeout ?? 30000;
    this.pathTransform = config.pathTransform;
  }

  /**
   * Generic GET with envelope unwrapping.
   * Returns the data payload directly (not the envelope).
   */
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  /**
   * Generic POST with envelope unwrapping.
   */
  async post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, options);
  }

  /**
   * Generic PATCH with envelope unwrapping.
   */
  async patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, options);
  }

  /**
   * Generic PUT with envelope unwrapping.
   */
  async put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, options);
  }

  /**
   * Generic DELETE with envelope unwrapping.
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  private async getList<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<T[]> {
    const result = await this.get<T[] | ListEnvelope<T>>(path, options);
    return Array.isArray(result) ? result : (result.items ?? []);
  }

  private async getItem<T>(path: string, options?: RequestOptions): Promise<T> {
    const result = await this.get<T | ItemEnvelope<T>>(path, options);
    return this.unwrapItem(result);
  }

  private unwrapItem<T>(result: T | ItemEnvelope<T>): T {
    if (
      result &&
      typeof result === "object" &&
      "item" in result &&
      Object.keys(result).includes("item")
    ) {
      return (result as ItemEnvelope<T>).item;
    }

    return result as T;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    const requestPath = this.pathTransform ? this.pathTransform(path) : path;
    const url = `${this.baseUrl}${requestPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = {
        ...this.defaultHeaders,
        ...options?.headers,
      };
      if (!hasHeader(headers, "x-request-id")) {
        headers["X-Request-Id"] = createRequestToken();
      }
      if (
        method.toUpperCase() === "POST" &&
        !hasHeader(headers, "idempotency-key")
      ) {
        headers["Idempotency-Key"] = createRequestToken();
      }

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (options?.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, init);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const envelope: ApiSuccessEnvelope<T> = await response.json();
      return deepToCamelCase(envelope.data) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Feature Flags ──

  async getFeatureFlags(query?: {
    tenantId?: string;
  }): Promise<FeatureFlagSummary> {
    const searchParams = new URLSearchParams();
    if (query?.tenantId) {
      searchParams.set("tenantId", query.tenantId);
    }
    const qs = searchParams.toString();
    const path = qs ? `/api/admin/flags?${qs}` : "/api/admin/flags";
    return this.get<FeatureFlagSummary>(path);
  }

  async getFeatureFlag(key: string): Promise<FeatureFlag> {
    return this.get<FeatureFlag>(`/api/admin/flags/${key}`);
  }

  async updateFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlag> {
    return this.patch<FeatureFlag>(`/api/admin/flags/${key}`, {
      body: { enabled },
    });
  }

  async isFeatureEnabled(key: string): Promise<boolean> {
    const result = await this.get<{ key: string; enabled: boolean }>(
      `/api/admin/flags/${key}/enabled`,
    );
    return result.enabled;
  }

  // ── Identity ──

  async getIdentityContext() {
    return this.get("/api/identity/context");
  }

  async createTenantBootstrapSession(
    command: CreateTenantBootstrapSessionCommand,
  ): Promise<TenantBootstrapSession> {
    return this.post<TenantBootstrapSession>(
      "/api/auth/tenant/bootstrap-session",
      {
        body: command,
      },
    );
  }

  async createPartnerBootstrapSession(
    command: CreatePartnerBootstrapSessionCommand,
  ): Promise<PartnerBootstrapSession> {
    return this.post<PartnerBootstrapSession>(
      "/api/auth/partner/bootstrap-session",
      {
        body: command,
      },
    );
  }

  async listPartnerEntries(): Promise<PartnerChannelEntryRecord[]> {
    return this.getList<PartnerChannelEntryRecord>("/api/partner/entries");
  }

  async getPartnerEntry(entrySlug: string): Promise<PartnerChannelEntryRecord> {
    return this.get<PartnerChannelEntryRecord>(
      `/api/partner/entries/${encodeURIComponent(entrySlug)}`,
    );
  }

  async verifyPartnerEligibility(
    command: VerifyPartnerEligibilityCommand,
  ): Promise<PartnerEligibilityVerificationRecord> {
    return this.post<PartnerEligibilityVerificationRecord>(
      "/api/partner/eligibility/verify",
      {
        body: command,
      },
    );
  }

  async getPartnerEligibilityVerification(
    eligibilityVerificationId: string,
  ): Promise<PartnerEligibilityVerificationRecord> {
    return this.get<PartnerEligibilityVerificationRecord>(
      `/api/partner/eligibility/${encodeURIComponent(eligibilityVerificationId)}`,
    );
  }

  async listPartnerEligibilityReviewQueue(): Promise<
    PartnerEligibilityReviewQueueItem[]
  > {
    return this.getList<PartnerEligibilityReviewQueueItem>(
      "/api/ops/partner/eligibility/reviews",
    );
  }

  async resolvePartnerEligibilityReview(
    command: ResolvePartnerEligibilityReviewCommand,
  ): Promise<PartnerEligibilityReviewResolution> {
    return this.post<PartnerEligibilityReviewResolution>(
      "/api/ops/partner/eligibility/reviews/resolve",
      {
        body: command,
      },
    );
  }

  async listOpsPendingApprovalRequests(
    query: ListOpsPendingApprovalRequestsQuery = {},
  ): Promise<OpsPendingApprovalRequestRecord[]> {
    const params = new URLSearchParams();
    if (query.tenantId) {
      params.set("tenantId", query.tenantId);
    }
    if (query.status) {
      params.set("status", query.status);
    }
    if (query.expiresBefore) {
      params.set("expiresBefore", query.expiresBefore);
    }
    return this.getList<OpsPendingApprovalRequestRecord>(
      `/api/ops/approval-requests${params.size > 0 ? `?${params.toString()}` : ""}`,
    );
  }

  async nudgeOpsApprovalRequest(
    approvalRequestId: string,
    command: NudgeOpsApprovalRequestCommand = {},
  ): Promise<OpsPendingApprovalRequestRecord> {
    return this.post<OpsPendingApprovalRequestRecord>(
      `/api/ops/approval-requests/${encodeURIComponent(approvalRequestId)}/nudge`,
      {
        body: command,
      },
    );
  }

  async acknowledgeOpsBreach(
    approvalRequestId: string,
    command: AcknowledgeOpsApprovalRequestBreachCommand = {},
  ): Promise<OpsPendingApprovalRequestRecord> {
    return this.post<OpsPendingApprovalRequestRecord>(
      `/api/ops/approval-requests/${encodeURIComponent(approvalRequestId)}/acknowledge-breach`,
      {
        body: command,
      },
    );
  }

  // ── Owned Mobility: Orders ──

  async createOrder(command: CreateOwnedOrderCommand) {
    return this.post("/api/orders", { body: command });
  }

  async listOrders(): Promise<OwnedOrderRecord[]> {
    return this.getList<OwnedOrderRecord>("/api/orders");
  }

  async getOrder(id: string) {
    return this.get<OwnedOrderRecord>(`/api/orders/${id}`);
  }

  async getOrderDispatchTrace(
    orderId: string,
  ): Promise<DispatchTraceLogRecord[]> {
    return this.getList<DispatchTraceLogRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/dispatch-trace`,
    );
  }

  async cancelOrder(id: string, command: CancelOwnedOrderCommand) {
    return this.post(`/api/orders/${id}/cancel`, { body: command });
  }

  async updateOrder(id: string, command: UpdateTenantBookingCommand) {
    return this.patch(`/api/orders/${id}`, { body: command });
  }

  async applyManualFareOverride(
    orderId: string,
    command: ApplyManualFareOverrideCommand,
  ) {
    return this.post<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/manual-fare-override`,
      {
        body: command,
      },
    );
  }

  // ── Owned Mobility: Call Center ──

  async createCallCenterOrder(command: CreateCallCenterOrderCommand) {
    return this.post<{
      orderId: string;
      orderSource: string;
      callId: string;
      recordingId: string | null;
      status: string;
    }>("/api/call-center/orders", { body: command });
  }

  // ── Owned Mobility: Tenant Bookings ──

  async createTenantBooking(command: CreateTenantBookingCommand) {
    return this.post("/api/tenant/bookings", { body: command });
  }

  async listTenantBookings(): Promise<BookingRecord[]> {
    return this.getList<BookingRecord>("/api/tenant/bookings");
  }

  async getTenantBooking(bookingId: string) {
    return this.get(`/api/tenant/bookings/${encodeURIComponent(bookingId)}`);
  }

  async updateTenantBooking(
    bookingId: string,
    command: UpdateTenantBookingCommand,
  ) {
    return this.request(
      "PUT",
      `/api/tenant/bookings/${encodeURIComponent(bookingId)}`,
      { body: command },
    );
  }

  async cancelTenantBooking(
    bookingId: string,
    command: CancelOwnedOrderCommand,
  ) {
    return this.post(
      `/api/tenant/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { body: command },
    );
  }

  // ── Owned Mobility: Dispatch ──

  async dispatchOrder(orderId: string) {
    return this.post(`/api/orders/${orderId}/dispatch`);
  }

  async redispatchOrder(
    orderId: string,
    reasonCode = "operator_redispatch",
    options?: {
      reasonNote?: string;
      operatorId?: string;
      escalationTarget?: "ops_supervisor" | "dispatch_manager" | null;
    },
  ) {
    return this.post(`/api/orders/${orderId}/redispatch`, {
      body: {
        reasonCode,
        reasonNote: options?.reasonNote,
        operatorId: options?.operatorId,
        escalationTarget: options?.escalationTarget,
      },
    });
  }

  async handleDispatchTimeout(
    orderId: string,
    timeoutReasonCode: "acceptance_timeout" | "matching_timeout",
  ) {
    return this.post(`/api/orders/${orderId}/dispatch-timeout`, {
      body: { timeoutReasonCode },
    });
  }

  async resolveNoSupply(
    orderId: string,
    resolution: "retry_dispatch" | "cancel_with_notification",
    operatorId?: string,
  ) {
    return this.post(`/api/orders/${orderId}/resolve-no-supply`, {
      body: { resolution, operatorId },
    });
  }

  async resolveExceptionHold(
    orderId: string,
    command: ResolveExceptionHoldCommand,
  ) {
    return this.post<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/resolve-exception-hold`,
      {
        body: command,
      },
    );
  }

  async requestExceptionOverride(
    orderId: string,
    command: RequestExceptionOverrideCommand,
  ) {
    return this.post<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/request-override`,
      { body: command },
    );
  }

  async approveExceptionOverride(
    orderId: string,
    command: ApproveExceptionOverrideCommand,
  ) {
    return this.post<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/approve-override`,
      { body: command },
    );
  }

  async rejectExceptionOverride(
    orderId: string,
    command: RejectExceptionOverrideCommand,
  ) {
    return this.post<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}/reject-override`,
      { body: command },
    );
  }

  async listDispatchJobs(): Promise<DispatchJobRecord[]> {
    const res = await this.get<ListEnvelope<DispatchJobRecord>>(
      "/api/dispatch/tasks",
    );
    return res.items ?? [];
  }

  async listDispatchCandidates(
    dispatchJobId: string,
  ): Promise<DispatchCandidate[]> {
    const res = await this.get<ListEnvelope<DispatchCandidate>>(
      `/api/dispatch/tasks/${dispatchJobId}/candidates`,
    );
    return res.items ?? [];
  }

  async assignDispatch(command: AssignDispatchCommand) {
    return this.post("/api/dispatch/assign", { body: command });
  }

  async reassignDispatch(command: ReassignDispatchCommand) {
    return this.post("/api/dispatch/reassign", { body: command });
  }

  async queueCheckIn(command: { vehicleId: string; siteId: string }) {
    return this.post("/api/dispatch/queue/check-in", { body: command });
  }

  async queueCheckOut(command: { vehicleId: string; siteId: string }) {
    return this.post("/api/dispatch/queue/check-out", { body: command });
  }

  // ── Owned Mobility: Driver Tasks ──

  async listDriverTasks(): Promise<DriverTaskRecord[]> {
    return this.getList<DriverTaskRecord>("/api/driver/tasks");
  }

  async listUnifiedDriverTasks(filters?: {
    driverId?: string;
  }): Promise<UnifiedDriverTaskView[]> {
    const params = new URLSearchParams();
    if (filters?.driverId) params.set("driverId", filters.driverId);
    const query = params.toString();
    const url = query
      ? `/api/driver/task-views?${query}`
      : "/api/driver/task-views";
    return this.getList<UnifiedDriverTaskView>(url);
  }

  async getUnifiedDriverTask(
    taskId: string,
    filters?: { driverId?: string },
  ): Promise<UnifiedDriverTaskView> {
    const params = new URLSearchParams();
    if (filters?.driverId) params.set("driverId", filters.driverId);
    const query = params.toString();
    const url = query
      ? `/api/driver/task-views/${taskId}?${query}`
      : `/api/driver/task-views/${taskId}`;
    return this.get<UnifiedDriverTaskView>(url);
  }

  async acceptForwardedOrder(
    taskId: string,
    command: DriverForwardedOrderAcceptCommand = {},
  ): Promise<ForwardedDriverActionResponse> {
    return this.post<ForwardedDriverActionResponse>(
      `/api/driver/forwarded-orders/${taskId}/accept`,
      { body: command },
    );
  }

  async rejectForwardedOrder(
    taskId: string,
    command: DriverForwardedOrderRejectCommand = {},
  ): Promise<ForwardedDriverActionResponse> {
    return this.post<ForwardedDriverActionResponse>(
      `/api/driver/forwarded-orders/${taskId}/reject`,
      { body: command },
    );
  }

  async acceptTask(taskId: string, command: DriverAcceptTaskCommand) {
    return this.post(`/api/driver/tasks/${taskId}/accept`, { body: command });
  }

  async rejectTask(taskId: string, command: DriverRejectTaskCommand) {
    return this.post(`/api/driver/tasks/${taskId}/reject`, { body: command });
  }

  async departTask(taskId: string, command: DriverDepartTaskCommand) {
    return this.post(`/api/driver/tasks/${taskId}/depart`, { body: command });
  }

  async arrivedPickupTask(taskId: string, command: DriverArrivedPickupCommand) {
    return this.post(`/api/driver/tasks/${taskId}/arrived_pickup`, {
      body: command,
    });
  }

  async startTask(taskId: string, command: DriverStartTaskCommand) {
    return this.post(`/api/driver/tasks/${taskId}/start`, { body: command });
  }

  async completeTask(
    taskId: string,
    command: DriverCompleteTaskCommand,
    options?: RequestOptions,
  ): Promise<DriverTaskRecord> {
    return this.post(`/api/driver/tasks/${taskId}/complete`, {
      body: command,
      ...(options?.headers ? { headers: options.headers } : {}),
    });
  }

  // ── Call Center ──

  async listCallSessions(): Promise<CallSessionRecord[]> {
    return this.getList<CallSessionRecord>("/api/callcenter/sessions");
  }

  async openCallSession(command: OpenCallSessionCommand) {
    return this.post<CallSessionRecord>("/api/callcenter/sessions", {
      body: command,
    });
  }

  async getCallSession(id: string) {
    return this.get<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(id)}`,
    );
  }

  async announceCallAgentIdentity(
    callId: string,
    command: AnnounceCallAgentIdentityCommand,
  ) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/announce-identity`,
      { body: command },
    );
  }

  async quoteCallEta(callId: string, command: QuoteCallEtaCommand) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/eta`,
      { body: command },
    );
  }

  async linkCallOrder(callId: string, command: LinkCallOrderCommand) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/link-order`,
      { body: command },
    );
  }

  async attachRecordingCallback(
    callId: string,
    command: AttachCallRecordingCommand,
  ) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/recording-callback`,
      { body: command },
    );
  }

  async closeCallSession(id: string, command: CloseCallSessionCommand = {}) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(id)}/close`,
      { body: command },
    );
  }

  async listCallbackTasks(): Promise<CallbackTaskRecord[]> {
    return this.getList<CallbackTaskRecord>("/api/callcenter/callbacks");
  }

  async createCallbackTask(callId: string, command: CreateCallbackTaskCommand) {
    return this.post<CallbackTaskRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/callbacks`,
      { body: command },
    );
  }

  async completeCallbackTask(
    callbackTaskId: string,
    command: CompleteCallbackTaskCommand = {},
  ) {
    return this.post<CallbackTaskRecord>(
      `/api/callcenter/callbacks/${encodeURIComponent(callbackTaskId)}/complete`,
      { body: command },
    );
  }

  async transferCallToComplaint(
    callId: string,
    command: TransferCallToComplaintCommand,
  ) {
    return this.post<{
      session: CallSessionRecord;
      complaintCase: ComplaintCaseRecord;
    }>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/transfer-to-complaint`,
      { body: command },
    );
  }

  async transferCallToIncident(
    callId: string,
    command: TransferCallToIncidentCommand,
  ) {
    return this.post<{
      session: CallSessionRecord;
      incident: IncidentRecord;
    }>(
      `/api/callcenter/sessions/${encodeURIComponent(callId)}/transfer-to-incident`,
      { body: command },
    );
  }

  // ── Complaint ──

  async listComplaints(): Promise<ComplaintCaseRecord[]> {
    return this.getList<ComplaintCaseRecord>("/api/complaints");
  }

  async createComplaint(command: CreateComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>("/api/complaints", { body: command });
  }

  async getComplaint(caseNo: string) {
    return this.getItem<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}`,
    );
  }

  async getComplaintTimeline(
    caseNo: string,
  ): Promise<ComplaintTimelineEntry[]> {
    return this.getList<ComplaintTimelineEntry>(
      `/api/complaints/${encodeURIComponent(caseNo)}/timeline`,
    );
  }

  async assignComplaint(caseNo: string, command: AssignComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/assign`,
      { body: command },
    );
  }

  async addComplaintNote(caseNo: string, command: AddComplaintCaseNoteCommand) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/notes`,
      { body: command },
    );
  }

  async getComplaintExportView(
    caseNo: string,
  ): Promise<ComplaintExportViewRecord> {
    return this.getItem<ComplaintExportViewRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/export`,
    );
  }

  async reopenComplaint(caseNo: string, command: ReopenComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/reopen`,
      { body: command },
    );
  }

  async resolveComplaint(caseNo: string, command: ResolveComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/resolve`,
      { body: command },
    );
  }

  async closeComplaint(caseNo: string, command: ResolveComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/close`,
      { body: command },
    );
  }

  async markComplaintSlaBreach(caseNo: string) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/sla-breach`,
    );
  }

  async escalateComplaintToIncident(
    caseNo: string,
    command: EscalateComplaintToIncidentCommand,
  ) {
    return this.post<{
      complaintCase: ComplaintCaseRecord;
      incident: IncidentRecord;
    }>(`/api/complaints/${encodeURIComponent(caseNo)}/escalate-to-incident`, {
      body: command,
    });
  }

  async linkComplaintToIncident(
    caseNo: string,
    command: LinkComplaintToIncidentCommand,
  ) {
    return this.post<ComplaintCaseRecord>(
      `/api/complaints/${encodeURIComponent(caseNo)}/link-incident`,
      { body: command },
    );
  }

  // ── Billing ──

  async getBillingProfile(): Promise<TenantBillingProfile> {
    return this.get<TenantBillingProfile>("/api/tenant/billing/profile");
  }

  async listInvoices(): Promise<TenantInvoiceRecord[]> {
    return this.getList<TenantInvoiceRecord>("/api/tenant/invoices");
  }

  async generateInvoice(command: GenerateTenantInvoiceCommand) {
    return this.post("/api/tenant/invoices/generate", { body: command });
  }

  async listDriverStatements(
    period?: string,
  ): Promise<DriverStatementRecord[]> {
    const url = period
      ? `/api/driver-statements?period=${encodeURIComponent(period)}`
      : "/api/driver-statements";
    return this.getList<DriverStatementRecord>(url);
  }

  async getDriverStatement(
    statementId: string,
  ): Promise<DriverStatementRecord> {
    return this.get<DriverStatementRecord>(
      `/api/driver-statements/${encodeURIComponent(statementId)}`,
    );
  }

  async listDriverFeePlans(): Promise<DriverFeePlanRecord[]> {
    return this.getList<DriverFeePlanRecord>("/api/driver-fee-plans");
  }

  async publishDriverFeePlan(command: PublishDriverFeePlanCommand) {
    return this.post("/api/driver-fee-plans/publish", { body: command });
  }

  async generateDriverStatements(command: GenerateDriverStatementCommand) {
    return this.post("/api/driver-statements/generate", { body: command });
  }

  async listReimbursementBatches(filters?: {
    status?: ReimbursementBatchRecord["status"];
    periodMonth?: string;
    driverId?: string;
    statementId?: string;
  }): Promise<ReimbursementBatchRecord[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.periodMonth) params.set("periodMonth", filters.periodMonth);
    if (filters?.driverId) params.set("driverId", filters.driverId);
    if (filters?.statementId) params.set("statementId", filters.statementId);
    const query = params.toString();
    const url = query ? `/api/reimbursements?${query}` : "/api/reimbursements";
    return this.getList<ReimbursementBatchRecord>(url);
  }

  async approveReimbursementBatch(
    batchId: string,
    command: ApproveReimbursementBatchCommand,
  ): Promise<ReimbursementBatchRecord> {
    return this.post<ReimbursementBatchRecord>(
      `/api/reimbursements/${encodeURIComponent(batchId)}/approve`,
      { body: command },
    );
  }

  async markReimbursementPaid(
    batchId: string,
    command: MarkReimbursementPaidCommand,
  ): Promise<ReimbursementBatchRecord> {
    return this.post<ReimbursementBatchRecord>(
      `/api/reimbursements/${encodeURIComponent(batchId)}/pay`,
      { body: command },
    );
  }

  async listReconciliationIssues(filters?: {
    status?: ReconciliationIssueRecord["status"];
    issueType?: ReconciliationIssueRecord["issueType"];
    channelKey?: string;
  }): Promise<ReconciliationIssueRecord[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.issueType) params.set("issueType", filters.issueType);
    if (filters?.channelKey) params.set("channelKey", filters.channelKey);
    const query = params.toString();
    const url = query
      ? `/api/settlement/reconciliation-issues?${query}`
      : "/api/settlement/reconciliation-issues";
    return this.getList<ReconciliationIssueRecord>(url);
  }

  async createReconciliationIssue(
    command: CreateReconciliationIssueCommand,
  ): Promise<ReconciliationIssueRecord> {
    return this.post<ReconciliationIssueRecord>(
      "/api/settlement/reconciliation-issues",
      { body: command },
    );
  }

  async assignReconciliationIssue(
    issueId: string,
    command: AssignReconciliationIssueCommand,
  ): Promise<ReconciliationIssueRecord> {
    return this.post<ReconciliationIssueRecord>(
      `/api/settlement/reconciliation-issues/${encodeURIComponent(issueId)}/assign`,
      { body: command },
    );
  }

  async addReconciliationIssueComment(
    issueId: string,
    command: AddReconciliationIssueCommentCommand,
  ): Promise<ReconciliationIssueRecord> {
    return this.post<ReconciliationIssueRecord>(
      `/api/settlement/reconciliation-issues/${encodeURIComponent(issueId)}/comment`,
      { body: command },
    );
  }

  async resolveReconciliationIssue(
    issueId: string,
    command: ResolveReconciliationIssueCommand,
  ): Promise<ReconciliationIssueRecord> {
    return this.post<ReconciliationIssueRecord>(
      `/api/settlement/reconciliation-issues/${encodeURIComponent(issueId)}/resolve`,
      { body: command },
    );
  }

  async reopenReconciliationIssue(
    issueId: string,
    command: ReopenReconciliationIssueCommand,
  ): Promise<ReconciliationIssueRecord> {
    return this.post<ReconciliationIssueRecord>(
      `/api/settlement/reconciliation-issues/${encodeURIComponent(issueId)}/reopen`,
      { body: command },
    );
  }

  // ── Platform Presence ──

  async getPlatformPresence(filters?: {
    driverId?: string;
  }): Promise<PlatformPresenceSummary> {
    const params = new URLSearchParams();
    if (filters?.driverId) params.set("driverId", filters.driverId);
    const query = params.toString();
    const url = query
      ? `/api/platform-presence?${query}`
      : "/api/platform-presence";
    return this.get<PlatformPresenceSummary>(url);
  }

  async setPlatformOnline(
    command: SetPlatformOnlineCommand,
    filters?: { driverId?: string },
  ): Promise<PlatformPresenceRecord> {
    const params = new URLSearchParams();
    if (filters?.driverId) params.set("driverId", filters.driverId);
    const query = params.toString();
    const url = query
      ? `/api/platform-presence/online?${query}`
      : "/api/platform-presence/online";
    return this.post<PlatformPresenceRecord>(url, {
      body: command,
    });
  }

  async setPlatformOffline(
    command: SetPlatformOfflineCommand,
    filters?: { driverId?: string },
  ): Promise<PlatformPresenceRecord> {
    const params = new URLSearchParams();
    if (filters?.driverId) params.set("driverId", filters.driverId);
    const query = params.toString();
    const url = query
      ? `/api/platform-presence/offline?${query}`
      : "/api/platform-presence/offline";
    return this.post<PlatformPresenceRecord>(url, {
      body: command,
    });
  }

  // ── Platform Earnings ──

  async getPlatformEarningsSummary(): Promise<PlatformEarningsSummary> {
    return this.get<PlatformEarningsSummary>("/api/platform-earnings/summary");
  }

  async getPlatformEarningsByPlatform(
    period?: string,
  ): Promise<PlatformEarningsByPlatformResponse> {
    const url = period
      ? `/api/platform-earnings/by-platform?period=${encodeURIComponent(period)}`
      : "/api/platform-earnings/by-platform";
    return this.get<PlatformEarningsByPlatformResponse>(url);
  }

  // ── Reporting & Filing ──

  async createReportJob(
    command: CreateReportJobCommand,
  ): Promise<ReportJobAccepted> {
    return this.post<ReportJobAccepted>("/api/reports/jobs", { body: command });
  }

  async listReportJobs(): Promise<ReportJobRecord[]> {
    return this.getList<ReportJobRecord>("/api/reports/jobs");
  }

  async getReportJob(jobId: string): Promise<ReportJobDetailRecord> {
    return this.get<ReportJobDetailRecord>(`/api/reports/${jobId}`);
  }

  async createTenantReportJob(
    command: CreateReportJobCommand,
  ): Promise<ReportJobAccepted> {
    return this.post<ReportJobAccepted>("/api/tenant/reports/jobs", {
      body: command,
    });
  }

  async listTenantReportJobs(): Promise<ReportJobRecord[]> {
    return this.getList<ReportJobRecord>("/api/tenant/reports/jobs");
  }

  async getTenantReportJob(jobId: string): Promise<ReportJobDetailRecord> {
    return this.get<ReportJobDetailRecord>(
      `/api/tenant/reports/${encodeURIComponent(jobId)}`,
    );
  }

  async generateFilingPackage(
    command: GenerateFilingPackageCommand,
  ): Promise<FilingPackageAccepted> {
    return this.post<FilingPackageAccepted>("/api/filing-packages/generate", {
      body: command,
    });
  }

  async listFilingPackages(): Promise<FilingPackageListRecord[]> {
    return this.getList<FilingPackageListRecord>("/api/filing-packages");
  }

  async getFilingPackage(
    packageId: string,
  ): Promise<FilingPackageDetailRecord> {
    return this.get<FilingPackageDetailRecord>(
      `/api/filing-packages/${packageId}`,
    );
  }

  // ── Tenant Partner ──

  async listPassengers(): Promise<TenantPassengerRecord[]> {
    return this.getList<TenantPassengerRecord>("/api/tenant/passengers");
  }

  async upsertPassenger(command: UpsertTenantPassengerCommand) {
    return this.post("/api/tenant/passengers", { body: command });
  }

  async listAddresses(): Promise<TenantAddressRecord[]> {
    return this.getList<TenantAddressRecord>("/api/tenant/addresses");
  }

  async listCostCenters(options?: {
    activeOnly?: boolean;
    ownerUserId?: string;
    search?: string;
  }): Promise<TenantCostCenterRecord[]> {
    const params = new URLSearchParams();
    if (options?.activeOnly) {
      params.set("activeOnly", "true");
    }
    if (options?.ownerUserId) {
      params.set("ownerUserId", options.ownerUserId);
    }
    if (options?.search) {
      params.set("search", options.search);
    }
    const query = params.toString();
    return this.getList<TenantCostCenterRecord>(
      `/api/tenant/cost-centers${query ? `?${query}` : ""}`,
    );
  }

  async getCostCenter(code: string): Promise<TenantCostCenterRecord> {
    return this.get<TenantCostCenterRecord>(
      `/api/tenant/cost-centers/${encodeURIComponent(code)}`,
    );
  }

  async getTenantCostCenterCoverageReport(): Promise<TenantCostCenterCoverageReport> {
    return this.get<TenantCostCenterCoverageReport>(
      "/api/tenant/cost-centers/coverage",
    );
  }

  async upsertCostCenter(
    command: UpsertTenantCostCenterCommand,
  ): Promise<TenantCostCenterRecord> {
    return this.post<TenantCostCenterRecord>("/api/tenant/cost-centers", {
      body: command,
    });
  }

  async disableCostCenter(
    command: DisableTenantCostCenterCommand,
  ): Promise<TenantCostCenterRecord> {
    return this.post<TenantCostCenterRecord>(
      "/api/tenant/cost-centers/disable",
      { body: command },
    );
  }

  async getTenantQuotaSummary(): Promise<TenantQuotaSummary> {
    return this.get<TenantQuotaSummary>("/api/tenant/quotas");
  }

  async getCostCenterQuotaSummary(
    code: string,
  ): Promise<TenantCostCenterQuotaSummary> {
    return this.get<TenantCostCenterQuotaSummary>(
      `/api/tenant/cost-centers/${encodeURIComponent(code)}/quota`,
    );
  }

  async getTenantCostCenterQuota(
    code: string,
  ): Promise<TenantCostCenterQuotaSummary> {
    return this.getCostCenterQuotaSummary(code);
  }

  async upsertTenantQuotaPolicy(
    command: UpsertTenantQuotaPolicyCommand,
  ): Promise<TenantQuotaPolicyRecord> {
    return this.post<TenantQuotaPolicyRecord>("/api/tenant/quotas/policies", {
      body: command,
    });
  }

  async previewTenantBookingQuotaImpact(options: {
    amountMinor?: number;
    estimatedAmountMinor?: number;
    costCenter?: string;
    costCenterCode?: string;
    currency?: string;
    tripStartsAt?: string;
    reservationWindowStart: string;
    bookingId?: string | null;
  }): Promise<TenantBookingQuotaImpactPreview> {
    return this.post<TenantBookingQuotaImpactPreview>(
      "/api/tenant/quotas/preview",
      {
        body: {
          bookingId: options.bookingId,
          costCenterCode: options.costCenterCode ?? options.costCenter,
          estimatedAmountMinor:
            options.estimatedAmountMinor ?? options.amountMinor ?? null,
          currency: options.currency,
          reservationWindowStart: options.reservationWindowStart,
        },
      },
    );
  }

  async listTenantQuotaLedger(
    options: {
      periodKey?: string;
      costCenterCode?: string;
      bookingId?: string;
    } = {},
  ): Promise<TenantQuotaLedgerEntry[]> {
    const params = new URLSearchParams();
    if (options.periodKey) {
      params.set("periodKey", options.periodKey);
    }
    if (options.costCenterCode) {
      params.set("costCenterCode", options.costCenterCode);
    }
    if (options.bookingId) {
      params.set("bookingId", options.bookingId);
    }

    return this.getList<TenantQuotaLedgerEntry>(
      `/api/tenant/quotas/ledger${params.size > 0 ? `?${params.toString()}` : ""}`,
    );
  }

  async listApprovalRules(
    query: ListTenantApprovalRulesQuery = {},
  ): Promise<TenantApprovalRuleRecord[]> {
    const params = new URLSearchParams();
    if (query.activeOnly) {
      params.set("activeOnly", "true");
    }
    if (query.search) {
      params.set("search", query.search);
    }
    if (query.action) {
      params.set("action", query.action);
    }
    return this.getList<TenantApprovalRuleRecord>(
      `/api/tenant/approval-rules${params.size > 0 ? `?${params.toString()}` : ""}`,
    );
  }

  async upsertApprovalRule(
    command: UpsertTenantApprovalRuleCommand,
    ruleId?: string,
  ): Promise<TenantApprovalRuleRecord> {
    if (ruleId) {
      return this.put<TenantApprovalRuleRecord>(
        `/api/tenant/approval-rules/${encodeURIComponent(ruleId)}`,
        { body: command },
      );
    }
    return this.post<TenantApprovalRuleRecord>("/api/tenant/approval-rules", {
      body: command,
    });
  }

  async reorderApprovalRules(
    command: ReorderTenantApprovalRulesCommand,
  ): Promise<TenantApprovalRuleRecord[]> {
    return this.post<TenantApprovalRuleRecord[]>(
      "/api/tenant/approval-rules/reorder",
      { body: command },
    );
  }

  async evaluateApprovalRules(
    command: EvaluateTenantApprovalRuleCommand,
  ): Promise<TenantApprovalEvaluationResult> {
    return this.post<TenantApprovalEvaluationResult>(
      "/api/tenant/approval-rules/evaluate",
      { body: command },
    );
  }

  async disableApprovalRule(ruleId: string): Promise<TenantApprovalRuleRecord> {
    return this.post<TenantApprovalRuleRecord>(
      `/api/tenant/approval-rules/${encodeURIComponent(ruleId)}/disable`,
    );
  }

  async listApprovalRequests(
    query: ListTenantBookingApprovalRequestsQuery = {},
  ): Promise<TenantBookingApprovalRequestRecord[]> {
    const params = new URLSearchParams();
    if (query.status) {
      params.set("status", query.status);
    }
    if (query.bookingId) {
      params.set("bookingId", query.bookingId);
    }
    return this.getList<TenantBookingApprovalRequestRecord>(
      `/api/tenant/approval-requests${params.size > 0 ? `?${params.toString()}` : ""}`,
    );
  }

  async getApprovalRequest(
    approvalRequestId: string,
  ): Promise<TenantBookingApprovalRequestRecord> {
    return this.get<TenantBookingApprovalRequestRecord>(
      `/api/tenant/approval-requests/${encodeURIComponent(approvalRequestId)}`,
    );
  }

  async approveApprovalRequest(
    approvalRequestId: string,
    command: ApproveTenantBookingApprovalRequestCommand = {},
  ): Promise<TenantBookingApprovalRequestRecord> {
    return this.post<TenantBookingApprovalRequestRecord>(
      `/api/tenant/approval-requests/${encodeURIComponent(approvalRequestId)}/approve`,
      { body: command },
    );
  }

  async rejectApprovalRequest(
    approvalRequestId: string,
    command: RejectTenantBookingApprovalRequestCommand,
  ): Promise<TenantBookingApprovalRequestRecord> {
    return this.post<TenantBookingApprovalRequestRecord>(
      `/api/tenant/approval-requests/${encodeURIComponent(approvalRequestId)}/reject`,
      { body: command },
    );
  }

  async escalateApprovalRequest(
    approvalRequestId: string,
    command: EscalateTenantBookingApprovalRequestCommand = {},
  ): Promise<TenantBookingApprovalRequestRecord> {
    return this.post<TenantBookingApprovalRequestRecord>(
      `/api/tenant/approval-requests/${encodeURIComponent(approvalRequestId)}/escalate`,
      { body: command },
    );
  }

  async listAddressExportView(): Promise<TenantAddressExportViewRecord[]> {
    return this.getList<TenantAddressExportViewRecord>(
      "/api/tenant/addresses/export-view",
    );
  }
  async upsertAddress(command: UpsertTenantAddressCommand) {
    return this.post("/api/tenant/addresses", { body: command });
  }

  async listApiKeys(): Promise<TenantApiKeyRecord[]> {
    return this.getList<TenantApiKeyRecord>("/api/tenant/api-keys");
  }

  async issueApiKey(
    command: IssueTenantApiKeyCommand,
  ): Promise<TenantApiKeyIssued> {
    return this.post<TenantApiKeyIssued>("/api/tenant/api-keys", {
      body: command,
    });
  }

  async rotateApiKey(
    apiKeyId: string,
    command: RotateTenantApiKeyCommand,
  ): Promise<TenantApiKeyIssued> {
    return this.post<TenantApiKeyIssued>(
      `/api/tenant/api-keys/${encodeURIComponent(apiKeyId)}/rotate`,
      { body: command },
    );
  }

  async listWebhooks(): Promise<TenantWebhookEndpoint[]> {
    return this.getList<TenantWebhookEndpoint>("/api/tenant/webhooks");
  }

  async createWebhookEndpoint(command: CreateTenantWebhookEndpointCommand) {
    return this.post("/api/tenant/webhooks", { body: command });
  }

  async updateWebhookEndpoint(
    webhookId: string,
    command: UpdateTenantWebhookEndpointCommand,
  ): Promise<TenantWebhookEndpoint> {
    return this.post(`/api/tenant/webhooks/${encodeURIComponent(webhookId)}`, {
      body: command,
    });
  }

  async deleteWebhookEndpoint(webhookId: string) {
    return this.delete(`/api/tenant/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async listWebhookDeliveries(
    webhookId: string,
  ): Promise<WebhookDeliveryRecord[]> {
    return this.getList<WebhookDeliveryRecord>(
      `/api/tenant/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
    );
  }

  async revokeApiKey(keyId: string) {
    return this.post(
      `/api/tenant/api-keys/${encodeURIComponent(keyId)}/revoke`,
    );
  }

  async listNotifications(): Promise<NotificationRecord[]> {
    return this.getList<NotificationRecord>("/api/notifications");
  }

  async listTenantNotificationFeed(): Promise<NotificationRecord[]> {
    return this.getList<NotificationRecord>("/api/tenant/notifications/feed");
  }

  async getTenantIntegrationGovernancePackage(): Promise<TenantIntegrationGovernancePackage> {
    return this.get<TenantIntegrationGovernancePackage>(
      "/api/tenant/integration-governance",
    );
  }

  async getNotificationPreferences() {
    return this.get("/api/tenant/notifications");
  }

  async updateNotifications(command: UpdateTenantNotificationsCommand) {
    return this.post("/api/tenant/notifications", { body: command });
  }

  async getSlaProfile() {
    return this.get("/api/tenant/sla");
  }

  async updateSlaProfile(command: UpdateTenantSlaProfileCommand) {
    return this.post("/api/tenant/sla", { body: command });
  }

  async listTenantUsers(): Promise<TenantUserRoleRecord[]> {
    return this.getList<TenantUserRoleRecord>("/api/tenant/users");
  }

  async listTenantRoles(): Promise<TenantRoleCatalogRecord[]> {
    return this.getList<TenantRoleCatalogRecord>("/api/tenant/roles");
  }

  async createTenantUser(command: CreateTenantUserCommand) {
    return this.post("/api/tenant/users", { body: command });
  }

  async updateTenantRole(userId: string, command: UpdateTenantRoleCommand) {
    return this.post(`/api/tenant/users/${userId}/role`, { body: command });
  }

  async listAuditLogs(): Promise<AuditLogRecord[]> {
    return this.getList<AuditLogRecord>("/api/audit");
  }

  async listTenantAuditLogs(options: { tenantId?: string } = {}) {
    return this.getList<AuditLogRecord>("/api/tenant/audit", {
      ...(options.tenantId
        ? {
            headers: {
              "x-tenant-id": options.tenantId,
            },
          }
        : {}),
    });
  }

  async listEvidencePolicies(): Promise<EvidenceRetentionPolicyRecord[]> {
    const result = await this.get<EvidenceGovernanceCatalog>(
      "/api/audit/evidence-policies",
    );
    return result.policies;
  }

  async getEvidencePolicy(
    family: EvidenceRetentionFamily,
  ): Promise<EvidenceRetentionPolicyRecord> {
    return this.get<EvidenceRetentionPolicyRecord>(
      `/api/audit/evidence-policies/${encodeURIComponent(family)}`,
    );
  }

  async getEvidenceSubjectGovernance(
    family: EvidenceRetentionFamily,
    subjectId: string,
    options?: {
      tenantId?: string | null;
      manifestHash?: string | null;
    },
  ): Promise<EvidenceSubjectGovernanceRecord> {
    const params = new URLSearchParams();
    if (options?.tenantId) {
      params.set("tenantId", options.tenantId);
    }
    if (options?.manifestHash) {
      params.set("manifestHash", options.manifestHash);
    }
    const query = params.toString();
    return this.get<EvidenceSubjectGovernanceRecord>(
      `/api/audit/evidence-governance/${encodeURIComponent(family)}/${encodeURIComponent(subjectId)}${query ? `?${query}` : ""}`,
    );
  }

  async listEvidenceLegalHolds(): Promise<EvidenceLegalHoldRecord[]> {
    return this.getList<EvidenceLegalHoldRecord>("/api/audit/legal-holds");
  }

  async placeEvidenceLegalHold(
    command: CreateEvidenceLegalHoldCommand,
  ): Promise<EvidenceLegalHoldRecord> {
    return this.post<EvidenceLegalHoldRecord>("/api/audit/legal-holds", {
      body: command,
    });
  }

  async releaseEvidenceLegalHold(
    holdId: string,
    command: ReleaseEvidenceLegalHoldCommand,
  ): Promise<EvidenceLegalHoldRecord> {
    return this.post<EvidenceLegalHoldRecord>(
      `/api/audit/legal-holds/${encodeURIComponent(holdId)}/release`,
      {
        body: command,
      },
    );
  }

  async listEvidenceDeletionExceptions(): Promise<
    EvidenceDeletionExceptionRecord[]
  > {
    return this.getList<EvidenceDeletionExceptionRecord>(
      "/api/audit/deletion-exceptions",
    );
  }

  async registerEvidenceDeletionException(
    command: CreateEvidenceDeletionExceptionCommand,
  ): Promise<EvidenceDeletionExceptionRecord> {
    return this.post<EvidenceDeletionExceptionRecord>(
      "/api/audit/deletion-exceptions",
      {
        body: command,
      },
    );
  }

  async resolveEvidenceDeletionException(
    exceptionId: string,
    command: ResolveEvidenceDeletionExceptionCommand,
  ): Promise<EvidenceDeletionExceptionRecord> {
    return this.post<EvidenceDeletionExceptionRecord>(
      `/api/audit/deletion-exceptions/${encodeURIComponent(exceptionId)}/resolve`,
      {
        body: command,
      },
    );
  }

  async getOperationalObservability(): Promise<OperationalObservabilitySnapshot> {
    return this.get<OperationalObservabilitySnapshot>(
      "/api/operational-observability",
    );
  }

  // ── Forwarder ──

  async listForwarderOrders(): Promise<ForwardedOrderRecord[]> {
    return this.getList<ForwardedOrderRecord>("/api/forwarder/orders");
  }

  async getForwarderAdaptersHealth() {
    return this.getList("/api/forwarder/adapters/health");
  }

  async listForwarderSyncErrors(): Promise<ForwardedOrderRecord[]> {
    return this.getList<ForwardedOrderRecord>(
      "/api/forwarder/orders/sync-errors",
    );
  }

  async listForwarderReconciliationIssues(): Promise<
    ForwarderReconciliationIssue[]
  > {
    return this.getList<ForwarderReconciliationIssue>(
      "/api/forwarder/reconciliation-issues",
    );
  }

  // ── Platform Admin ──

  async listPublicInfo(): Promise<PublicInfoVersionRecord[]> {
    return this.getList<PublicInfoVersionRecord>(
      "/api/platform-admin/public-info",
    );
  }

  async createPublicInfoVersion(
    command: CreatePublicInfoVersionCommand,
  ): Promise<PublicInfoVersionRecord> {
    return this.post<PublicInfoVersionRecord>(
      "/api/platform-admin/public-info",
      {
        body: command,
      },
    );
  }

  async publishPublicInfoVersion(
    versionId: string,
    command: PublishPublicInfoVersionCommand,
  ): Promise<PublicInfoVersionRecord> {
    return this.post<PublicInfoVersionRecord>(
      `/api/platform-admin/public-info/${versionId}/publish`,
      { body: command },
    );
  }

  async deletePublicInfoVersion(
    versionId: string,
  ): Promise<PublicInfoVersionRecord> {
    return this.delete<PublicInfoVersionRecord>(
      `/api/platform-admin/public-info/${versionId}`,
    );
  }

  async listPlacards(): Promise<PlacardVersionRecord[]> {
    return this.getList<PlacardVersionRecord>("/api/platform-admin/placards");
  }

  async generatePlacardVersion(
    command: GeneratePlacardVersionCommand,
  ): Promise<PlacardVersionRecord> {
    return this.post<PlacardVersionRecord>("/api/platform-admin/placards", {
      body: command,
    });
  }

  async publishPlacardVersion(
    placardVersionId: string,
    command: PublishPlacardVersionCommand = {},
  ): Promise<PlacardVersionRecord> {
    return this.post<PlacardVersionRecord>(
      `/api/platform-admin/placards/${placardVersionId}/publish`,
      { body: command },
    );
  }

  async listPlatformTenants(): Promise<PlatformAdminTenantRecord[]> {
    return this.getList<PlatformAdminTenantRecord>(
      "/api/platform-admin/tenants",
    );
  }

  async getPlatformTenantGovernanceSummary(
    query: PlatformTenantGovernanceSummaryQuery = {},
  ): Promise<PlatformTenantGovernanceSummaryResponse> {
    const params = new URLSearchParams();

    if (typeof query.page === "number") {
      params.set("page", String(query.page));
    }
    if (typeof query.pageSize === "number") {
      params.set("pageSize", String(query.pageSize));
    }

    const search = params.size > 0 ? `?${params.toString()}` : "";
    return this.get<PlatformTenantGovernanceSummaryResponse>(
      `/api/admin/tenant-governance/summary${search}`,
    );
  }

  async listPlatformPartnerEntries(): Promise<PartnerChannelEntryRecord[]> {
    return this.getList<PartnerChannelEntryRecord>(
      "/api/platform-admin/partner-entries",
    );
  }

  async createPlatformPartnerEntry(
    command: CreatePartnerChannelEntryCommand,
  ): Promise<PartnerChannelEntryRecord> {
    return this.post<PartnerChannelEntryRecord>(
      "/api/platform-admin/partner-entries",
      {
        body: command,
      },
    );
  }

  async updatePlatformPartnerEntry(
    entrySlug: string,
    command: UpdatePartnerChannelEntryCommand,
  ): Promise<PartnerChannelEntryRecord> {
    return this.post<PartnerChannelEntryRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}`,
      {
        body: command,
      },
    );
  }

  async activatePlatformPartnerEntry(
    entrySlug: string,
  ): Promise<PartnerChannelEntryRecord> {
    return this.post<PartnerChannelEntryRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/activate`,
      {},
    );
  }

  async deactivatePlatformPartnerEntry(
    entrySlug: string,
  ): Promise<PartnerChannelEntryRecord> {
    return this.post<PartnerChannelEntryRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/deactivate`,
      {},
    );
  }

  async revokePlatformPartnerEntry(
    entrySlug: string,
  ): Promise<PartnerChannelEntryRecord> {
    return this.post<PartnerChannelEntryRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/revoke`,
      {},
    );
  }

  async listPlatformPartnerIngressCredentials(
    entrySlug: string,
  ): Promise<PartnerIngressCredentialRecord[]> {
    return this.getList<PartnerIngressCredentialRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials`,
    );
  }

  async issuePlatformPartnerIngressCredential(
    entrySlug: string,
    command: IssuePartnerIngressCredentialCommand = {},
  ): Promise<PartnerIngressCredentialIssued> {
    return this.post<PartnerIngressCredentialIssued>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials/issue`,
      {
        body: command,
      },
    );
  }

  async revokePlatformPartnerIngressCredential(
    entrySlug: string,
    keyId: string,
    command: RevokePartnerIngressCredentialCommand = {},
  ): Promise<PartnerIngressCredentialRecord> {
    return this.post<PartnerIngressCredentialRecord>(
      `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials/${encodeURIComponent(keyId)}/revoke`,
      {
        body: command,
      },
    );
  }

  async createPlatformTenant(
    command: CreatePlatformTenantCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>("/api/platform-admin/tenants", {
      body: command,
    });
  }

  async updatePlatformTenantSettings(
    tenantId: string,
    command: UpdatePlatformTenantSettingsCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${tenantId}/settings`,
      { body: command },
    );
  }

  async getPlatformTenant(
    tenantId: string,
  ): Promise<PlatformAdminTenantRecord> {
    return this.get<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}`,
    );
  }

  async updatePlatformTenantOnboarding(
    tenantId: string,
    command: UpdatePlatformTenantOnboardingCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/onboarding`,
      { body: command },
    );
  }

  async setPlatformTenantRolloutStage(
    tenantId: string,
    command: SetPlatformTenantRolloutStageCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/rollout`,
      { body: command },
    );
  }

  async listPlatformAdminUsers(): Promise<PlatformAdminUserRecord[]> {
    return this.getList<PlatformAdminUserRecord>("/api/platform-admin/users");
  }

  async createPlatformAdminUser(
    command: CreatePlatformAdminUserCommand,
  ): Promise<PlatformAdminUserRecord> {
    return this.post<PlatformAdminUserRecord>("/api/platform-admin/users", {
      body: command,
    });
  }

  async updatePlatformAdminUserRole(
    userId: string,
    command: UpdatePlatformAdminUserRoleCommand,
  ): Promise<PlatformAdminUserRecord> {
    return this.post<PlatformAdminUserRecord>(
      `/api/platform-admin/users/${userId}/role`,
      { body: command },
    );
  }

  async listPlatformNotices(): Promise<PlatformNoticeRecord[]> {
    return this.getList<PlatformNoticeRecord>("/api/platform-admin/notices");
  }

  async createPlatformNotice(
    command: CreatePlatformNoticeCommand,
  ): Promise<PlatformNoticeRecord> {
    return this.post<PlatformNoticeRecord>("/api/platform-admin/notices", {
      body: command,
    });
  }

  async resolvePlatformNotice(noticeId: string): Promise<PlatformNoticeRecord> {
    return this.post<PlatformNoticeRecord>(
      `/api/platform-admin/notices/${noticeId}/resolve`,
    );
  }

  async getMaintenanceMode(): Promise<PlatformMaintenanceModeRecord> {
    return this.get<PlatformMaintenanceModeRecord>(
      "/api/platform-admin/maintenance-mode",
    );
  }

  async setMaintenanceMode(
    command: SetPlatformMaintenanceModeCommand,
  ): Promise<PlatformMaintenanceModeRecord> {
    return this.post<PlatformMaintenanceModeRecord>(
      "/api/platform-admin/maintenance-mode",
      { body: command },
    );
  }

  async listPlatformPricingRules(): Promise<PlatformPricingRuleRecord[]> {
    return this.getList<PlatformPricingRuleRecord>(
      "/api/platform-admin/pricing-rules",
    );
  }

  async getProductRuleCatalog(): Promise<ProductRuleCatalog> {
    return this.get<ProductRuleCatalog>("/api/product-rule/catalog");
  }

  async createPlatformPricingRule(
    command: CreatePlatformPricingRuleCommand,
  ): Promise<PlatformPricingRuleRecord> {
    return this.post<PlatformPricingRuleRecord>(
      "/api/platform-admin/pricing-rules",
      { body: command },
    );
  }

  async publishPlatformPricingRule(
    ruleId: string,
    command: PublishPlatformPricingRuleCommand,
  ): Promise<PlatformPricingRuleRecord> {
    return this.post<PlatformPricingRuleRecord>(
      `/api/platform-admin/pricing-rules/${ruleId}/publish`,
      { body: command },
    );
  }

  async listPlatformInvoices(): Promise<TenantInvoiceRecord[]> {
    return this.getList<TenantInvoiceRecord>("/api/settlement/invoices");
  }

  async listSettlementMatrix(): Promise<SettlementMatrixRecord[]> {
    return this.getList<SettlementMatrixRecord>("/api/settlement/matrix");
  }

  async suspendTenant(tenantId: string): Promise<unknown> {
    return this.post(`/api/platform-admin/tenants/${tenantId}/suspend`);
  }

  async activateTenant(tenantId: string): Promise<unknown> {
    return this.post(`/api/platform-admin/tenants/${tenantId}/activate`);
  }

  async inviteTenantRole(
    tenantId: string,
    command: InviteTenantRoleCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/roles/invite`,
      { body: command },
    );
  }

  async acknowledgeTenantRole(
    tenantId: string,
    command: AcknowledgeTenantRoleCommand,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/roles/acknowledge`,
      { body: command },
    );
  }

  async rollbackHoldTenant(
    tenantId: string,
  ): Promise<PlatformAdminTenantRecord> {
    return this.post<PlatformAdminTenantRecord>(
      `/api/platform-admin/tenants/${encodeURIComponent(tenantId)}/rollback-hold`,
    );
  }

  // ── Platform Adapters ──

  async listPlatformAdapters(): Promise<PlatformAdapter[]> {
    return this.getList<PlatformAdapter>("/api/platform-admin/adapters");
  }

  async getPlatformAdapter(id: string): Promise<PlatformAdapter> {
    return this.get<PlatformAdapter>(`/api/platform-admin/adapters/${id}`);
  }

  async updatePlatformAdapter(
    id: string,
    command: UpdatePlatformAdapterCommand,
  ): Promise<PlatformAdapter> {
    return this.patch<PlatformAdapter>(`/api/platform-admin/adapters/${id}`, {
      body: command,
    });
  }

  // ── Regulatory Registry ──

  async listVehicles(): Promise<VehicleRegistryRecord[]> {
    return this.getList<VehicleRegistryRecord>(
      "/api/regulatory-registry/vehicles",
    );
  }

  async listDrivers(): Promise<DriverRegistryRecord[]> {
    return this.getList<DriverRegistryRecord>(
      "/api/regulatory-registry/drivers",
    );
  }

  async listDriverLocations(): Promise<DriverLocationSnapshot[]> {
    return this.getList<DriverLocationSnapshot>(
      "/api/regulatory-registry/driver-locations",
    );
  }

  async createDriverMaster(
    command: CreateDriverMasterCommand,
  ): Promise<DriverRegistryRecord> {
    return this.post<DriverRegistryRecord>("/api/regulatory-registry/drivers", {
      body: command,
    });
  }

  async updateDriverMasterLifecycle(
    driverId: string,
    command: UpdateDriverMasterLifecycleCommand,
  ): Promise<DriverRegistryRecord> {
    return this.post<DriverRegistryRecord>(
      `/api/regulatory-registry/drivers/${driverId}/lifecycle`,
      {
        body: command,
      },
    );
  }

  async updateDriverWorkState(
    driverId: string,
    command: UpdateDriverWorkStateCommand,
  ): Promise<DriverRegistryRecord> {
    return this.post<DriverRegistryRecord>(
      `/api/regulatory-registry/drivers/${driverId}/work-state`,
      {
        body: command,
      },
    );
  }

  async recordDriverLocation(
    command: DriverLocationHeartbeatCommand,
  ): Promise<{ success: true }> {
    return this.post<{ success: true }>(
      "/api/regulatory-registry/driver-location",
      { body: command },
    );
  }

  async getDriverEta(
    driverId: string,
    destination: { lat: number; lng: number },
  ): Promise<DriverEtaResponse> {
    const query = new URLSearchParams({
      driverId,
      destLat: destination.lat.toString(),
      destLng: destination.lng.toString(),
    });
    return this.get<DriverEtaResponse>(
      `/api/regulatory-registry/driver-eta?${query.toString()}`,
    );
  }

  async listContracts(): Promise<VehicleContractRecord[]> {
    return this.getList<VehicleContractRecord>(
      "/api/regulatory-registry/contracts",
    );
  }

  async listPolicies(): Promise<InsurancePolicyRecord[]> {
    return this.getList<InsurancePolicyRecord>(
      "/api/regulatory-registry/policies",
    );
  }

  async listExclusivities(): Promise<DispatchExclusivityRecord[]> {
    return this.getList<DispatchExclusivityRecord>(
      "/api/regulatory-registry/exclusivities",
    );
  }

  async updateVehicleCompliance(
    vehicleId: string,
    command: UpdateVehicleComplianceCommand,
  ): Promise<VehicleRegistryRecord> {
    return this.post<VehicleRegistryRecord>(
      `/api/regulatory-registry/vehicles/${vehicleId}/compliance`,
      {
        body: command,
      },
    );
  }

  async submitExclusivityReview(
    vehicleId: string,
    command: SubmitExclusivityReviewCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.post<DispatchExclusivityRecord>(
      `/api/regulatory-registry/exclusivities/${vehicleId}/submit-review`,
      {
        body: command,
      },
    );
  }

  async approveExclusivity(
    vehicleId: string,
    command: ApproveExclusivityCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.post<DispatchExclusivityRecord>(
      `/api/regulatory-registry/exclusivities/${vehicleId}/approve`,
      {
        body: command,
      },
    );
  }

  async rejectExclusivity(
    vehicleId: string,
    command: RejectExclusivityCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.post<DispatchExclusivityRecord>(
      `/api/regulatory-registry/exclusivities/${vehicleId}/reject`,
      {
        body: command,
      },
    );
  }

  async initiateVehicleOffboarding(
    vehicleId: string,
    command: InitiateVehicleOffboardingCommand,
  ): Promise<VehicleRegistryRecord> {
    return this.post<VehicleRegistryRecord>(
      `/api/regulatory-registry/vehicles/${vehicleId}/offboarding`,
      {
        body: command,
      },
    );
  }

  async completeVehicleDebranding(
    vehicleId: string,
    command: CompleteVehicleDebrandingCommand,
  ): Promise<VehicleRegistryRecord> {
    return this.post<VehicleRegistryRecord>(
      `/api/regulatory-registry/vehicles/${vehicleId}/offboarding/complete-debranding`,
      {
        body: command,
      },
    );
  }

  // ── W8-001E: Ops & Driver Domain ──

  async listIncidents(): Promise<IncidentRecord[]> {
    return this.getList<IncidentRecord>("/api/incidents");
  }

  async createIncident(command: CreateIncidentCommand) {
    return this.post<IncidentRecord>("/api/incidents", { body: command });
  }

  async getIncident(incidentId: string) {
    return this.get<IncidentRecord>(`/api/incidents/${incidentId}`);
  }

  async getIncidentTimeline(
    incidentId: string,
  ): Promise<IncidentTimelineEntry[]> {
    return this.getList<IncidentTimelineEntry>(
      `/api/incidents/${incidentId}/timeline`,
    );
  }

  async updateIncident(incidentId: string, command: UpdateIncidentCommand) {
    return this.patch(`/api/incidents/${incidentId}`, { body: command });
  }

  async linkIncidentToComplaint(incidentId: string, complaintCaseNo: string) {
    return this.post<IncidentRecord>(
      `/api/incidents/${encodeURIComponent(incidentId)}/link-complaint`,
      { body: { complaintCaseNo } },
    );
  }

  async createIncidentFromDispatchException(
    command: CreateIncidentFromDispatchExceptionCommand,
  ) {
    return this.post<IncidentRecord>("/api/incidents/from-dispatch-exception", {
      body: command,
    });
  }

  async recordServiceRecoveryAction(
    incidentId: string,
    command: RecordServiceRecoveryActionCommand,
  ) {
    return this.post<ServiceRecoveryActionRecord>(
      `/api/incidents/${encodeURIComponent(incidentId)}/service-recovery`,
      { body: command },
    );
  }

  async getServiceRecoveryActions(
    incidentId: string,
  ): Promise<ServiceRecoveryActionRecord[]> {
    return this.getList<ServiceRecoveryActionRecord>(
      `/api/incidents/${encodeURIComponent(incidentId)}/service-recovery`,
    );
  }

  async listMaintenance(vehicleId?: string): Promise<MaintenanceRecord[]> {
    const path = vehicleId
      ? `/api/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`
      : "/api/maintenance";
    return this.getList<MaintenanceRecord>(path);
  }

  async createMaintenance(command: CreateMaintenanceRecordCommand) {
    return this.post("/api/maintenance", { body: command });
  }

  async getMaintenance(maintenanceId: string) {
    return this.get(`/api/maintenance/${maintenanceId}`);
  }

  async updateMaintenance(
    maintenanceId: string,
    command: UpdateMaintenanceRecordCommand,
  ) {
    return this.patch(`/api/maintenance/${maintenanceId}`, { body: command });
  }

  async deleteMaintenance(maintenanceId: string) {
    return this.delete(`/api/maintenance/${maintenanceId}`);
  }

  async listShifts(driverId?: string): Promise<ShiftRecord[]> {
    const path = driverId
      ? `/api/shift-attendance/shifts?driverId=${encodeURIComponent(driverId)}`
      : "/api/shift-attendance/shifts";
    return this.getList<ShiftRecord>(path);
  }

  async listAttendance(driverId?: string): Promise<AttendanceRecord[]> {
    const path = driverId
      ? `/api/shift-attendance/attendance?driverId=${encodeURIComponent(driverId)}`
      : "/api/shift-attendance/attendance";
    return this.getList<AttendanceRecord>(path);
  }

  async clockIn(command: ClockInCommand): Promise<ShiftRecord> {
    return this.post<ShiftRecord>("/api/shift-attendance/clock-in", {
      body: command,
    });
  }

  async clockOut(command: ClockOutCommand): Promise<ShiftRecord> {
    return this.post<ShiftRecord>("/api/shift-attendance/clock-out", {
      body: command,
    });
  }

  async getDriverSettings(driverId: string) {
    return this.get(`/api/driver-settings/${driverId}`);
  }

  async updateDriverSettings(driverId: string, command: any) {
    return this.patch(`/api/driver-settings/${driverId}`, { body: command });
  }

  async getDriverProfile(): Promise<DriverProfileRecord> {
    return this.get<DriverProfileRecord>("/api/driver/profile");
  }

  async createDriverProfile(
    command: CreateDriverProfileCommand,
  ): Promise<DriverProfileRecord> {
    return this.post<DriverProfileRecord>("/api/driver/profile", {
      body: command,
    });
  }

  async updateDriverProfile(
    command: UpdateDriverProfileCommand,
  ): Promise<DriverProfileRecord> {
    return this.patch<DriverProfileRecord>("/api/driver/profile", {
      body: command,
    });
  }

  async registerDriverDevice(
    command: RegisterDriverDeviceCommand,
  ): Promise<DriverDeviceProvisioningSession> {
    return this.post<DriverDeviceProvisioningSession>(
      "/api/auth/driver/device/register",
      {
        body: command,
      },
    );
  }

  async refreshDriverDeviceSession(
    command: RefreshDriverDeviceSessionCommand,
  ): Promise<DriverDeviceProvisioningSession> {
    return this.post<DriverDeviceProvisioningSession>(
      "/api/auth/driver/device/refresh",
      {
        body: command,
      },
    );
  }

  async revokeDriverDeviceBinding(
    command: RevokeDriverDeviceBindingCommand,
  ): Promise<{
    bindingId: string;
    deviceId: string;
    driverId: string;
    revokedAt: string;
  }> {
    return this.post("/api/auth/driver/device/revoke", {
      body: command,
    });
  }
}

/**
 * Factory helpers for callers that still rely on bootstrap header auth.
 */
export function createTenantClient(
  baseUrl: string,
  tenantId: string,
  actorId: string,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "tenant_admin",
      "x-actor-id": actorId,
      "x-realm": "tenant",
      "x-tenant-id": tenantId,
    },
  });
}

export function createOpsClient(baseUrl: string, actorId: string): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "ops_user",
      "x-actor-id": actorId,
      "x-realm": "ops",
    },
  });
}

export function createDriverClient(
  baseUrl: string,
  driverId: string,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "driver_user",
      "x-actor-id": driverId,
      "x-realm": "driver",
    },
  });
}

export function createDriverBearerClient(
  baseUrl: string,
  accessToken: string,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function createBearerClient(
  baseUrl: string,
  accessToken: string,
  defaultHeaders?: Record<string, string>,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      Authorization: `Bearer ${accessToken}`,
      ...defaultHeaders,
    },
  });
}

export function createTenantBearerClient(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
): ApiClient {
  return createBearerClient(baseUrl, accessToken, {
    "x-tenant-id": tenantId,
    "x-realm": "tenant",
  });
}

export function createPublicClient(baseUrl: string): ApiClient {
  return new ApiClient({ baseUrl });
}

export function createPlatformAdminClient(
  baseUrl: string,
  actorId: string,
  options?: Pick<ApiClientConfig, "pathTransform" | "timeout">,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "platform_admin",
      "x-actor-id": actorId,
      "x-realm": "platform",
    },
    ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options?.pathTransform ? { pathTransform: options.pathTransform } : {}),
  });
}
