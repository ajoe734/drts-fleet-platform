export interface PassengerAccount {
  id: string;
  displayName: string;
  verifiedPhone: string | null;
  verifiedEmail: string | null;
  status: "active" | "suspended" | "deleted";
}

export interface PassengerSession {
  accessToken: string;
  expiresAt: string;
}

export interface SessionStatus {
  isActive: boolean;
  account?: PassengerAccount;
}

export interface PassengerViewModel {
  sessionStatus: SessionStatus;
  refreshSession(): Promise<void>;
  getSessionStatus(): Promise<SessionStatus>;
}

export interface AuthProviders {
  phone: boolean;
  email: boolean;
  google: boolean;
  facebook: boolean;
  line: boolean;
}

export interface FareQuote {
  version: string;
  estimatedTotal: number;
  currency: string;
  breakdown: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    surcharges: number;
  };
}

export interface LoginRequest {
  challengeId: string;
  otp: string;
}

export interface LoginResponse {
  success: boolean;
  account?: PassengerAccount;
}
