import type {
  PassengerAccount,
  PassengerSession,
  AuthProvider,
  FareQuoteCommand,
  FareQuoteResponse,
  VerifyOtpCommand,
  AuthProvidersResponse,
  PassengerMeResponse,
  FaresResponse,
  RequestOtpCommand,
  RequestOtpResponse,
  UpdatePassengerMeCommand,
  PassengerIdentitiesResponse,
  UnlinkPassengerIdentityCommand,
  UnlinkPassengerIdentityResponse,
  DeletePassengerAccountCommand,
  DeletePassengerAccountResponse,
  OAuthStartCommand,
  OAuthStartResponse,
} from "@drts/contracts";

export type VerifyOtpResponse =
  | { result: "logged_in" }
  | { result: "linked" }
  | { result: "verified_contact_phone" };

export type {
  PassengerAccount,
  PassengerSession,
  AuthProvider,
  FareQuoteCommand,
  FareQuoteResponse,
  VerifyOtpCommand,
  AuthProvidersResponse,
  PassengerMeResponse,
  FaresResponse,
  RequestOtpCommand,
  RequestOtpResponse,
  UpdatePassengerMeCommand,
  PassengerIdentitiesResponse,
  UnlinkPassengerIdentityCommand,
  UnlinkPassengerIdentityResponse,
  DeletePassengerAccountCommand,
  DeletePassengerAccountResponse,
  OAuthStartCommand,
  OAuthStartResponse,
};

export interface SessionStatus {
  isActive: boolean;
  account?: PassengerAccount;
}

export interface PassengerViewModel {
  sessionStatus: SessionStatus;
  refreshSession(): Promise<void>;
  getSessionStatus(): Promise<SessionStatus>;
}
