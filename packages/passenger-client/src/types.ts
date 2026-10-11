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
};

export type {
  RequestOtpCommand,
  RequestOtpResponse,
  OAuthStartCommand,
  OAuthStartResponse,
  UpdatePassengerMeCommand,
  PassengerLoginIdentity,
  PassengerIdentitiesResponse,
  UnlinkPassengerIdentityCommand,
  UnlinkPassengerIdentityResponse,
  DeletePassengerAccountResponse,
} from "@drts/contracts";

/** The web BFF removes session credentials before exposing the formal result. */
export type BrowserOAuthCallbackResponse =
  | { result: "logged_in"; drtsPassengerId: string }
  | { result: "linked" };

export interface SessionStatus {
  isActive: boolean;
  account?: PassengerAccount;
}

export interface PassengerViewModel {
  sessionStatus: SessionStatus;
  refreshSession(): Promise<void>;
  getSessionStatus(): Promise<SessionStatus>;
}
