import { PassengerAccount, AuthProviders, FareQuote, PassengerViewModel, SessionStatus } from "./types.js";

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
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  async getAccount(): Promise<PassengerAccount> {
    return this.request<PassengerAccount>("/api/passenger-app/account");
  }

  async getProviders(): Promise<AuthProviders> {
    return this.request<AuthProviders>("/api/passenger-app/auth/providers");
  }

  async getFareQuote(origin: string, destination: string): Promise<FareQuote> {
    return this.request<FareQuote>(
      `/api/passenger-app/fares/quote?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
    );
  }

  async login(request: import("./types.js").LoginRequest): Promise<import("./types.js").LoginResponse> {
    return this.request<import("./types.js").LoginResponse>("/api/passenger-app/auth/login", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }

  async logout(): Promise<void> {
    return this.request<void>("/api/passenger-app/auth/logout", {
      method: "POST"
    });
  }

  async refreshSession(): Promise<void> {
    await this.request<void>("/api/passenger-app/auth/refresh", {
      method: "POST"
    });
  }

  async getSessionStatus(): Promise<import("./types.js").SessionStatus> {
    try {
      const account = await this.getAccount();
      this.sessionStatus = { isActive: true, account };
      return this.sessionStatus;
    } catch {
      this.sessionStatus = { isActive: false };
      return this.sessionStatus;
    }
  }
}
