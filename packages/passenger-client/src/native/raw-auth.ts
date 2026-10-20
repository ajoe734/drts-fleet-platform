import type {
  AuthProvidersResponse,
  LogoutResponse,
  OAuthCallbackCommand,
  OAuthCallbackResponse,
  OAuthStartCommand,
  OAuthStartResponse,
  RefreshSessionResponse,
  RequestOtpCommand,
  RequestOtpResponse,
  VerifyOtpCommand,
  VerifyOtpResponse,
} from "@drts/contracts";
import { PassengerApiError } from "../auth/errors.js";
import type { FetchFn } from "../client.js";
import { decodeBookingWire } from "../booking/wire.js";

/** Raw API auth, separate from the browser client whose BFF owns cookies. */
export class PassengerNativeAuthClient {
  private readonly baseUrl: string;
  constructor(private readonly options: { baseUrl: string; fetchFn: FetchFn }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    accessToken?: string,
  ): Promise<T> {
    const response = await this.options.fetchFn(
      `${this.baseUrl}/api/passenger-app/${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) {
        throw new PassengerApiError(
          502,
          "invalid_auth_response",
          "Login response is unavailable.",
        );
      }
    }
    if (!response.ok) {
      const error = payload?.error;
      throw new PassengerApiError(
        response.status,
        typeof error === "string" ? error : (error?.code ?? "unavailable"),
        error?.message ?? `API error: ${response.status}`,
        error?.details ?? {},
        error?.retryable === true,
      );
    }
    const decoded = decodeBookingWire(payload) as any;
    return (
      decoded && typeof decoded === "object" && "data" in decoded
        ? decoded.data
        : decoded
    ) as T;
  }

  getProviders(): Promise<AuthProvidersResponse> {
    return this.request("auth/providers", "GET");
  }
  requestOtp(
    command: RequestOtpCommand,
    accessToken?: string,
  ): Promise<RequestOtpResponse> {
    return this.request("auth/otp/request", "POST", command, accessToken);
  }
  verifyOtp(
    command: VerifyOtpCommand,
    accessToken?: string,
  ): Promise<VerifyOtpResponse> {
    return this.request("auth/otp/verify", "POST", command, accessToken);
  }
  oauthStart(
    command: OAuthStartCommand,
    accessToken?: string,
  ): Promise<OAuthStartResponse> {
    return this.request(
      `auth/oauth/${command.provider}/start`,
      "POST",
      command,
      accessToken,
    );
  }
  oauthCallback(
    command: OAuthCallbackCommand,
    accessToken?: string,
  ): Promise<OAuthCallbackResponse> {
    return this.request(
      `auth/oauth/${command.provider}/callback`,
      "POST",
      command,
      accessToken,
    );
  }
  /** These existing commands prove their own refresh token; no expired access Bearer. */
  refresh(refreshToken: string): Promise<RefreshSessionResponse> {
    return this.request("auth/refresh", "POST", { refreshToken });
  }
  logout(refreshToken: string): Promise<LogoutResponse> {
    return this.request("auth/logout", "POST", { refreshToken });
  }
}
