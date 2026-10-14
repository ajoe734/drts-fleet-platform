import { describe, expect, it, vi } from "vitest";
import {
  PassengerApiError,
  PassengerBookingClient,
  PassengerClient,
  PassengerNativeAuthClient,
  NativePassengerSession,
  NativePassengerSessionChangedError,
  createNativePassengerFetch,
  rewriteNativePassengerUrl,
  type FetchFn,
  type FetchOptions,
  type FetchResponse,
  type NativePassengerSessionStore,
  type NativePassengerTokenPair,
} from "../../../packages/passenger-client/src/index";

const baseUrl = "https://api.example.invalid";
const pair = {
  accessToken: "fixture-access-a",
  refreshToken: "fixture-refresh-a",
};
const rotated = {
  accessToken: "fixture-access-b",
  refreshToken: "fixture-refresh-b",
};
const account = {
  drts_passenger_id: "fixture-passenger",
  contact_phone_verified: false,
  status: "active",
  created_at: "2026-10-14T00:00:00Z",
};
const otp = {
  target: "demo@example.invalid",
  code: "123456",
  provider: "email" as const,
  challenge: "fixture-challenge",
};

describe("pending raw Native operations across session changes", () => {
  it("renews an expired own access token for authenticated contact OTP using the existing refresh protocol", async () => {
    const f = fixture(async (url, options) => {
      if (url.endsWith("/auth/refresh")) {
        expect(JSON.parse(options?.body ?? "{}")).toEqual({
          refreshToken: pair.refreshToken,
        });
        return response(200, { data: rotated });
      }
      if (options?.headers?.Authorization === `Bearer ${pair.accessToken}`)
        return response(401, { error: { code: "unauthorized" } });
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${rotated.accessToken}`,
      );
      return response(200, {
        data: { success: true, challenge: "renewed-challenge" },
      });
    }, pair);
    await expect(
      f.session.requestOtp({
        provider: "phone",
        target: "+886900000000",
        purpose: "verify_contact_phone",
      }),
    ).resolves.toMatchObject({ challenge: "renewed-challenge" });
    expect((await f.session.snapshot())?.tokens).toEqual(rotated);
    expect(f.calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(
      1,
    );
  });
  it("does not restore a login response that arrives after logout", async () => {
    const gate = deferred<void>();
    const started = deferred<void>();
    const f = fixture(async (url) => {
      if (url.endsWith("/auth/otp/verify")) {
        started.resolve();
        await gate.promise;
        return response(200, { data: { result: "logged_in", ...pair } });
      }
      return response(200, { data: { success: true } });
    });
    const pending = f.session.verifyOtp(otp);
    const rejection = expect(pending).rejects.toBeInstanceOf(
      NativePassengerSessionChangedError,
    );
    await started.promise;
    await f.session.logout();
    gate.resolve();
    await rejection;
    expect(await f.session.snapshot()).toBeNull();
  });
  it("does not deliver a successful previous-account read after adopting a new session", async () => {
    const gate = deferred<void>();
    const started = deferred<void>();
    const f = fixture(async () => {
      started.resolve();
      await gate.promise;
      return response(200, { data: { account } });
    }, pair);
    const pending = f.client.getAccount();
    const rejection = expect(pending).rejects.toBeInstanceOf(
      NativePassengerSessionChangedError,
    );
    await started.promise;
    await f.session.adopt(rotated);
    gate.resolve();
    await rejection;
    expect((await f.session.snapshot())?.tokens).toEqual(rotated);
  });
});
function response(status: number, payload: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  handler: FetchFn,
  initial: NativePassengerTokenPair | null = null,
) {
  let stored = initial ? { ...initial } : null;
  const calls: Array<{ url: string; options: FetchOptions | undefined }> = [];
  const store = {
    read: vi.fn(async () => (stored ? { ...stored } : null)),
    write: vi.fn(async (tokens: NativePassengerTokenPair) => {
      stored = { ...tokens };
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  } satisfies NativePassengerSessionStore;
  const fetchFn: FetchFn = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  const auth = new PassengerNativeAuthClient({ baseUrl, fetchFn });
  const session = new NativePassengerSession(auth, store);
  const nativeFetch = createNativePassengerFetch({ baseUrl, fetchFn, session });
  const client = new PassengerClient({ baseUrl, fetchFn: nativeFetch });
  return {
    auth,
    session,
    client,
    nativeFetch,
    store,
    calls,
    stored: () => stored,
  };
}

describe("Native raw auth and persisted session (external boundaries injected)", () => {
  it("persists the raw snake_case OTP token pair before the first existing-client me call", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const order: string[] = [];
    let stored: NativePassengerTokenPair | null = null;
    const fetchFn: FetchFn = async (url, options) => {
      if (url.endsWith("/auth/otp/verify")) {
        expect(JSON.parse(options?.body ?? "{}")).toEqual(otp);
        expect(options?.headers?.Authorization).toBeUndefined();
        return response(200, {
          data: {
            result: "logged_in",
            access_token: pair.accessToken,
            refresh_token: pair.refreshToken,
          },
          meta: {},
        });
      }
      expect(url).toBe(`${baseUrl}/api/passenger-app/me`);
      order.push("me");
      expect(stored).toEqual(pair);
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${pair.accessToken}`,
      );
      return response(200, { data: { account }, meta: {} });
    };
    const store: NativePassengerSessionStore = {
      read: async () => null,
      write: async (tokens) => {
        order.push("persist-start");
        started.resolve();
        await release.promise;
        stored = tokens;
        order.push("persist-end");
      },
      clear: async () => {
        stored = null;
      },
    };
    const session = new NativePassengerSession(
      new PassengerNativeAuthClient({ baseUrl, fetchFn }),
      store,
    );
    const client = new PassengerClient({
      baseUrl,
      fetchFn: createNativePassengerFetch({ baseUrl, fetchFn, session }),
    });
    const login = session.verifyOtp(otp);
    await started.promise;
    expect(order).toEqual(["persist-start"]);
    release.resolve();
    expect(await login).toEqual({ result: "logged_in", ...pair });
    expect((await client.getAccount()).drtsPassengerId).toBe(
      "fixture-passenger",
    );
    expect(order).toEqual(["persist-start", "persist-end", "me"]);
  });

  it("sends the API OAuth transactionId unchanged and adopts raw tokens before me", async () => {
    const command = {
      provider: "line" as const,
      code: "fixture-code",
      state: "fixture-state",
      transactionId: "4c26d056-d9db-4dd8-819d-ac13ef764a67",
    };
    const f = fixture(async (url, options) => {
      if (url.endsWith("/auth/oauth/line/callback")) {
        expect(JSON.parse(options?.body ?? "{}")).toEqual(command);
        expect(options?.headers?.Authorization).toBeUndefined();
        return response(200, {
          data: {
            result: "logged_in",
            drts_passenger_id: "fixture-passenger",
            access_token: pair.accessToken,
            refresh_token: pair.refreshToken,
          },
        });
      }
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${pair.accessToken}`,
      );
      return response(200, { data: { account } });
    });
    expect((await f.session.oauthCallback(command)).result).toBe("logged_in");
    expect(f.stored()).toEqual(pair);
    await f.client.getAccount();
    expect(f.calls.map((call) => call.url)).toEqual([
      `${baseUrl}/api/passenger-app/auth/oauth/line/callback`,
      `${baseUrl}/api/passenger-app/me`,
    ]);
  });

  it.each(["linked", "verified_contact_phone"] as const)(
    "retains the own token pair for %s OTP responses",
    async (result) => {
      const f = fixture(async (_url, options) => {
        expect(options?.headers?.Authorization).toBe(
          `Bearer ${pair.accessToken}`,
        );
        return response(200, { data: { result } });
      }, pair);
      expect(await f.session.verifyOtp(otp, "authenticated")).toEqual({
        result,
      });
      expect(f.store.write).not.toHaveBeenCalled();
      expect((await f.session.snapshot())?.tokens).toEqual(pair);
    },
  );

  it("restores SecureStore once for concurrent existing-client reads", async () => {
    const f = fixture(async (_url, options) => {
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${pair.accessToken}`,
      );
      return response(200, { data: { account } });
    }, pair);
    await Promise.all([f.client.getAccount(), f.client.getAccount()]);
    expect(f.store.read).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(2);
  });

  it("coalesces concurrent 401 refresh and persists one own rotated pair before retries", async () => {
    const refreshStarted = deferred<void>();
    const releaseRefresh = deferred<void>();
    let refreshCalls = 0;
    const f = fixture(async (url, options) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        expect(JSON.parse(options?.body ?? "{}")).toEqual({
          refreshToken: pair.refreshToken,
        });
        expect(options?.headers?.Authorization).toBeUndefined();
        refreshStarted.resolve();
        await releaseRefresh.promise;
        return response(200, {
          data: {
            access_token: rotated.accessToken,
            refresh_token: rotated.refreshToken,
          },
        });
      }
      if (options?.headers?.Authorization === `Bearer ${pair.accessToken}`) {
        return response(401, { error: { code: "unauthorized" } });
      }
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${rotated.accessToken}`,
      );
      expect(options?.headers?.["Content-Type"]).toBe("application/json");
      expect(f.stored()).toEqual(rotated);
      return response(200, { data: { account } });
    }, pair);
    const reads = Promise.all([f.client.getAccount(), f.client.getAccount()]);
    await refreshStarted.promise;
    releaseRefresh.resolve();
    expect((await reads).map((value) => value.drtsPassengerId)).toEqual([
      "fixture-passenger",
      "fixture-passenger",
    ]);
    expect(refreshCalls).toBe(1);
    expect(f.store.write).toHaveBeenCalledExactlyOnceWith(rotated);
    expect(f.calls).toHaveLength(5);
    expect((await f.session.snapshot())?.tokens).toEqual(rotated);
  });

  it("passes a real 403 to the client without refreshing", async () => {
    const f = fixture(
      async () =>
        response(403, {
          error: { code: "pending_payment_block", message: "Unpaid ride" },
        }),
      pair,
    );
    await expect(f.client.getAccount()).rejects.toMatchObject({
      status: 403,
      code: "pending_payment_block",
    });
    expect(f.calls).toHaveLength(1);
    expect(f.store.write).not.toHaveBeenCalled();
  });

  it("retains the stored pair and reports an actual refresh outage", async () => {
    const f = fixture(
      async (url) =>
        url.endsWith("/auth/refresh")
          ? response(503, {
              error: {
                code: "storage_unavailable",
                message: "Unavailable",
                retryable: true,
              },
            })
          : response(401, { error: { code: "unauthorized" } }),
      pair,
    );
    await expect(f.client.getAccount()).rejects.toMatchObject({
      status: 503,
      code: "storage_unavailable",
      retryable: true,
    });
    expect(f.stored()).toEqual(pair);
    expect(f.store.clear).not.toHaveBeenCalled();
  });

  it("clears the own stored pair when the actual refresh command returns invalid_grant", async () => {
    const f = fixture(
      async () => response(401, { error: { code: "invalid_grant" } }),
      pair,
    );
    await expect(f.session.refresh()).rejects.toMatchObject({
      status: 401,
      code: "invalid_grant",
    });
    expect(f.stored()).toBeNull();
    expect(await f.session.snapshot()).toBeNull();
  });

  it("does not overwrite a newly adopted own pair with an older pending rotation", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const f = fixture(async () => {
      started.resolve();
      await finish.promise;
      return response(200, { data: rotated });
    }, pair);
    const refresh = f.session.refresh();
    const outcome = refresh.then(
      () => null,
      (error: unknown) => error,
    );
    await started.promise;
    const replacement = {
      accessToken: "fixture-new-login",
      refreshToken: "fixture-new-refresh",
    };
    await f.session.adopt(replacement);
    finish.resolve();
    expect(await outcome).toBeInstanceOf(NativePassengerSessionChangedError);
    expect(f.stored()).toEqual(replacement);
  });

  it("does not adopt a raw logged_in pair if the injected persistence operation fails", async () => {
    const f = fixture(async () =>
      response(200, { data: { result: "logged_in", ...pair } }),
    );
    const unavailable = new Error("fixture-storage-outage");
    f.store.write.mockRejectedValueOnce(unavailable);
    await expect(f.session.verifyOtp(otp)).rejects.toBe(unavailable);
    expect(await f.session.snapshot()).toBeNull();
    expect(f.calls).toHaveLength(1);
  });

  it("sends own refreshToken for logout, clears local pair and records confirmed API revocation", async () => {
    const f = fixture(async (url, options) => {
      expect(url).toBe(`${baseUrl}/api/passenger-app/auth/logout`);
      expect(JSON.parse(options?.body ?? "{}")).toEqual({
        refreshToken: pair.refreshToken,
      });
      expect(options?.headers?.Authorization).toBeUndefined();
      return response(200, { data: { success: true } });
    }, pair);
    expect(await f.session.logout()).toEqual({
      localCleared: true,
      remoteRevocation: "confirmed",
    });
    expect(f.stored()).toBeNull();
  });

  it("does not label an API success:false reply as confirmed revocation", async () => {
    const f = fixture(
      async () => response(200, { data: { success: false } }),
      pair,
    );
    const result = await f.session.logout();
    expect(result).toMatchObject({
      localCleared: true,
      remoteRevocation: "unconfirmed",
    });
    expect(result.error).toMatchObject({ code: "logout_unconfirmed" });
    expect(f.stored()).toBeNull();
  });

  it.each(["network", "API"] as const)(
    "classifies %s logout failure as unconfirmed and still clears the own local pair",
    async (kind) => {
      const networkFailure = new Error("fixture-network-unavailable");
      const f = fixture(async () => {
        if (kind === "network") throw networkFailure;
        return response(503, {
          error: { code: "storage_unavailable", message: "Unavailable" },
        });
      }, pair);
      const result = await f.session.logout();
      expect(result.localCleared).toBe(true);
      expect(result.remoteRevocation).toBe("unconfirmed");
      if (kind === "network") expect(result.error).toBe(networkFailure);
      else expect(result.error).toBeInstanceOf(PassengerApiError);
      expect(f.stored()).toBeNull();
      expect(await f.session.snapshot()).toBeNull();
    },
  );
});

describe("Native exact raw API Geo mapping", () => {
  it.each([
    ["GET", "search", "?q=A%20B&surface=passenger_entry&limit=3&locale=zh-TW"],
    ["POST", "resolve", ""],
    ["POST", "reverse", ""],
    ["POST", "route", ""],
  ])(
    "rewrites only %s geo/%s and retains the exact query",
    (method, endpoint, query) => {
      expect(
        rewriteNativePassengerUrl(
          `${baseUrl}/api/passenger-app/geo/${endpoint}${query}`,
          baseUrl,
          method,
        ),
      ).toBe(`${baseUrl}/api/geo/${endpoint}${query}`);
    },
  );
  it.each([
    ["POST", `${baseUrl}/api/passenger-app/geo/search?q=A`],
    ["GET", `${baseUrl}/api/passenger-app/geo/resolve`],
    ["GET", `${baseUrl}/api/passenger-app/geo/search-extra?q=A`],
    [
      "GET",
      "https://elsewhere.example.invalid/api/passenger-app/geo/search?q=A",
    ],
    ["GET", `${baseUrl}/api/passenger-app/rides/fixture-id`],
  ])("leaves the existing non-mapped %s URL unchanged", (method, url) => {
    expect(rewriteNativePassengerUrl(url, baseUrl, method)).toBe(url);
  });
  it("connects the existing BookingClient search directly with the restored own Bearer", async () => {
    const f = fixture(async (url, options) => {
      expect(url).toBe(
        `${baseUrl}/api/geo/search?q=A%20B&surface=passenger_entry&limit=3&locale=zh-TW`,
      );
      expect(options?.headers?.Authorization).toBe(
        `Bearer ${pair.accessToken}`,
      );
      return response(200, { data: { suggestions: [] } });
    }, pair);
    const booking = new PassengerBookingClient({
      baseUrl,
      fetchFn: f.nativeFetch,
    });
    await booking.search({ q: "A B", limit: 3, locale: "zh-TW" });
    expect(f.calls).toHaveLength(1);
  });
  it("keeps the existing Web share-token request out of Native account Bearer transport", async () => {
    const f = fixture(async (_url, options) => {
      expect(options?.headers?.Authorization).toBeUndefined();
      return response(401, { error: { code: "INTERNAL_KEY_REQUIRED" } });
    }, pair);
    const result = await f.nativeFetch(
      `${baseUrl}/api/passenger-rides/fixture-share-token`,
    );
    expect(result.status).toBe(401);
    expect(f.calls).toHaveLength(1);
  });
});
