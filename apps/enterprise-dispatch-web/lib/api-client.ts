import {
  ApiClient,
  createTenantClient,
  type RequestOptions,
} from "@drts/api-client";
import type {
  AssignDispatchCommand,
  BookingRecord,
  PassengerRideContactOption,
  CancelOwnedOrderCommand,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
  DispatchOrderCommand,
  ReassignDispatchCommand,
  TenantBookingListQuery,
  TenantBookingsPageRecord,
  TenantDashboardSummary,
  TenantPassengerRecord,
  TenantAddressRecord,
  TenantCostCenterRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import {
  adaptBookingFixtureToCreateCommand,
  resolveDispatchEmbedDisposition,
  summarizeBookingGates,
  type EnterpriseDispatchBookingFixture,
} from "./dispatch-fixture-adapter";
import type { EnterpriseTenantSession } from "./enterprise-session.server";
import { getRuntimeApiBaseUrl } from "./runtime-config";
import { ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP } from "./tenant-api-gap-map";

const DEFAULT_ACTOR_ID = "enterprise-dispatch-web";

// SR-ENTERPRISE-SEARCH-001: the composable, testable search-query builder
// lives in ./enterprise-booking-search (no @drts/api-client dependency) so
// root Vitest can import it directly; re-exported here for callers that
// already import the tenant client from this module.
export * from "./enterprise-booking-search";

// SR-ENTERPRISE-DATA-001: same rationale — pure home/trip status logic lives
// in ./enterprise-trip-status so root Vitest can import it directly.
export * from "./enterprise-trip-status";

export type EnterpriseDispatchBookingSubmitResult = {
  orderId: string;
  bookingId: string;
  serviceBucket: "business_dispatch";
  businessDispatchSubtype: string;
  dispatchSemantics: "reservation";
  status: string;
};

export type TenantBookingDriverContactOption = PassengerRideContactOption & {
  bookingId: string;
  orderId: string;
  assignmentId: string;
};

export interface EnterpriseBookingDirectory {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
}

export class EnterpriseDispatchTenantClient {
  constructor(private readonly client: ApiClient) {}

  async createBooking(
    command: CreateTenantBookingCommand,
    options?: RequestOptions,
  ): Promise<EnterpriseDispatchBookingSubmitResult> {
    return this.client.createTenantBooking(
      command,
      options,
    ) as Promise<EnterpriseDispatchBookingSubmitResult>;
  }

  async createBookingFromFixture(
    fixture: EnterpriseDispatchBookingFixture,
  ): Promise<EnterpriseDispatchBookingSubmitResult> {
    return this.createBooking(adaptBookingFixtureToCreateCommand(fixture));
  }

  async getBookingDirectory(): Promise<EnterpriseBookingDirectory> {
    const [passengers, addresses, costCenters] = await Promise.all([
      this.client.listPassengers(),
      this.client.listAddresses(),
      this.client.listCostCenters({ activeOnly: true }),
    ]);
    return { passengers, addresses, costCenters };
  }

  async getBooking(bookingId: string): Promise<BookingRecord> {
    return this.client.getTenantBooking(bookingId) as Promise<BookingRecord>;
  }

  async getDriverContact(
    bookingId: string,
  ): Promise<TenantBookingDriverContactOption> {
    return this.client.get<TenantBookingDriverContactOption>(
      `/api/tenant/bookings/${encodeURIComponent(bookingId)}/driver-contact`,
    );
  }

  async getDashboardSummary(): Promise<TenantDashboardSummary> {
    return this.client.getTenantDashboardSummary();
  }

  async listBookings(): Promise<BookingRecord[]> {
    return this.client.listTenantBookings();
  }

  async queryBookings(
    query: TenantBookingListQuery,
    options?: RequestOptions,
  ): Promise<TenantBookingsPageRecord> {
    return this.client.queryTenantBookings(query, options);
  }

  async updateBooking(
    bookingId: string,
    command: UpdateTenantBookingCommand,
  ): Promise<BookingRecord> {
    return this.client.updateTenantBooking(
      bookingId,
      command,
    ) as Promise<BookingRecord>;
  }

  async cancelBooking(
    bookingId: string,
    command: CancelOwnedOrderCommand,
  ): Promise<BookingRecord> {
    return this.client.cancelTenantBooking(
      bookingId,
      command,
    ) as Promise<BookingRecord>;
  }

  async getBookingGateSnapshot(bookingId: string) {
    const booking = await this.getBooking(bookingId);
    return summarizeBookingGates(booking);
  }

  async dispatchOrder(
    orderId: string,
    command?: DispatchOrderCommand,
    options?: RequestOptions,
  ) {
    return this.client.dispatchOrder(orderId, command, options);
  }

  async redispatchOrder(
    orderId: string,
    reasonCode = "operator_redispatch",
    options?: {
      reasonNote?: string;
      operatorId?: string;
      escalationTarget?: "ops_supervisor" | "dispatch_manager" | null;
      expectedAssignmentVersion?: number | null;
      idempotencyKey?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ) {
    return this.client.redispatchOrder(orderId, reasonCode, options);
  }

  async assignDispatch(
    command: AssignDispatchCommand,
    options?: RequestOptions,
  ) {
    return this.client.assignDispatch(command, options);
  }

  async reassignDispatch(
    command: ReassignDispatchCommand,
    options?: RequestOptions,
  ) {
    return this.client.reassignDispatch(command, options);
  }

  getEmbedDisposition(link?: CrossAppResourceLink | null) {
    return resolveDispatchEmbedDisposition(link);
  }

  getGapMap() {
    return ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP;
  }
}

export function createEnterpriseDispatchTenantClient(
  baseUrl: string,
  tenantId: string,
  actorId = DEFAULT_ACTOR_ID,
) {
  return new EnterpriseDispatchTenantClient(
    createTenantClient(baseUrl, tenantId, actorId),
  );
}

export function createEnterpriseDispatchSessionClient(
  session: EnterpriseTenantSession,
  baseUrl = getRuntimeApiBaseUrl(),
) {
  const trimmedTenantId = session.tenantId.trim();
  const trimmedToken = session.accessToken.trim();
  return new EnterpriseDispatchTenantClient(
    new ApiClient({
      baseUrl,
      defaultHeaders: {
        ...(session.upstreamHeaders ?? {}),
        ...(trimmedToken ? { Authorization: `Bearer ${trimmedToken}` } : {}),
        ...(trimmedTenantId ? { "x-tenant-id": trimmedTenantId } : {}),
      },
    }),
  );
}

export type EnterpriseDispatchSessionOptions = {
  accessToken?: string;
  upstreamHeaders?: Record<string, string>;
};

const clientCache = new Map<string, EnterpriseDispatchTenantClient>();

export function getEnterpriseDispatchTenantClient(
  tenantOrSession: string | EnterpriseTenantSession,
  sessionOptions?: EnterpriseDispatchSessionOptions,
) {
  const baseUrl = getRuntimeApiBaseUrl();
  if (typeof tenantOrSession !== "string") {
    return createEnterpriseDispatchSessionClient(tenantOrSession, baseUrl);
  }

  const trimmedTenantId = tenantOrSession.trim();
  const accessToken = sessionOptions?.accessToken?.trim();
  if (accessToken) {
    return createEnterpriseDispatchSessionClient(
      {
        tenantId: trimmedTenantId,
        accessToken,
        ...(sessionOptions?.upstreamHeaders
          ? { upstreamHeaders: sessionOptions.upstreamHeaders }
          : {}),
      },
      baseUrl,
    );
  }

  const cacheKey = `${baseUrl}::${trimmedTenantId}`;
  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = new EnterpriseDispatchTenantClient(
    new ApiClient({
      baseUrl,
      defaultHeaders: trimmedTenantId ? { "x-tenant-id": trimmedTenantId } : {},
    }),
  );
  clientCache.set(cacheKey, client);
  return client;
}
