import { PassengerRideAuthorityView, PassengerRideSseEventEnvelope, PassengerPaymentStatus } from "./phase1-p5-s3-multi-taxi";

export const PASSENGER_REALM = "passenger";
export const FIRST_PARTY_PASSENGER_ACTOR_TYPE = "first_party_passenger";

export type AuthProvider = "phone" | "email" | "google" | "facebook" | "line";

export interface PassengerAccount {
  drtsPassengerId: string;
  displayName?: string;
  verifiedPhone?: string;
  verifiedEmail?: string;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  deletedAt?: string;
}

export interface PassengerLoginIdentity {
  drtsPassengerId: string;
  provider: AuthProvider;
  subject: string;
}

export interface PassengerSession {
  drtsPassengerId: string;
  refreshTokenFamily: string;
  deviceUa: string;
  createdAt: string;
}

export interface RequestOtpCommand {
  target: string;
  provider: "phone" | "email";
  purpose: "login" | "link";
}

export interface RequestOtpResponse {
  success: boolean;
  challenge: string;
  message: string;
}

export interface VerifyOtpCommand {
  target: string;
  code: string;
  provider: "phone" | "email";
  challenge: string;
}

export interface VerifyOtpResponse {
  result: "logged_in" | "linked";
  accessToken?: string;
  refreshToken?: string;
}

export interface OAuthStartCommand {
  provider: "google" | "facebook" | "line";
  redirectUri: string;
  purpose: "login" | "link";
}

export interface OAuthStartResponse {
  authUrl: string;
  state: string;
  nonce?: string;
}

export interface OAuthCallbackCommand {
  provider: "google" | "facebook" | "line";
  code: string;
  state: string;
}

export interface OAuthCallbackResponse {
  result: "logged_in" | "linked";
  accessToken?: string;
  refreshToken?: string;
}

export interface GetAuthProvidersQuery {}

export interface AuthProvidersResponse {
  providers: AuthProvider[];
}

export interface RefreshSessionCommand {
  refreshToken: string;
}

export interface RefreshSessionResponse {
  accessToken: string;
  refreshToken: string;
}

export interface LogoutCommand {
  refreshToken: string;
}

export interface LogoutResponse {
  success: boolean;
}

export interface GetPassengerMeQuery {}

export interface PassengerMeResponse {
  account: PassengerAccount;
}

export interface UpdatePassengerMeCommand {
  displayName?: string;
  contactConsent?: boolean;
}

export interface GetPassengerIdentitiesQuery {}

export interface PassengerIdentitiesResponse {
  identities: PassengerLoginIdentity[];
}

export interface UnlinkPassengerIdentityCommand {
  provider: AuthProvider;
}

export interface UnlinkPassengerIdentityResponse {
  success: boolean;
}

export interface DeletePassengerAccountCommand {
  drtsPassengerId: string;
}

export interface DeletePassengerAccountResponse {
  success: boolean;
}

export interface FareVersion {
  version: string;
  effectiveAt: string;
  baseFare: number;
  baseDistanceMeters: number;
  distanceRate: number;
  distanceIncrementMeters: number;
  delayRate: number;
  delayIncrementSeconds: number;
  nightSurcharge: number;
  nightSurchargeWindowStart: string; // e.g. "23:00"
  nightSurchargeWindowEnd: string;   // e.g. "06:00"
  additionalFees: Record<string, number>;
}

export interface GetFaresQuery {}

export interface FaresResponse {
  currentVersion: FareVersion;
}

export interface FareQuoteCommand {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  scheduledAt: string;
}

export interface FareQuoteResponse {
  serviceAreaResult: "serviceable" | "not_serviceable";
  estimatedMin?: number;
  estimatedMax?: number;
  fareVersion?: string;
  fareSnapshotId?: string;
  expiresAt?: string;
}

export interface CreatePassengerRideCommand {
  scheduledAt: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  paymentMethodId: string;
  fareSnapshotId: string;
  passengerConfirmedAt: string;
}

export interface PassengerRideResponse {
  ride: PassengerRideAuthorityView;
}

export interface GetPassengerRidesQuery {
  status?: "active" | "completed" | "cancelled";
  limit?: number;
  cursor?: string;
}

export interface PassengerRideListResponse {
  rides: PassengerRideAuthorityView[];
  nextCursor?: string;
}

export interface GetActivePassengerRidesQuery {}

export interface GetPassengerRideQuery {
  rideId: string;
}

export interface CancelPassengerRideCommand {
  rideId: string;
  reason?: string;
}

export interface CancelPassengerRideResponse {
  success: boolean;
}

export interface RatePassengerRideCommand {
  rideId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  comments?: string;
  contactRequested?: boolean;
}

export interface RatePassengerRideResponse {
  success: boolean;
}

export interface GetPassengerReceiptQuery {
  rideId: string;
}

export interface PassengerReceiptResponse {
  receiptUrl: string;
}

export interface CreatePassengerComplaintCommand {
  rideId?: string;
  category: "driver_behavior" | "vehicle_condition" | "safety" | "payment_issue" | "lost_item" | "other";
  content: string;
  contactConsent: boolean;
}

export interface CreatePassengerComplaintResponse {
  complaintId: string;
}

export interface PassengerPaymentMethod {
  paymentMethodId: string;
  last4: string;
  cardType: string;
  expiryMonth: string;
  expiryYear: string;
  isDefault: boolean;
}

export interface GetPaymentMethodsQuery {}

export interface PaymentMethodsResponse {
  methods: PassengerPaymentMethod[];
}

export interface BindPaymentMethodCommand {
  providerToken: string;
}

export interface PaymentMethodResponse {
  method: PassengerPaymentMethod;
}

export interface SetDefaultPaymentMethodCommand {
  paymentMethodId: string;
}

export interface RemovePaymentMethodCommand {
  paymentMethodId: string;
}

export interface RemovePaymentMethodResponse {
  success: boolean;
}

export interface RegisterPushDeviceCommand {
  deviceToken: string;
  platform: "ios" | "android" | "web";
}

export interface RegisterPushDeviceResponse {
  success: boolean;
}

export type { PassengerRideAuthorityView, PassengerRideSseEventEnvelope, PassengerPaymentStatus };
