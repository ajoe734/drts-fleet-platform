/**
 * @drts/api-client - Shared API client for DRTS client surfaces
 *
 * Provides a typed fetch wrapper around the Phase 1 API.
 * Supports both app-issued Bearer auth and legacy bootstrap header fallback.
 */

import type {
  AddComplaintCaseNoteCommand,
  AnnounceCallAgentIdentityCommand,
  ApproveReimbursementBatchCommand,
  AssignComplaintCaseCommand,
  AttachCallRecordingCommand,
  ApiSuccessEnvelope,
  AttendanceRecord,
  BookingRecord,
  CallbackTaskRecord,
  CallSessionRecord,
  ClockInCommand,
  ClockOutCommand,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  CompleteCallbackTaskCommand,
  CreatePartnerBootstrapSessionCommand,
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
  CreateMaintenanceRecordCommand,
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverAcceptTaskCommand,
  DriverArrivedPickupCommand,
  DriverDeviceProvisioningSession,
  DriverEtaResponse,
  DriverDepartTaskCommand,
  DriverFeePlanRecord,
  DriverLocationHeartbeatCommand,
  DriverProfileRecord,
  DriverRegistryRecord,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  DriverStatementRecord,
  DriverTaskRecord,
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
  IssueTenantApiKeyCommand,
  LinkCallOrderCommand,
  MaintenanceRecord,
  MarkReimbursementPaidCommand,
  NotificationRecord,
  OpenCallSessionCommand,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PartnerBootstrapSession,
  PartnerEligibilityVerificationRecord,
  PlacardVersionRecord,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  PlatformEarningsByPlatformResponse,
  PlatformEarningsSummary,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  PlatformPricingRuleRecord,
  PublishDriverFeePlanCommand,
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  PublicInfoVersionRecord,
  QuoteCallEtaCommand,
  RefreshDriverDeviceSessionCommand,
  ReimbursementBatchRecord,
  RegisterDriverDeviceCommand,
  ReopenComplaintCaseCommand,
  ReportJobAccepted,
  ReportJobDetailRecord,
  ReportJobRecord,
  ResolveComplaintCaseCommand,
  RevokeDriverDeviceBindingCommand,
  RotateTenantApiKeyCommand,
  SetPlatformMaintenanceModeCommand,
  SetPlatformOfflineCommand,
  SetPlatformOnlineCommand,
  ShiftRecord,
  TenantAddressRecord,
  TenantApiKeyRecord,
  TenantBootstrapSession,
  TenantInvoiceRecord,
  TenantPassengerRecord,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  TransferCallToComplaintCommand,
  UpdateDriverProfileCommand,
  UpdateIncidentCommand,
  UpdateMaintenanceRecordCommand,
  UpdatePlatformAdminUserRoleCommand,
  UpdatePlatformTenantSettingsCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpdateTenantWebhookEndpointCommand,
  UpsertTenantAddressCommand,
  UpsertTenantPassengerCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
  VerifyPartnerEligibilityCommand,
  WebhookDeliveryRecord,
  CancelOwnedOrderCommand,
  AssignDispatchCommand,
  DriverCompleteTaskCommand,
  UpdateTenantBookingCommand,
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

  async getFeatureFlags(): Promise<FeatureFlagSummary> {
    return this.get<FeatureFlagSummary>("/api/admin/flags");
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

  async redispatchOrder(orderId: string) {
    return this.post(`/api/orders/${orderId}/redispatch`);
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

  async completeTask(taskId: string, command: DriverCompleteTaskCommand) {
    return this.post(`/api/driver/tasks/${taskId}/complete`, {
      body: command,
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

  async closeCallSession(id: string) {
    return this.post<CallSessionRecord>(
      `/api/callcenter/sessions/${encodeURIComponent(id)}/close`,
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

  // ── Complaint ──

  async listComplaints(): Promise<ComplaintCaseRecord[]> {
    return this.getList<ComplaintCaseRecord>("/api/complaints");
  }

  async createComplaint(command: CreateComplaintCaseCommand) {
    return this.post<ComplaintCaseRecord>("/api/complaints", { body: command });
  }

  async getComplaint(caseNo: string) {
    return this.get<ComplaintCaseRecord>(
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
    return this.get<ComplaintExportViewRecord>(
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

  // ── Billing ──

  async getBillingProfile() {
    return this.get("/api/tenant/billing/profile");
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

  // ── Platform Presence ──

  async getPlatformPresence(): Promise<PlatformPresenceSummary> {
    return this.get<PlatformPresenceSummary>("/api/platform-presence");
  }

  async setPlatformOnline(
    command: SetPlatformOnlineCommand,
  ): Promise<PlatformPresenceRecord> {
    return this.post<PlatformPresenceRecord>("/api/platform-presence/online", {
      body: command,
    });
  }

  async setPlatformOffline(
    command: SetPlatformOfflineCommand,
  ): Promise<PlatformPresenceRecord> {
    return this.post<PlatformPresenceRecord>("/api/platform-presence/offline", {
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

  async upsertAddress(command: UpsertTenantAddressCommand) {
    return this.post("/api/tenant/addresses", { body: command });
  }

  async listApiKeys(): Promise<TenantApiKeyRecord[]> {
    return this.getList<TenantApiKeyRecord>("/api/tenant/api-keys");
  }

  async issueApiKey(command: IssueTenantApiKeyCommand) {
    return this.post("/api/tenant/api-keys", { body: command });
  }

  async rotateApiKey(apiKeyId: string, command: RotateTenantApiKeyCommand) {
    return this.post(
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

  async listAuditLogs() {
    return this.getList("/api/audit");
  }

  async listTenantAuditLogs() {
    return this.getList("/api/tenant/audit");
  }

  // ── Forwarder ──

  async listForwarderOrders() {
    return this.getList("/api/forwarder/orders");
  }

  async getForwarderAdaptersHealth() {
    return this.getList("/api/forwarder/adapters/health");
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
    return this.getList<TenantInvoiceRecord>("/api/platform-admin/invoices");
  }

  async suspendTenant(tenantId: string): Promise<unknown> {
    return this.post(`/api/platform-admin/tenants/${tenantId}/suspend`);
  }

  async activateTenant(tenantId: string): Promise<unknown> {
    return this.post(`/api/platform-admin/tenants/${tenantId}/activate`);
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

  // ── W8-001E: Ops & Driver Domain ──

  async listIncidents(): Promise<IncidentRecord[]> {
    return this.getList<IncidentRecord>("/api/incidents");
  }

  async createIncident(command: CreateIncidentCommand) {
    return this.post("/api/incidents", { body: command });
  }

  async getIncident(incidentId: string) {
    return this.get(`/api/incidents/${incidentId}`);
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
