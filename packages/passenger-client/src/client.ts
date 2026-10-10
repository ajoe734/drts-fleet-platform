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

  async getRides(
    query?: import("./types.js").GetPassengerRidesQuery,
  ): Promise<import("./types.js").PassengerRideListResponse> {
    const qs = query ? "?" + Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&") : "";
    return this.request<import("./types.js").PassengerRideListResponse>(
      `/api/passenger-app/rides${qs}`,
    );
  }

  async getActiveRides(): Promise<
    import("./types.js").PassengerRideListResponse
  > {
    return this.request<import("./types.js").PassengerRideListResponse>(
      "/api/passenger-app/rides/active",
    );
  }

  async getRide(
    id: string,
  ): Promise<import("./types.js").PassengerRideResponse> {
    return this.request<import("./types.js").PassengerRideResponse>(
      `/api/passenger-app/rides/${encodeURIComponent(id)}`,
    );
  }

  async cancelRide(
    id: string,
    command: import("./types.js").CancelPassengerRideCommand,
  ): Promise<import("./types.js").CancelPassengerRideResponse> {
    return this.request<import("./types.js").CancelPassengerRideResponse>(
      `/api/passenger-app/rides/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify(command),
      },
    );
  }

  async rateRide(
    id: string,
    command: import("./types.js").RatePassengerRideCommand,
  ): Promise<import("./types.js").RatePassengerRideResponse> {
    return this.request<import("./types.js").RatePassengerRideResponse>(
      `/api/passenger-app/rides/${encodeURIComponent(id)}/ratings`,
      {
        method: "POST",
        body: JSON.stringify(command),
      },
    );
  }

  async getReceipt(
    id: string,
  ): Promise<import("./types.js").PassengerReceiptResponse> {
    return this.request<import("./types.js").PassengerReceiptResponse>(
      `/api/passenger-app/rides/${encodeURIComponent(id)}/receipt`,
    );
  }

  async createComplaint(
    id: string,
    command: import("./types.js").CreatePassengerComplaintCommand,
  ): Promise<import("./types.js").CreatePassengerComplaintResponse> {
    return this.request<import("./types.js").CreatePassengerComplaintResponse>(
      `/api/passenger-app/rides/${encodeURIComponent(id)}/complaints`,
      {
        method: "POST",
        body: JSON.stringify(command),
      },
    );
  }
}
