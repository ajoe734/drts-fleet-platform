import { PassengerViewModel, SessionStatus, PassengerAccount } from "./types.js";

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
}

export type FetchFn = (
  url: string,
  options?: FetchOptions,
) => Promise<FetchResponse>;

export interface PassengerClientOptions {
  baseUrl: string;
  fetchFn?: FetchFn;
}

export class PassengerClient implements PassengerViewModel {
  private baseUrl: string;
  private fetchFn: FetchFn;

  // View-model reactive state foundation
  public sessionStatus: SessionStatus = { isActive: false };

  constructor(options: PassengerClientOptions) {
    this.baseUrl = options.baseUrl;
    // We expect fetch to be provided or available globally, but we don't import DOM.
    this.fetchFn =
      options.fetchFn ||
      (typeof globalThis !== "undefined" && "fetch" in globalThis
        ? (globalThis as any).fetch.bind(globalThis)
        : null);
  }

  private async request<T>(path: string, options?: FetchOptions): Promise<T> {
    if (!this.fetchFn) {
      throw new Error("fetch is not available");
    }
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.sessionStatus.isActive = false; delete this.sessionStatus.account;
      }
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  async getAccount(): Promise<PassengerAccount> {
    const res = await this.request<import("./types.js").PassengerMeResponse>("/api/passenger-app/me");
    return res.account;
  }

  async getProviders(): Promise<import("./types.js").AuthProvidersResponse> {
    return this.request<import("./types.js").AuthProvidersResponse>("/api/passenger-app/auth/providers");
  }

  async getFareQuote(command: import("./types.js").FareQuoteCommand): Promise<import("./types.js").FareQuoteResponse> {
    return this.request<import("./types.js").FareQuoteResponse>("/api/passenger-app/quotes", {
      method: "POST",
      body: JSON.stringify(command)
    });
  }

  async login(request: import("./types.js").VerifyOtpCommand): Promise<import("./types.js").VerifyOtpResponse> {
    const res = await this.request<import("./types.js").VerifyOtpResponse>("/api/passenger-app/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (res.result === "logged_in") {
      this.sessionStatus.isActive = true;
      // Note: We'll fetch account after logging in to populate the view model
      try {
         this.sessionStatus.account = await this.getAccount();
      } catch {
         // Silently catch account fetch errors
      }
    }
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>("/api/passenger-app/auth/logout", {
        method: "POST"
      });
    } finally {
      this.sessionStatus.isActive = false; delete this.sessionStatus.account;
    }
  }

  async refreshSession(): Promise<void> {
    await this.request<void>("/api/passenger-app/auth/refresh", {
      method: "POST"
    });
  }

  async getSessionStatus(): Promise<import("./types.js").SessionStatus> {
    try {
      const account = await this.getAccount();
      this.sessionStatus.isActive = true; this.sessionStatus.account = account;
      return this.sessionStatus;
    } catch {
      this.sessionStatus.isActive = false; delete this.sessionStatus.account;
      return this.sessionStatus;
    }
  }
}
