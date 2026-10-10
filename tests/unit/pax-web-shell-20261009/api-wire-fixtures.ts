import type {
  AuthProvidersResponse,
  FareQuoteCommand,
  FareQuoteResponse,
  FaresResponse,
  PassengerMeResponse,
} from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";

// Mock the HTTP boundary, retaining the API's actual envelope and global
// SnakeCaseInterceptor serializer. These helpers belong to tests, not the
// portable passenger-client package.
export function apiWireResponse<T>(data: T): Response {
  return Response.json(
    deepToSnakeCase(toApiSuccessEnvelope(data, "pax-web-shell-regression")),
  );
}

export const me = {
  account: {
    drtsPassengerId: "pax-account-123",
    displayName: "測試乘客",
    contactPhone: "0900000000",
    contactPhoneVerified: true,
    verifiedEmail: "passenger@example.test",
    status: "active",
    createdAt: "2026-10-09T00:00:00Z",
  },
} satisfies PassengerMeResponse;

export const providers = {
  providers: ["email", "google", "facebook", "line"],
} satisfies AuthProvidersResponse;

export const quoteCommand = {
  originLat: 25.01,
  originLng: 121.51,
  destinationLat: 25.02,
  destinationLng: 121.52,
  scheduledAt: "2026-10-12T01:00:00Z",
} satisfies FareQuoteCommand;

export const quote = {
  serviceAreaResult: "serviceable",
  estimatedMin: 85,
  estimatedMax: 100,
  fareVersion: "test-v1",
  fareSnapshotId: "quote-snapshot-123",
  expiresAt: "2026-10-10T01:15:00Z",
} satisfies FareQuoteResponse;

// Synthetic contract values for transport tests, not published fare policy.
export const fares = {
  currentVersion: {
    version: "test-v1",
    effectiveAt: "2026-10-09T00:00:00Z",
    baseFare: 85,
    baseDistanceMeters: 1500,
    distanceRate: 5,
    distanceIncrementMeters: 200,
    delayRate: 5,
    delayIncrementSeconds: 60,
    nightSurcharge: 20,
    nightSurchargeWindowStart: "23:00",
    nightSurchargeWindowEnd: "06:00",
    additionalFees: { holiday: 10 },
  },
} satisfies FaresResponse;
