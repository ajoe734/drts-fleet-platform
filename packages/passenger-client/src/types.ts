import type {
  PassengerAccount,
  PassengerSession,
  AuthProvider,
  FareQuoteCommand,
  FareQuoteResponse,
  VerifyOtpCommand,
  VerifyOtpResponse,
  AuthProvidersResponse,
  PassengerMeResponse,
} from "@drts/contracts";

export type {
  PassengerAccount,
  PassengerSession,
  AuthProvider,
  FareQuoteCommand,
  FareQuoteResponse,
  VerifyOtpCommand,
  VerifyOtpResponse,
  AuthProvidersResponse,
  PassengerMeResponse,
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
