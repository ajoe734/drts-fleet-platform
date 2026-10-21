import type {
  OAuthCallbackCommand,
  OAuthCallbackResponse,
  OAuthStartCommand,
  RequestOtpCommand,
  VerifyOtpCommand,
  VerifyOtpResponse,
} from "@drts/contracts";
import { PassengerApiError } from "../auth/errors.js";
import { PassengerNativeAuthClient } from "./raw-auth.js";

export interface NativePassengerTokenPair {
  accessToken: string;
  refreshToken: string;
}
/** App supplies expo-secure-store; no platform or cookie dependency in this package. */
export interface NativePassengerSessionStore {
  read(): Promise<NativePassengerTokenPair | null>;
  write(tokens: NativePassengerTokenPair): Promise<void>;
  clear(): Promise<void>;
}
export interface NativePassengerSessionSnapshot {
  readonly tokens: NativePassengerTokenPair;
  /** Client operation generation, not a server identity or JWT claim. */
  readonly generation: number;
}
export interface NativePassengerLogoutResult {
  localCleared: boolean;
  remoteRevocation: "confirmed" | "unconfirmed" | "not_requested";
  error?: unknown;
}
export class NativePassengerSessionChangedError extends Error {
  constructor() {
    super("The passenger session changed during this operation.");
    this.name = "NativePassengerSessionChangedError";
  }
}

/** Owns raw token adoption and rotation; browser PassengerClient stays unchanged. */
export class NativePassengerSession {
  private tokens: NativePassengerTokenPair | null = null;
  private generation = 0;
  private hydration: Promise<void> | undefined;
  private storageTail: Promise<void> = Promise.resolve();
  private refreshFlight:
    | { generation: number; promise: Promise<NativePassengerTokenPair> }
    | undefined;

  constructor(
    private readonly auth: PassengerNativeAuthClient,
    private readonly store: NativePassengerSessionStore,
  ) {}

  async hydrate(): Promise<void> {
    this.hydration ??= this.store.read().then((tokens) => {
      this.tokens = tokens ? { ...tokens } : null;
    });
    await this.hydration;
  }
  async snapshot(): Promise<NativePassengerSessionSnapshot | null> {
    await this.hydrate();
    return this.tokens
      ? { tokens: { ...this.tokens }, generation: this.generation }
      : null;
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageTail.then(operation);
    this.storageTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private commit(
    tokens: NativePassengerTokenPair | null,
    generation: number,
  ): Promise<boolean> {
    return this.serialize(async () => {
      if (generation !== this.generation) return false;
      if (tokens) await this.store.write({ ...tokens });
      else await this.store.clear();
      // An adoption/clear queued while storage was pending owns the next generation.
      if (generation !== this.generation) return false;
      this.tokens = tokens ? { ...tokens } : null;
      return true;
    });
  }
  async adopt(
    tokens: NativePassengerTokenPair,
    expectedGeneration?: number,
  ): Promise<void> {
    await this.hydrate();
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== this.generation
    )
      throw new NativePassengerSessionChangedError();
    if (!(await this.commit(tokens, ++this.generation))) {
      throw new NativePassengerSessionChangedError();
    }
  }
  async clear(): Promise<void> {
    await this.hydrate();
    if (!(await this.commit(null, ++this.generation))) {
      throw new NativePassengerSessionChangedError();
    }
  }
  private async authenticated<T>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const current = await this.snapshot();
    if (!current) {
      throw new PassengerApiError(
        401,
        "unauthorized",
        "An active passenger session is required.",
      );
    }
    let result: T;
    try {
      result = await request(current.tokens.accessToken);
    } catch (error) {
      if (!(error instanceof PassengerApiError) || error.status !== 401)
        throw error;
      const tokens = await this.refresh(current);
      result = await request(tokens.accessToken);
    }
    if ((await this.snapshot())?.generation !== current.generation)
      throw new NativePassengerSessionChangedError();
    return result;
  }

  requestOtp(command: RequestOtpCommand) {
    return command.purpose === "login"
      ? this.auth.requestOtp(command)
      : this.authenticated((token) => this.auth.requestOtp(command, token));
  }
  async verifyOtp(
    command: VerifyOtpCommand,
    mode: "login" | "authenticated" = "login",
  ): Promise<VerifyOtpResponse> {
    await this.hydrate();
    const generation = this.generation;
    const result =
      mode === "authenticated"
        ? await this.authenticated((token) =>
            this.auth.verifyOtp(command, token),
          )
        : await this.auth.verifyOtp(command);
    if (result.result === "logged_in") {
      await this.adopt(
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
        generation,
      );
    }
    return result;
  }
  oauthStart(command: OAuthStartCommand) {
    return command.purpose === "login"
      ? this.auth.oauthStart(command)
      : this.authenticated((token) => this.auth.oauthStart(command, token));
  }
  async oauthCallback(
    command: OAuthCallbackCommand,
    purpose: "login" | "link" = "login",
  ): Promise<OAuthCallbackResponse> {
    await this.hydrate();
    const generation = this.generation;
    const result =
      purpose === "link"
        ? await this.authenticated((token) =>
            this.auth.oauthCallback(command, token),
          )
        : await this.auth.oauthCallback(command);
    if (result.result === "logged_in") {
      await this.adopt(
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
        generation,
      );
    }
    return result;
  }

  async refresh(
    requested?: NativePassengerSessionSnapshot,
  ): Promise<NativePassengerTokenPair> {
    const current = await this.snapshot();
    if (!current) {
      throw new PassengerApiError(
        401,
        "unauthorized",
        "No passenger refresh token is available.",
      );
    }
    if (requested && requested.generation !== current.generation) {
      throw new NativePassengerSessionChangedError();
    }
    // Another request already completed rotation for this same local session.
    if (
      requested &&
      requested.tokens.refreshToken !== current.tokens.refreshToken
    ) {
      return { ...current.tokens };
    }
    if (this.refreshFlight?.generation === current.generation) {
      return this.refreshFlight.promise;
    }
    const flight = {
      generation: current.generation,
      promise: Promise.resolve(current.tokens),
    };
    flight.promise = this.performRefresh(current).finally(() => {
      if (this.refreshFlight === flight) this.refreshFlight = undefined;
    });
    this.refreshFlight = flight;
    return flight.promise;
  }
  private async performRefresh(
    current: NativePassengerSessionSnapshot,
  ): Promise<NativePassengerTokenPair> {
    try {
      const tokens = await this.auth.refresh(current.tokens.refreshToken);
      if (!(await this.commit(tokens, current.generation))) {
        throw new NativePassengerSessionChangedError();
      }
      return { ...tokens };
    } catch (error) {
      // Preserve the pair for a network/provider outage; only the API's actual
      // invalid_grant says this stored proof cannot continue the session.
      if (
        error instanceof PassengerApiError &&
        error.code === "invalid_grant"
      ) {
        await this.commit(null, current.generation);
      }
      throw error;
    }
  }

  async logout(): Promise<NativePassengerLogoutResult> {
    const current = await this.snapshot();
    const generation = ++this.generation;
    let remoteRevocation: NativePassengerLogoutResult["remoteRevocation"] =
      "not_requested";
    let failure: unknown;
    let failed = false;
    let localCleared = false;
    try {
      if (current) {
        const result = await this.auth.logout(current.tokens.refreshToken);
        if (!result.success) {
          throw new PassengerApiError(
            502,
            "logout_unconfirmed",
            "The API did not confirm session revocation.",
          );
        }
        remoteRevocation = "confirmed";
      }
    } catch (error) {
      failed = true;
      failure = error;
      remoteRevocation = "unconfirmed";
    } finally {
      localCleared = await this.commit(null, generation);
    }
    return {
      localCleared,
      remoteRevocation,
      ...(failed ? { error: failure } : {}),
    };
  }
}
