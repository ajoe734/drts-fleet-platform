import { createTenantClient, type ApiClient } from "@drts/api-client";
import type { BookingRecord, CrossAppResourceLink } from "@drts/contracts";
import {
  adaptBookingFixtureToCreateCommand,
  resolveDispatchEmbedDisposition,
  summarizeBookingGates,
  type EnterpriseDispatchBookingFixture,
} from "./dispatch-fixture-adapter";
import { getRuntimeApiBaseUrl } from "./runtime-config";
import { ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP } from "./tenant-api-gap-map";

const DEFAULT_ACTOR_ID = "enterprise-dispatch-web";

export class EnterpriseDispatchTenantClient {
  constructor(private readonly client: ApiClient) {}

  async createBookingFromFixture(fixture: EnterpriseDispatchBookingFixture) {
    return this.client.createTenantBooking(
      adaptBookingFixtureToCreateCommand(fixture),
    );
  }

  async getBooking(bookingId: string): Promise<BookingRecord> {
    return this.client.getTenantBooking(bookingId) as Promise<BookingRecord>;
  }

  async getBookingGateSnapshot(bookingId: string) {
    const booking = await this.getBooking(bookingId);
    return summarizeBookingGates(booking);
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
