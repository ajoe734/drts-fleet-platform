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

export interface SessionStatus {
  isActive: boolean;
  account?: PassengerAccount;
}

export interface PassengerViewModel {
  sessionStatus: SessionStatus;
  refreshSession(): Promise<void>;
  getSessionStatus(): Promise<SessionStatus>;
}

export type {
  GetPassengerRidesQuery,
  PassengerRideListResponse,
  GetActivePassengerRidesQuery,
  GetPassengerRideQuery,
  PassengerRideResponse,
  CancelPassengerRideCommand,
  CancelPassengerRideResponse,
  RatePassengerRideCommand,
  RatePassengerRideResponse,
  GetPassengerReceiptQuery,
  PassengerReceiptResponse,
  CreatePassengerComplaintCommand,
  CreatePassengerComplaintResponse,
} from "@drts/contracts";
