/**
 * @drts/api-client - Shared API client for DRTS client surfaces
 *
 * Provides a typed fetch wrapper around the Phase 1 API.
 * Uses the BootstrapAuthGuard header-based identity pattern.
 */

import type {
  ApiSuccessEnvelope,
  AttendanceRecord,
  CallSessionRecord,
  ClockInCommand,
  ClockOutCommand,
  ComplaintCaseRecord,
  CreateOwnedOrderCommand,
  CreateTenantBookingCommand,
  CreateCallCenterOrderCommand,
  DriverAcceptTaskCommand,
  DriverRegistryRecord,
  DriverRejectTaskCommand,
  DriverDepartTaskCommand,
  DriverArrivedPickupCommand,
  DriverStartTaskCommand,
  DriverCompleteTaskCommand,
  CreateComplaintCaseCommand,
  CreateReportJobCommand,
  DriverStatementRecord,
  DriverTaskRecord,
  GenerateFilingPackageCommand,
  IncidentRecord,
  MaintenanceRecord,
  NotificationRecord,
  OwnedOrderRecord,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
  ReportJobRecord,
  ShiftRecord,
  TenantAddressRecord,
  TenantApiKeyRecord,
  TenantInvoiceRecord,
  TenantPassengerRecord,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  UpsertTenantPassengerCommand,
  UpsertTenantAddressCommand,
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpdateTenantNotificationsCommand,
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
  FeatureFlag,
  FeatureFlagSummary,
  DispatchJobRecord,
  DispatchCandidate,
  AssignDispatchCommand,
  CancelOwnedOrderCommand,
  UpdateTenantBookingCommand,
  PlatformPresenceSummary,
  PlatformPresenceRecord,
  SetPlatformOnlineCommand,
  SetPlatformOfflineCommand,
  PlatformEarningsSummary,
  PlatformEarningsByPlatformResponse,
} from "@drts/contracts";

export interface ApiClientConfig {
  baseUrl: string;
  /** Headers to include in every request (auth identity, tenant context) */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

interface ListEnvelope<T> {
  items: T[];
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...config.defaultHeaders,
    };
    this.timeout = config.timeout ?? 30000;
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
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const init: RequestInit = {
        method,
        headers: {
          ...this.defaultHeaders,
          ...options?.headers,
        },
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
      return envelope.data;
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

  // ── Owned Mobility: Orders ──

  async createOrder(command: CreateOwnedOrderCommand) {
    return this.post("/api/orders", { body: command });
  }

  async listOrders(): Promise<OwnedOrderRecord[]> {
    return this.getList<OwnedOrderRecord>("/api/orders");
  }

  async getOrder(id: string) {
    return this.get(`/api/orders/${id}`);
  }

  async cancelOrder(id: string, command: CancelOwnedOrderCommand) {
    return this.post(`/api/orders/${id}/cancel`, { body: command });
  }

  async updateOrder(id: string, command: UpdateTenantBookingCommand) {
    return this.patch(`/api/orders/${id}`, { body: command });
  }

  // ── Owned Mobility: Call Center ──

  async createCallCenterOrder(command: CreateCallCenterOrderCommand) {
    return this.post("/api/call-center/orders", { body: command });
  }

  // ── Owned Mobility: Tenant Bookings ──

  async createTenantBooking(command: CreateTenantBookingCommand) {
    return this.post("/api/tenant/bookings", { body: command });
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

  async getCallSession(id: string) {
    return this.get(`/api/callcenter/sessions/${id}`);
  }

  async closeCallSession(id: string) {
    return this.post(`/api/callcenter/sessions/${id}/close`);
  }

  // ── Complaint ──

  async listComplaints(): Promise<ComplaintCaseRecord[]> {
    return this.getList<ComplaintCaseRecord>("/api/complaints");
  }

  async createComplaint(command: CreateComplaintCaseCommand) {
    return this.post("/api/complaints", { body: command });
  }

  async getComplaint(caseNo: string) {
    return this.get(`/api/complaints/${caseNo}`);
  }

  // ── Billing ──

  async getBillingProfile() {
    return this.get("/api/tenant/billing/profile");
  }

  async listInvoices(): Promise<TenantInvoiceRecord[]> {
    return this.getList<TenantInvoiceRecord>("/api/tenant/invoices");
  }

  async generateInvoice() {
    return this.post("/api/tenant/invoices/generate");
  }

  async listDriverStatements(): Promise<DriverStatementRecord[]> {
    return this.getList<DriverStatementRecord>("/api/driver-statements");
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

  async getPlatformEarningsByPlatform(): Promise<PlatformEarningsByPlatformResponse> {
    return this.get<PlatformEarningsByPlatformResponse>(
      "/api/platform-earnings/by-platform",
    );
  }

  // ── Reporting & Filing ──

  async createReportJob(command: CreateReportJobCommand) {
    return this.post("/api/reports/jobs", { body: command });
  }

  async listReportJobs(): Promise<ReportJobRecord[]> {
    return this.getList<ReportJobRecord>("/api/reports/jobs");
  }

  async getReportJob(jobId: string) {
    return this.get(`/api/reports/${jobId}`);
  }

  async generateFilingPackage(command: GenerateFilingPackageCommand) {
    return this.post("/api/filing-packages/generate", { body: command });
  }

  async getFilingPackage(packageId: string) {
    return this.get(`/api/filing-packages/${packageId}`);
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

  async rotateApiKey(command: RotateTenantApiKeyCommand) {
    return this.patch("/api/tenant/api-keys", { body: command });
  }

  async listWebhooks(): Promise<TenantWebhookEndpoint[]> {
    return this.getList<TenantWebhookEndpoint>("/api/tenant/webhooks");
  }

  async createWebhookEndpoint(command: CreateTenantWebhookEndpointCommand) {
    return this.post("/api/tenant/webhooks", { body: command });
  }

  async listNotifications(): Promise<NotificationRecord[]> {
    return this.getList<NotificationRecord>("/api/notifications");
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

  async createTenantUser(command: CreateTenantUserCommand) {
    return this.post("/api/tenant/users", { body: command });
  }

  async updateTenantRole(command: UpdateTenantRoleCommand) {
    return this.post("/api/tenant/roles", { body: command });
  }

  async listAuditLogs() {
    return this.getList("/api/audit");
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

  async listPlacards(): Promise<PlacardVersionRecord[]> {
    return this.getList<PlacardVersionRecord>("/api/platform-admin/placards");
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

  async listContracts(): Promise<VehicleContractRecord[]> {
    return this.getList<VehicleContractRecord>(
      "/api/regulatory-registry/contracts",
    );
  }

  // ── W8-001E: Ops & Driver Domain ──

  async listIncidents(): Promise<IncidentRecord[]> {
    return this.getList<IncidentRecord>("/api/incidents");
  }

  async createIncident(command: any) {
    return this.post("/api/incidents", { body: command });
  }

  async getIncident(incidentId: string) {
    return this.get(`/api/incidents/${incidentId}`);
  }

  async updateIncident(incidentId: string, command: any) {
    return this.patch(`/api/incidents/${incidentId}`, { body: command });
  }

  async listMaintenance(vehicleId?: string): Promise<MaintenanceRecord[]> {
    const path = vehicleId
      ? `/api/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`
      : "/api/maintenance";
    return this.getList<MaintenanceRecord>(path);
  }

  async createMaintenance(command: any) {
    return this.post("/api/maintenance", { body: command });
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
}

/**
 * Factory for creating API clients with Bootstrap Auth headers.
 */
export function createTenantClient(
  baseUrl: string,
  tenantId: string,
  actorId: string,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "tenant_user",
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
      "x-actor-type": "driver",
      "x-actor-id": driverId,
      "x-realm": "driver",
    },
  });
}

export function createPlatformAdminClient(
  baseUrl: string,
  actorId: string,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      "x-actor-type": "platform_admin",
      "x-actor-id": actorId,
      "x-realm": "platform",
    },
  });
}
