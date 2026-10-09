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
}

export interface RequestOtpResponse {
  success: boolean;
  message: string;
}

export interface VerifyOtpCommand {
  target: string;
  code: string;
  provider: "phone" | "email";
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
}

export interface OAuthStartQuery {
  provider: "google" | "facebook" | "line";
  redirectUri: string;
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
  accessToken: string;
  refreshToken: string;
}

export interface FareVersion {
  version: string;
  effectiveAt: string;
  baseFare: number;
  distanceRate: number;
  delayRate: number;
  nightSurcharge: number;
  additionalFees: Record<string, number>;
}

export interface FareQuoteCommand {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

export interface FareQuoteResponse {
  estimatedMin: number;
  estimatedMax: number;
  fareVersion: string;
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
  rideId: string;
  status: string;
}

export interface GetPassengerRidesQuery {
  status?: "active" | "completed" | "cancelled";
}

export interface PassengerRideListResponse {
  rides: PassengerRideResponse[];
}

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
  rating: number; // 1-5
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
  type: "complaint" | "lost_and_found";
  content: string;
}

export interface CreatePassengerComplaintResponse {
  complaintId: string;
}

export interface DeletePassengerAccountCommand {
  drtsPassengerId: string;
}

export interface DeletePassengerAccountResponse {
  success: boolean;
}

export interface PassengerPaymentMethod {
  paymentMethodId: string;
  last4: string;
  cardType: string;
  expiryMonth: string;
  expiryYear: string;
}
