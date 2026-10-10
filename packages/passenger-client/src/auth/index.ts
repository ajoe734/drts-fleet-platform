import type {
  AuthProvidersResponse,
  DeletePassengerAccountResponse,
  OAuthStartCommand,
  PassengerAccount,
  PassengerIdentitiesResponse,
  RequestOtpCommand,
  RequestOtpResponse,
  UnlinkPassengerIdentityResponse,
  UpdatePassengerMeCommand,
  VerifyOtpCommand,
} from "@drts/contracts";
import type {
  FetchFn,
  FetchOptions,
  PassengerClientOptions,
} from "../client.js";

export type {
  AuthProvider,
  PassengerLoginIdentity,
  RequestOtpCommand,
  UpdatePassengerMeCommand,
} from "@drts/contracts";
export type OAuthProvider = OAuthStartCommand["provider"];
export type AuthResult = {
  result: "logged_in" | "linked" | "verified_contact_phone";
};
export type OAuthRedirect = { authUrl: string };

export class PassengerAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryAfter?: number,
  ) {
    super(code);
    this.name = "PassengerAuthError";
  }
}

function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      camel(item),
    ]),
  );
}

/** Portable auth/account extension. Only the HTTP boundary is injected.
 * Commands follow the API parsers; envelopes follow SnakeCaseInterceptor.
 * Browser cookies/transactionId are held by the BFF, never by this client.
 */
export class PassengerAuthClient {
  private readonly fetchFn: FetchFn;
  private readonly baseUrl: string;
  constructor(options: PassengerClientOptions) {
    this.baseUrl = options.baseUrl;
    if (!options.fetchFn) throw new Error("Auth transport is required");
    this.fetchFn = options.fetchFn;
  }
  private async request<T>(path: string, options?: FetchOptions): Promise<T> {
    const response = await this.fetchFn(
      `${this.baseUrl}/api/passenger-app/${path}`,
      {
        ...options,
        headers: { "Content-Type": "application/json", ...options?.headers },
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload?.error;
      const code = typeof error === "string" ? error : error?.code;
      const headers = (
        response as { headers?: { get(name: string): string | null } }
      ).headers;
      const retry = Number(headers?.get("retry-after"));
      throw new PassengerAuthError(
        response.status,
        typeof code === "string" ? code : "unavailable",
        error?.details,
        Number.isFinite(retry) && retry > 0 ? retry : undefined,
      );
    }
    const decoded = camel(payload) as { data?: T } | null;
    if (!decoded) throw new PassengerAuthError(503, "unavailable");
    return ("data" in decoded ? decoded.data : decoded) as T;
  }
  async getAccount(): Promise<PassengerAccount> {
    return (await this.request<{ account: PassengerAccount }>("me")).account;
  }
  getProviders(): Promise<AuthProvidersResponse> {
    return this.request("auth/providers");
  }
  requestOtp(command: RequestOtpCommand): Promise<RequestOtpResponse> {
    return this.request("auth/otp/request", {
      method: "POST",
      body: JSON.stringify(command),
    });
  }
  login(command: VerifyOtpCommand): Promise<AuthResult> {
    return this.request("auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(command),
    });
  }
  oauthStart(command: OAuthStartCommand): Promise<OAuthRedirect> {
    return this.request(`auth/oauth/${command.provider}/start`, {
      method: "POST",
      body: JSON.stringify(command),
    });
  }
  oauthCallback(
    provider: OAuthProvider,
    command: { code?: string; state: string; error?: string },
  ): Promise<AuthResult> {
    return this.request(`auth/oauth/${provider}/callback`, {
      method: "POST",
      body: JSON.stringify({ ...command, provider }),
    });
  }
  updateAccount(
    command: UpdatePassengerMeCommand,
  ): Promise<{ account: PassengerAccount }> {
    return this.request("me", {
      method: "PATCH",
      body: JSON.stringify(command),
    });
  }
  getIdentities(): Promise<PassengerIdentitiesResponse> {
    return this.request("me/identities");
  }
  unlinkIdentity(command: {
    identityId: string;
  }): Promise<UnlinkPassengerIdentityResponse> {
    return this.request(
      `me/identities/${encodeURIComponent(command.identityId)}`,
      { method: "DELETE" },
    );
  }
  deleteAccount(): Promise<DeletePassengerAccountResponse> {
    return this.request("me", { method: "DELETE" });
  }
  logout(): Promise<{ success: boolean }> {
    return this.request("auth/logout", { method: "POST" });
  }
}
