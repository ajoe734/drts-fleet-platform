import {
  createTenantClient,
  type ApiClient,
  type RequestOptions,
} from "@drts/api-client";
import type {
  AssignDispatchCommand,
  BookingRecord,
  CancelOwnedOrderCommand,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
  DispatchOrderCommand,
  ReassignDispatchCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import {
  adaptBookingFixtureToCreateCommand,
  resolveDispatchEmbedDisposition,
  summarizeBookingGates,
  type EnterpriseDispatchBookingFixture,
} from "./dispatch-fixture-adapter";
import { getRuntimeApiBaseUrl } from "./runtime-config";
import { ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP } from "./tenant-api-gap-map";

const DEFAULT_ACTOR_ID = "enterprise-dispatch-web";

export type EnterpriseDispatchBookingSubmitResult = {
  orderId: string;
  bookingId: string;
  serviceBucket: "business_dispatch";
  businessDispatchSubtype: string;
  dispatchSemantics: "reservation";
  status: string;
};

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

  async getBooking(bookingId: string): Promise<BookingRecord> {
    return this.client.getTenantBooking(bookingId) as Promise<BookingRecord>;
  }

  async listBookings(): Promise<BookingRecord[]> {
    return this.client.listTenantBookings();
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

const clientCache = new Map<string, EnterpriseDispatchTenantClient>();

export function getEnterpriseDispatchTenantClient(tenantId: string) {
  const baseUrl = getRuntimeApiBaseUrl();
  const cacheKey = `${baseUrl}::${tenantId}`;
  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = createEnterpriseDispatchTenantClient(baseUrl, tenantId);
  clientCache.set(cacheKey, client);
  return client;
}
