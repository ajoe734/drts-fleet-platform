import { PassengerRideAuthorityView } from "./phase1-p5-s3-multi-taxi";

export const PASSENGER_REALM = "passenger";
export const FIRST_PARTY_PASSENGER_ACTOR_TYPE = "first_party_passenger";

export type AuthProvider = "phone" | "email" | "google" | "facebook" | "line";

export interface PassengerAccount {
  drtsPassengerId: string;
  displayName?: string;
  contactPhone?: string;
  contactPhoneVerified: boolean;
  verifiedPhone?: string;
  verifiedEmail?: string;
  termsVersion?: string;
  privacyVersion?: string;
  feeAcknowledgementVersion?: string;
  contactConsent?: boolean;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  deletedAt?: string;
}

export interface PassengerLoginIdentity {
  drtsPassengerId: string;
  provider: AuthProvider;
  subject: string;
  identityId: string;
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
  purpose: "login" | "link" | "verify_contact_phone";
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

export type VerifyOtpResponse =
  | { result: "logged_in"; accessToken: string; refreshToken: string }
  | { result: "linked" }
  | { result: "verified_contact_phone" };

export interface OAuthStartCommand {
  provider: "google" | "facebook" | "line";
  redirectUri: string;
  purpose: "login" | "link";
}

export interface OAuthStartResponse {
  authUrl: string;
  transactionId: string;
  expiresAt: string;
  state: string;
  nonce?: string;
}

export interface OAuthCallbackCommand {
  provider: "google" | "facebook" | "line";
  code: string;
  state: string;
  transactionId: string;
}

export type OAuthCallbackResponse =
  | {
      result: "logged_in";
      drtsPassengerId: string;
      accessToken: string;
      refreshToken: string;
    }
  | { result: "linked" };

export interface FacebookDataDeletionCommand {
  signed_request: string;
}

export interface FacebookDataDeletionResponse {
  url: string;
  confirmation_code: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetPassengerMeQuery {}

export interface PassengerMeResponse {
  account: PassengerAccount;
}

export interface UpdatePassengerMeCommand {
  displayName?: string;
  contactPhone?: string;
  termsVersion?: string;
  privacyVersion?: string;
  feeAcknowledgementVersion?: string;
  contactConsent?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetPassengerIdentitiesQuery {}

export interface PassengerIdentitiesResponse {
  identities: PassengerLoginIdentity[];
}

export interface UnlinkPassengerIdentityCommand {
  identityId: string;
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
  nightSurchargeWindowEnd: string; // e.g. "06:00"
  additionalFees: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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

export type FareQuoteResponse =
  | {
      serviceAreaResult: "serviceable";
      estimatedMin: number;
      estimatedMax: number;
      fareVersion: string;
      fareSnapshotId: string;
      expiresAt: string;
    }
  | {
      serviceAreaResult: "not_serviceable";
    };

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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
  pdfUrl?: string;
}

export interface RefundPassengerRideCommand {
  rideId: string;
  reason: string;
  amount?: number;
}

export interface RefundPassengerRideResponse {
  success: boolean;
  refundId: string;
}

export interface CreatePassengerComplaintCommand {
  rideId: string;
  category: "service" | "fare" | "lost_item" | "other";
  lostItemDescription?: string;
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetPaymentMethodsQuery {}

export interface PaymentMethodsResponse {
  methods: PassengerPaymentMethod[];
}

export interface BindPaymentMethodCommand {
  providerToken: string;
}

export type PaymentMethodResponse =
  | { status: "completed"; method: PassengerPaymentMethod }
  | { status: "action_required"; nextActionUrl: string }
  | { status: "pending" };

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
  platform: "ios" | "android";
  provider: "fcm_v1";
  appId: string;
  appVersion: string;
  token: string;
  notificationConsentVersion: string;
  previousDeviceId?: string;
}

export interface RegisterPushDeviceResponse {
  deviceId: string;
}

export interface UnregisterPushDeviceCommand {
  deviceId: string;
}

export interface UnregisterPushDeviceResponse {
  success: boolean;
}
