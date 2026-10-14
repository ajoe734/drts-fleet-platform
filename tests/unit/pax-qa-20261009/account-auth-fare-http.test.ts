import { createRequire } from "node:module";
import type { INestApplication } from "../../../apps/api/node_modules/@nestjs/common";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerFareController } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.controller";
import { PassengerFareService } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.service";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import {
  PassengerOtpService,
  OTP_OPTIONS,
} from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { PassengerOAuthController } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.controller";
import { PassengerOAuthService } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  accountSigningFixture,
} from "./payment-postgres-harness";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Module } = requireApi(
  "@nestjs/common",
) as typeof import("../../../apps/api/node_modules/@nestjs/common");
const { NestFactory, Reflector } = requireApi(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Account auth fare mounted HTTP PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    let app: INestApplication | undefined;
    let origin: string;
    let f: Awaited<ReturnType<typeof h.authenticatedAccount>>;
    let auth: ReturnType<typeof h.authServices>;
    let fare: Awaited<ReturnType<typeof h.fareServices>>;
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      // Existing non-strict test environment; no Cloud Run/IAP/workforce credit.
      vi.stubEnv("DRTS_INTERNAL_KEY", "");
      await h.reset();
      f = await h.authenticatedAccount();
      auth = h.authServices();
      fare = await h.fareServices();
      const controllers = [
        [PassengerAccountController, [PassengerAccountService]],
        [PassengerFareController, [PassengerFareService]],
        [PassengerOtpController, [PassengerOtpService, Object]],
        [
          PassengerOAuthController,
          [PassengerOAuthService, PassengerOtpService],
        ],
      ] as const;
      for (const [controller, types] of controllers)
        Reflect.defineMetadata("design:paramtypes", types, controller);
      @Module({
        controllers: [
          PassengerAccountController,
          PassengerFareController,
          PassengerOtpController,
          PassengerOAuthController,
        ],
        providers: [
          { provide: PassengerAccountService, useValue: h.accounts },
          { provide: PassengerFareService, useValue: fare.fares },
          { provide: PassengerOtpService, useValue: auth.otp },
          { provide: OTP_OPTIONS, useValue: auth.otpOptions },
          { provide: PassengerOAuthService, useValue: auth.oauth },
        ],
      })
      class AccountAuthFareModule {}
      app = await NestFactory.create(AccountAuthFareModule, {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api");
      app.useGlobalGuards(
        new BootstrapAuthGuard(
          new Reflector(),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          h.accounts,
        ),
      );
      app.useGlobalInterceptors(new SnakeCaseInterceptor());
      app.useGlobalFilters(new SnakeCaseExceptionFilter());
      await app.listen(0, "127.0.0.1");
      origin = await app.getUrl();
      process.stdout.write(
        `PAX QA account auth fare HTTP ${JSON.stringify({ controllers: controllers.map(([c]) => c.name), transport: "actual fetch hosted loopback", runId: process.env.GITHUB_RUN_ID, utc: new Date().toISOString() })}\n`,
      );
    }, 30000);
    afterEach(async () => {
      try {
        await app?.close();
        app = undefined;
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);
    async function request(
      method: string,
      path: string,
      token?: string,
      body?: unknown,
    ) {
      const response = await fetch(`${origin}/api/passenger-app/${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      return { status: response.status, text, json: JSON.parse(text) };
    }
    function quoteCommand() {
      return {
        origin_lat: 25.08,
        origin_lng: 121.55,
        destination_lat: 25.1,
        destination_lng: 121.57,
        scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      };
    }
    function started(data: Record<string, string>) {
      return {
        authUrl: data.auth_url!,
        transactionId: data.transaction_id!,
        expiresAt: data.expires_at!,
        state: data.state!,
      };
    }

    it("profile wire aliases persist through production service and identity subjects stay masked", async () => {
      const before = await request("GET", "me", f.session.accessToken);
      expect(before.status).toBe(200);
      expect(before.json.data.account.drts_passenger_id).toBe(f.owner);
      const updated = await request("PATCH", "me", f.session.accessToken, {
        display_name: "QA HTTP profile",
        contact_phone: "0900000000",
        contact_consent: true,
        fee_acknowledgement_version: "qa-http-v1",
      });
      expect(updated.status).toBe(200);
      expect(updated.json.data.account).toMatchObject({
        display_name: "QA HTTP profile",
        contact_phone: "0900000000",
        contact_phone_verified: false,
      });
      const actual = (
        await h.pool!.query(
          "SELECT * FROM passenger.accounts WHERE drts_passenger_id=$1",
          [f.owner],
        )
      ).rows[0];
      expect(actual).toMatchObject({
        display_name: "QA HTTP profile",
        contact_consent: true,
        fee_acknowledgement_version: "qa-http-v1",
      });
      const listed = await request(
        "GET",
        "me/identities",
        f.session.accessToken,
      );
      expect(listed.status).toBe(200);
      expect(listed.json.data.identities[0].subject).toBe("[linked]");
      expect(listed.text).not.toContain(f.subject);
      expect(listed.json.meta.request_id).toEqual(expect.any(String));
    });

    it("ambiguous profile aliases and privilege-bearing fields are rejected without mutation", async () => {
      const before = (
        await h.pool!.query(
          "SELECT * FROM passenger.accounts WHERE drts_passenger_id=$1",
          [f.owner],
        )
      ).rows;
      for (const body of [
        { displayName: "one", display_name: "two" },
        { status: "deleted" },
        { contact_phone_verified: true },
        { drts_passenger_id: "qa-forged-owner" },
      ]) {
        const result = await request(
          "PATCH",
          "me",
          f.session.accessToken,
          body,
        );
        expect(result.status).toBe(400);
        expect(result.json.error.code).toBe("validation_error");
      }
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.accounts WHERE drts_passenger_id=$1",
            [f.owner],
          )
        ).rows,
      ).toEqual(before);
    });

    it("mounted refresh rotates durable credentials and replay revokes the live family", async () => {
      const rotated = await request("POST", "auth/refresh", undefined, {
        refresh_token: f.session.refreshToken,
      });
      expect(rotated.status).toBe(201);
      expect(rotated.json.data.refresh_token).not.toBe(f.session.refreshToken);
      expect(
        (await request("GET", "me", rotated.json.data.access_token)).status,
      ).toBe(200);
      const replay = await request("POST", "auth/refresh", undefined, {
        refreshToken: f.session.refreshToken,
      });
      expect(replay.status).toBe(401);
      expect(replay.json.error.code).toBe("invalid_grant");
      expect(
        (await request("GET", "me", rotated.json.data.access_token)).status,
      ).toBe(401);
      const rows = (
        await h.pool!.query(
          "SELECT * FROM passenger.sessions WHERE drts_passenger_id=$1",
          [f.owner],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(
        rows.every(
          (row) => row.revoked_at && row.revocation_reason === "refresh_reuse",
        ),
      ).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(
        rotated.json.data.refresh_token,
      );
    });

    it("mounted unlink protects last identity, logout revokes, and account DELETE soft-deletes", async () => {
      const identities = await request(
        "GET",
        "me/identities",
        f.session.accessToken,
      );
      expect(
        (
          await request(
            "DELETE",
            `me/identities/${identities.json.data.identities[0].identity_id}`,
            f.session.accessToken,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request("POST", "auth/logout", undefined, {
            refresh_token: f.session.refreshToken,
          })
        ).status,
      ).toBe(201);
      expect((await request("GET", "me", f.session.accessToken)).status).toBe(
        401,
      );
      const next = await h.accounts.issueSession(f.owner);
      expect((await request("DELETE", "me", next.accessToken)).status).toBe(
        200,
      );
      expect((await request("GET", "me", next.accessToken)).status).toBe(401);
      expect(
        (
          await h.pool!.query(
            "SELECT status,deleted_at FROM passenger.accounts WHERE drts_passenger_id=$1",
            [f.owner],
          )
        ).rows[0].status,
      ).toBe("deleted");
    });

    it.each(["phone", "email"] as const)(
      "mounted %s OTP aliases produce a real DB session and readable profile",
      async (provider) => {
        const target =
          provider === "phone"
            ? "+886912345678"
            : "qa-http-otp@example.invalid";
        const requested = await request("POST", "auth/otp/request", undefined, {
          channel: provider,
          purpose: "login",
          target,
        });
        expect(requested.status).toBe(201);
        const verified = await request("POST", "auth/otp/verify", undefined, {
          channel: provider,
          target,
          code: auth.lastCode(),
          challenge: requested.json.data.challenge,
        });
        expect(verified.status).toBe(201);
        expect(verified.json.data.result).toBe("logged_in");
        expect(
          (await request("GET", "me", verified.json.data.access_token)).status,
        ).toBe(200);
        expect(
          (await h.pool!.query("SELECT consumed_at FROM passenger.otps"))
            .rows[0].consumed_at,
        ).not.toBeNull();
        expect(
          (
            await request("POST", "auth/otp/verify", undefined, {
              provider,
              target,
              code: auth.lastCode(),
              challenge: requested.json.data.challenge,
            })
          ).status,
        ).toBe(400);
      },
    );

    it.each(["google", "line", "facebook"] as const)(
      "mounted %s OAuth callback uses actual signature/proof verification and durable account records",
      async (provider) => {
        const start = await request(
          "POST",
          `auth/oauth/${provider}/start`,
          undefined,
          {
            provider,
            purpose: "login",
            redirectUri: `https://ride.smarttransport.tw/auth/callback/${provider}`,
          },
        );
        expect(start.status).toBe(201);
        const record = (
          await h.pool!.query(
            "SELECT * FROM passenger.oauth_transactions WHERE transaction_id=$1",
            [start.json.data.transaction_id],
          )
        ).rows[0];
        expect(start.text).not.toContain(record.code_verifier);
        const body = await auth.registerGrant(
          started(start.json.data),
          provider,
        );
        const callback = await request(
          "POST",
          `auth/oauth/${provider}/callback`,
          undefined,
          body,
        );
        expect(callback.status).toBe(201);
        expect(callback.json.data.result).toBe("logged_in");
        expect(
          (await request("GET", "me", callback.json.data.access_token)).status,
        ).toBe(200);
        expect(
          (
            await request(
              "POST",
              `auth/oauth/${provider}/callback`,
              undefined,
              body,
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await h.pool!.query(
              "SELECT consumed_at FROM passenger.oauth_transactions WHERE transaction_id=$1",
              [record.transaction_id],
            )
          ).rows[0].consumed_at,
        ).not.toBeNull();
      },
    );

    it("mounted OAuth linking is bound to its original live account and rejects another actor", async () => {
      const foreign = await h.authenticatedAccount();
      const start = await request(
        "POST",
        "auth/oauth/google/start",
        f.session.accessToken,
        {
          provider: "google",
          purpose: "link",
          redirectUri: "https://ride.smarttransport.tw/auth/callback/google",
        },
      );
      expect(start.status).toBe(201);
      const body = await auth.registerGrant(started(start.json.data), "google");
      const denied = await request(
        "POST",
        "auth/oauth/google/callback",
        foreign.session.accessToken,
        body,
      );
      expect(denied.status).toBe(401);
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.logins WHERE provider='google'",
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("public fares and canonical quote aliases use live storage and persisted service-area evaluation", async () => {
      const listed = await request("GET", "fares");
      expect(listed.status).toBe(200);
      expect(listed.json.data.current_version).toMatchObject({
        base_fare: 85,
        night_surcharge: 20,
        night_surcharge_unit: "TWD_per_trip",
      });
      const quote = await request(
        "POST",
        "quotes",
        f.session.accessToken,
        quoteCommand(),
      );
      expect(quote.status).toBe(201);
      expect(quote.json.data.service_area_result).toBe("serviceable");
      expect(quote.json.data.is_guaranteed).toBe(false);
      const row = (
        await h.pool!.query(
          "SELECT * FROM passenger.fare_quote_snapshots WHERE fare_snapshot_id=$1",
          [quote.json.data.fare_snapshot_id],
        )
      ).rows[0];
      expect(row.drts_passenger_id).toBe(f.owner);
      expect(row.service_area_evaluation.stops).toHaveLength(2);
      expect(fare.geo.route).toHaveBeenCalledWith(
        expect.objectContaining({ requestedByActorId: f.owner }),
      );
    });

    it("anonymous quote, ambiguous aliases, invalid input and uncovered stops preserve zero quote writes", async () => {
      expect(
        (await request("POST", "quotes", undefined, quoteCommand())).status,
      ).toBe(401);
      for (const body of [
        { ...quoteCommand(), originLat: 25.08 },
        { ...quoteCommand(), origin_lat: 91 },
        { ...quoteCommand(), drts_passenger_id: "qa-forged" },
      ])
        expect(
          (await request("POST", "quotes", f.session.accessToken, body)).status,
        ).toBe(400);
      const outside = await request("POST", "quotes", f.session.accessToken, {
        ...quoteCommand(),
        origin_lat: 0,
        origin_lng: 0,
      });
      expect(outside.status).toBe(201);
      expect(outside.json.data.service_area_result).toBe("not_serviceable");
      expect(
        (await h.pool!.query("SELECT * FROM passenger.fare_quote_snapshots"))
          .rows,
      ).toHaveLength(0);
    });

    it("actual quote persistence constraint failure returns a sanitized HTTP availability envelope", async () => {
      await h.pool!.query(
        "ALTER TABLE passenger.fare_quote_snapshots ADD CONSTRAINT qa_http_quote_failure CHECK(false) NOT VALID",
      );
      const response = await request(
        "POST",
        "quotes",
        f.session.accessToken,
        quoteCommand(),
      );
      expect(response.status).toBe(503);
      expect(response.json.error.code).toBe("unavailable");
      expect(response.text).not.toContain("qa_http_quote_failure");
      expect(response.text).not.toContain(f.session.accessToken);
      expect(
        (await h.pool!.query("SELECT * FROM passenger.fare_quote_snapshots"))
          .rows,
      ).toHaveLength(0);
    });
  },
);
