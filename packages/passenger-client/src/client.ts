import {
  PassengerViewModel,
  SessionStatus,
  PassengerAccount,
} from "./types.js";

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

function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", ""),
  );
}

function deepToCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((v) => deepToCamelCase(v));
  }
  if (typeof obj === "object") {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[toCamelCase(key)] = deepToCamelCase(obj[key]);
    }
    return result;
  }
  return obj;
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
        this.sessionStatus.isActive = false;
        delete this.sessionStatus.account;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const payload = await response.json();
    const camelCased = deepToCamelCase(payload);

    // Unwrap the `{ data: ... }` envelope if it exists
    if (camelCased && typeof camelCased === "object" && "data" in camelCased) {
      return camelCased.data as T;
    }
    return camelCased as T;
  }

  async getAccount(): Promise<PassengerAccount> {
    const res = await this.request<import("./types.js").PassengerMeResponse>(
      "/api/passenger-app/me",
    );
    return res.account;
  }

  async getProviders(): Promise<import("./types.js").AuthProvidersResponse> {
    return this.request<import("./types.js").AuthProvidersResponse>(
      "/api/passenger-app/auth/providers",
    );
  }

  async getFares(): Promise<import("./types.js").FaresResponse> {
    return this.request<import("./types.js").FaresResponse>(
      "/api/passenger-app/fares",
    );
  }

  async getFareQuote(
    command: import("./types.js").FareQuoteCommand,
  ): Promise<import("./types.js").FareQuoteResponse> {
    // Convert to snake_case for the payload to backend
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    return this.request<import("./types.js").FareQuoteResponse>(
      "/api/passenger-app/quotes",
      {
        method: "POST",
        body: JSON.stringify(snakeCommand),
      },
    );
  }

  async login(
    request: import("./types.js").VerifyOtpCommand,
  ): Promise<import("./types.js").VerifyOtpResponse> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(request)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    const res = await this.request<import("./types.js").VerifyOtpResponse>(
      "/api/passenger-app/auth/otp/verify",
      {
        method: "POST",
        body: JSON.stringify(snakeCommand),
      },
    );
    if (res.result === "logged_in") {
      try {
        const account = await this.getAccount();
        if (account) {
          this.sessionStatus.isActive = true;
          this.sessionStatus.account = account;
        }
      } catch {
        this.sessionStatus.isActive = false;
        delete this.sessionStatus.account;
      }
    }
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>("/api/passenger-app/auth/logout", {
        method: "POST",
      });
    } finally {
      this.sessionStatus.isActive = false;
      delete this.sessionStatus.account;
    }
  }

  async refreshSession(): Promise<void> {
    await this.request<void>("/api/passenger-app/auth/refresh", {
      method: "POST",
    });
  }

  async requestOtp(
    command: import("./types.js").RequestOtpCommand,
  ): Promise<import("./types.js").RequestOtpResponse> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    return this.request<import("./types.js").RequestOtpResponse>(
      "/api/passenger-app/auth/otp/request",
      {
        method: "POST",
        body: JSON.stringify(snakeCommand),
      },
    );
  }

  async oauthStart(
    command: import("./types.js").OAuthStartCommand,
  ): Promise<import("./types.js").OAuthStartResponse> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    return this.request<import("./types.js").OAuthStartResponse>(
      "/api/passenger-app/auth/oauth/start",
      {
        method: "POST",
        body: JSON.stringify(snakeCommand),
      },
    );
  }

  async updateAccount(
    command: import("./types.js").UpdatePassengerMeCommand,
  ): Promise<void> {
    const snakeCommand: any = {};
    for (const [key, value] of Object.entries(command)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeCommand[snakeKey] = value;
    }
    await this.request<void>("/api/passenger-app/me", {
      method: "PATCH",
      body: JSON.stringify(snakeCommand),
    });
  }

  async getIdentities(): Promise<
    import("./types.js").PassengerIdentitiesResponse
  > {
    return this.request<import("./types.js").PassengerIdentitiesResponse>(
      "/api/passenger-app/me/identities",
    );
  }

  async unlinkIdentity(
    command: import("./types.js").UnlinkPassengerIdentityCommand,
  ): Promise<import("./types.js").UnlinkPassengerIdentityResponse> {
    return this.request<import("./types.js").UnlinkPassengerIdentityResponse>(
      `/api/passenger-app/me/identities/${command.identityId}`,
      {
        method: "DELETE",
      },
    );
  }

  async deleteAccount(): Promise<
    import("./types.js").DeletePassengerAccountResponse
  > {
    return this.request<import("./types.js").DeletePassengerAccountResponse>(
      `/api/passenger-app/me`,
      {
        method: "DELETE",
      },
    );
  }

  async getSessionStatus(): Promise<import("./types.js").SessionStatus> {
    try {
      const account = await this.getAccount();
      if (account) {
        this.sessionStatus.isActive = true;
        this.sessionStatus.account = account;
      } else {
        this.sessionStatus.isActive = false;
        delete this.sessionStatus.account;
      }
      return this.sessionStatus;
    } catch {
      this.sessionStatus.isActive = false;
      delete this.sessionStatus.account;
      return this.sessionStatus;
    }
  }
}
