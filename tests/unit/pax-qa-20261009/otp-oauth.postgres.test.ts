import { createHash, randomUUID } from "node:crypto";
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
import { PassengerOAuthTransactionRepository } from "../../../apps/api/src/modules/passenger-app/oauth/oauth-transaction.repository";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  accountSigningFixture,
} from "./payment-postgres-harness";

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA OTP OAuth production PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    let auth: ReturnType<typeof h.authServices>;
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      await h.reset();
      auth = h.authServices();
    }, 30000);
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    afterAll(() => h.close(), 30000);
    const otpRows = () =>
      h
        .pool!.query("SELECT * FROM passenger.otps ORDER BY created_at")
        .then((r) => r.rows);
    const oauthRows = () =>
      h
        .pool!.query(
          "SELECT * FROM passenger.oauth_transactions ORDER BY created_at",
        )
        .then((r) => r.rows);
    const redirect = (provider: string) =>
      `https://ride.smarttransport.tw/auth/callback/${provider}`;

    it.each(["phone", "email"] as const)(
      "%s OTP request persists hashes/database clock and real verification creates durable login/session",
      async (provider) => {
        const target =
          provider === "phone" ? "0912345678" : "QA-NATIVE@EXAMPLE.INVALID";
        const requested = await auth.otp.request(
          { provider, target, purpose: "login" },
          null,
          "192.0.2.1",
        );
        const code = auth.lastCode();
        const row = (await otpRows())[0]!;
        for (const field of [
          "challenge_hash",
          "target_hash",
          "code_hash",
          "ip_hash",
        ])
          expect(row[field]).toMatch(/^[0-9a-f]{64}$/);
        expect(row.challenge_hash).not.toBe(requested.challenge);
        expect(row.drts_passenger_id).toBeNull();
        expect(row.session_family).toBeNull();
        expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(
          300000,
        );
        expect(row.resend_after.getTime() - row.created_at.getTime()).toBe(
          60000,
        );
        const result = await auth.otp.verify(
          { provider, target, challenge: requested.challenge, code },
          null,
          "QA OTP UA",
        );
        expect(result.result).toBe("logged_in");
        if (result.result !== "logged_in")
          throw new Error("Login proof did not issue a session.");
        const identity = await h.accounts.authenticateAccessToken(
          result.accessToken,
        );
        expect(identity).not.toBeNull();
        const login = (
          await h.pool!.query(
            "SELECT * FROM passenger.logins WHERE drts_passenger_id=$1",
            [identity!.drtsPassengerId],
          )
        ).rows[0];
        expect(login.provider).toBe(provider);
        expect(login.subject).toBe(
          provider === "phone" ? "+886912345678" : "qa-native@example.invalid",
        );
        expect((await otpRows())[0]!.consumed_at).not.toBeNull();
        await expect(
          auth.otp.verify(
            { provider, target, challenge: requested.challenge, code },
            null,
          ),
        ).rejects.toMatchObject({ code: "invalid_code" });
      },
    );

    it("same-target requests use two real advisory-lock transactions and one resend slot", async () => {
      const { result, sessions, contention } = await h.concurrentMutations(
        () =>
          Promise.allSettled(
            [1, 2].map(() =>
              auth.otp.request(
                {
                  provider: "phone",
                  purpose: "login",
                  target: "+886912345678",
                },
                null,
                "192.0.2.1",
              ),
            ),
          ),
        true,
      );
      expect(new Set(sessions).size).toBe(2);
      expect(contention).toHaveLength(1);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: "too_many_requests" });
      expect(await otpRows()).toHaveLength(1);
      expect(auth.sms.sendOtp).toHaveBeenCalledOnce();
    });

    it("durable hourly target and IP counts enforce the existing limits across fresh service instances", async () => {
      const command = {
        provider: "phone" as const,
        purpose: "login" as const,
        target: "+886912345678",
      };
      for (let n = 0; n < 5; n++) {
        await auth.otp.request(command, null, "192.0.2.1");
        await h.pool!.query(
          "UPDATE passenger.otps SET created_at=created_at-interval '61 seconds', expires_at=expires_at-interval '61 seconds', resend_after=resend_after-interval '61 seconds'",
        );
      }
      await expect(
        h.authServices().otp.request(command, null, "192.0.2.1"),
      ).rejects.toMatchObject({ code: "too_many_requests" });
      expect(await otpRows()).toHaveLength(5);
      // The same configured IP limit also applies to distinct targets.
      for (let n = 0; n < 15; n++)
        await auth.otp.request(
          {
            ...command,
            target: `+886${String(900000000 + n).padStart(9, "0")}`,
          },
          null,
          "192.0.2.1",
        );
      await expect(
        auth.otp.request(
          { ...command, target: "+886999999999" },
          null,
          "192.0.2.1",
        ),
      ).rejects.toMatchObject({ code: "too_many_requests" });
      expect(await otpRows()).toHaveLength(20);
    });

    it("two concurrent correct verifies consume exactly one proof and issue one account session", async () => {
      const target = "+886912345678";
      const requested = await auth.otp.request(
        { provider: "phone", purpose: "login", target },
        null,
        "192.0.2.1",
      );
      const command = {
        provider: "phone" as const,
        target,
        code: auth.lastCode(),
        challenge: requested.challenge,
      };
      const { result, sessions } = await h.concurrentMutations(() =>
        Promise.allSettled([1, 2].map(() => auth.otp.verify(command, null))),
      );
      expect(new Set(sessions).size).toBeGreaterThanOrEqual(2);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: "invalid_code" });
      expect((await otpRows())[0]!.consumed_at).not.toBeNull();
      expect(
        (await h.pool!.query("SELECT * FROM passenger.sessions")).rows,
      ).toHaveLength(1);
    });

    it("wrong attempts survive restart and fifth failure invalidates the challenge", async () => {
      const target = "+886912345678";
      const requested = await auth.otp.request(
        { provider: "phone", purpose: "login", target },
        null,
        "192.0.2.1",
      );
      const code = auth.lastCode();
      const wrong = code === "000000" ? "000001" : "000000";
      for (let n = 1; n <= 5; n++) {
        await expect(
          auth.otp.verify(
            {
              provider: "phone",
              target,
              code: wrong,
              challenge: requested.challenge,
            },
            null,
          ),
        ).rejects.toMatchObject({ code: "invalid_code" });
        expect((await otpRows())[0]!.attempts).toBe(n);
      }
      expect((await otpRows())[0]!.invalidated_at).not.toBeNull();
      const restarted = h.authServices();
      await expect(
        restarted.otp.verify(
          { provider: "phone", target, code, challenge: requested.challenge },
          null,
        ),
      ).rejects.toMatchObject({ code: "invalid_code" });
      expect(
        (await h.pool!.query("SELECT * FROM passenger.logins")).rows,
      ).toHaveLength(0);
    });

    it("expired proof and superseded target challenge remain rejected with native persisted invalidation", async () => {
      const target = "+886912345678";
      const requested = await auth.otp.request(
        { provider: "phone", purpose: "login", target },
        null,
        "192.0.2.1",
      );
      const code = auth.lastCode();
      // Age the captured fixture while preserving the exact formal TTL/cooldown checks.
      await h.pool!.query(
        "UPDATE passenger.otps SET created_at=now()-interval '6 minutes', expires_at=now()-interval '1 minute', resend_after=now()-interval '5 minutes'",
      );
      await expect(
        auth.otp.verify(
          { provider: "phone", target, code, challenge: requested.challenge },
          null,
        ),
      ).rejects.toMatchObject({ code: "invalid_code" });
      await auth.otp.request(
        { provider: "phone", purpose: "login", target },
        null,
        "192.0.2.1",
      );
      const records = await otpRows();
      expect(records).toHaveLength(2);
      expect(records[0]!.invalidated_at).not.toBeNull();
    });

    it("session-bound contact proof rejects another family without consuming the proof", async () => {
      const f = await h.authenticatedAccount();
      const other = await h.authenticatedAccount();
      const target = "+886912345678";
      const requested = await auth.otp.request(
        { provider: "phone", purpose: "verify_contact_phone", target },
        f.identity,
        "192.0.2.1",
      );
      const command = {
        provider: "phone" as const,
        target,
        code: auth.lastCode(),
        challenge: requested.challenge,
      };
      await expect(
        auth.otp.verify(command, other.identity),
      ).rejects.toMatchObject({ code: "invalid_code" });
      expect((await otpRows())[0]!.consumed_at).toBeNull();
      await auth.otp.verify(command, f.identity);
      expect((await h.accounts.getMe(f.identity)).account).toMatchObject({
        contactPhone: target,
        contactPhoneVerified: true,
      });

      it("revocation between OTP request and verification prevents downstream binding", async () => {
        const f = await h.authenticatedAccount();
        const target = "+886912345678";
        const requested = await auth.otp.request(
          { provider: "phone", purpose: "link", target },
          f.identity,
          "192.0.2.1",
        );
        const code = auth.lastCode();
        await h.accounts.logout(f.session.refreshToken);
        await expect(
          auth.otp.verify(
            { provider: "phone", target, code, challenge: requested.challenge },
            f.identity,
          ),
        ).rejects.toMatchObject({ code: "unauthorized" });
        expect((await otpRows())[0]!.consumed_at).toBeNull();
        expect(
          (
            await h.pool!.query(
              "SELECT * FROM passenger.logins WHERE provider='phone'",
            )
          ).rows,
        ).toHaveLength(0);
      });
    });

    it("actual OTP insert failure sends nothing and provider delivery failure durably invalidates", async () => {
      await h.pool!.query(
        "ALTER TABLE passenger.otps ADD CONSTRAINT qa_otp_insert_failure CHECK(false) NOT VALID",
      );
      await expect(
        auth.otp.request(
          { provider: "phone", purpose: "login", target: "+886912345678" },
          null,
          "192.0.2.1",
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await otpRows()).toHaveLength(0);
      expect(auth.sms.sendOtp).not.toHaveBeenCalled();
      await h.pool!.query(
        "ALTER TABLE passenger.otps DROP CONSTRAINT qa_otp_insert_failure",
      );
      auth.sms.sendOtp.mockResolvedValueOnce({ status: "failed" } as never);
      await expect(
        auth.otp.request(
          { provider: "phone", purpose: "login", target: "+886912345678" },
          null,
          "192.0.2.1",
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect((await otpRows())[0]!.invalidated_at).not.toBeNull();
    });

    it("downstream session failure preserves already-committed OTP consumption rather than permitting replay", async () => {
      const target = "+886912345678";
      const requested = await auth.otp.request(
        { provider: "phone", purpose: "login", target },
        null,
        "192.0.2.1",
      );
      const command = {
        provider: "phone" as const,
        target,
        code: auth.lastCode(),
        challenge: requested.challenge,
      };
      await h.pool!.query(
        "ALTER TABLE passenger.sessions ADD CONSTRAINT qa_otp_downstream_failure CHECK(false) NOT VALID",
      );
      await expect(auth.otp.verify(command, null)).rejects.toMatchObject({
        code: "23514",
      });
      expect((await otpRows())[0]!.consumed_at).not.toBeNull();
      expect(
        (await h.pool!.query("SELECT * FROM passenger.sessions")).rows,
      ).toHaveLength(0);
      await expect(auth.otp.verify(command, null)).rejects.toMatchObject({
        code: "invalid_code",
      });
    });

    it.each(["google", "line", "facebook"] as const)(
      "%s callback uses actual proof verifier and real transaction/account/session repositories",
      async (provider) => {
        const started = await auth.oauth.start(
          provider,
          { provider, purpose: "login", redirectUri: redirect(provider) },
          null,
        );
        const record = (await oauthRows())[0]!;
        expect(record.state_hash).toBe(
          createHash("sha256").update(started.state).digest("hex"),
        );
        expect(record.code_challenge).toBe(
          new URL(started.authUrl).searchParams.get("code_challenge"),
        );
        const command = await auth.registerGrant(started, provider);
        const result = await auth.oauth.callback(provider, command, null);
        expect(result.result).toBe("logged_in");
        if (result.result !== "logged_in")
          throw new Error("OAuth login did not issue credentials.");
        expect(
          await h.accounts.authenticateAccessToken(result.accessToken!),
        ).not.toBeNull();
        expect((await oauthRows())[0]!.consumed_at).not.toBeNull();
        const login = (await h.pool!.query("SELECT * FROM passenger.logins"))
          .rows[0];
        expect(login.provider).toBe(provider);
        if (provider === "facebook")
          expect(
            (
              await h.pool!.query(
                "SELECT verified_email FROM passenger.accounts",
              )
            ).rows[0].verified_email,
          ).toBeNull();
        await expect(
          auth.oauth.callback(provider, command, null),
        ).rejects.toMatchObject({ code: "invalid_grant" });
      },
    );

    it("native OAuth CAS through two actual pools claims one transaction with two mutation clients", async () => {
      const started = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "login",
          redirectUri: redirect("google"),
        },
        null,
      );
      const database = h.peerDatabase();
      const other = new PassengerOAuthTransactionRepository(database);
      const { result, sessions } = await h.nativeQuerySessions(
        [h.database, database],
        () =>
          Promise.all(
            [auth.oauthRepository, other].map((store) =>
              store.claim(started.transactionId, new Date().toISOString()),
            ),
          ),
      );
      expect(new Set(sessions).size).toBe(2);
      expect(result.filter(Boolean)).toHaveLength(1);
      expect(result.filter((row) => row === null)).toHaveLength(1);
      expect((await oauthRows())[0]!.consumed_at).not.toBeNull();
    });

    it("wrong state and real signed-token nonce mismatch burn their proof with no identity/session write", async () => {
      for (const wrongNonce of [false, true]) {
        const started = await auth.oauth.start(
          "google",
          {
            provider: "google",
            purpose: "login",
            redirectUri: redirect("google"),
          },
          null,
        );
        const command = await auth.registerGrant(started, "google", {
          wrongNonce,
        });

        it("wrong provider and a mismatched persisted PKCE verifier follow burned-proof semantics", async () => {
          const wrongProvider = await auth.oauth.start(
            "google",
            {
              provider: "google",
              purpose: "login",
              redirectUri: redirect("google"),
            },
            null,
          );
          const command = await auth.registerGrant(wrongProvider, "google");
          await expect(
            auth.oauth.callback("line", { ...command, provider: "line" }, null),
          ).rejects.toMatchObject({ code: "invalid_grant" });
          const pkce = await auth.oauth.start(
            "google",
            {
              provider: "google",
              purpose: "login",
              redirectUri: redirect("google"),
            },
            null,
          );
          const pkceCommand = await auth.registerGrant(pkce, "google");
          await h.pool!.query(
            "UPDATE passenger.oauth_transactions SET code_verifier=$2 WHERE transaction_id=$1",
            [pkce.transactionId, "x".repeat(43)],
          );
          await expect(
            auth.oauth.callback("google", pkceCommand, null),
          ).rejects.toMatchObject({ code: "invalid_grant" });
          expect((await oauthRows()).every((row) => row.consumed_at)).toBe(
            true,
          );
          expect(
            (await h.pool!.query("SELECT * FROM passenger.logins")).rows,
          ).toHaveLength(0);
        });
        await expect(
          auth.oauth.callback(
            "google",
            {
              ...command,
              state: wrongNonce ? command.state : "qa-wrong-state",
            },
            null,
          ),
        ).rejects.toMatchObject({ code: "invalid_grant" });
      }
      expect((await oauthRows()).every((row) => row.consumed_at)).toBe(true);
      expect(
        (await h.pool!.query("SELECT * FROM passenger.logins")).rows,
      ).toHaveLength(0);
      expect(
        (await h.pool!.query("SELECT * FROM passenger.sessions")).rows,
      ).toHaveLength(0);
    });

    it("expired and unknown OAuth transactions cannot consume or contact the provider", async () => {
      const started = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "login",
          redirectUri: redirect("google"),
        },
        null,
      );
      await h.pool!.query(
        "UPDATE passenger.oauth_transactions SET created_at=now()-interval '11 minutes', expires_at=now()-interval '1 minute'",
      );
      const command = await auth.registerGrant(started, "google");
      for (const transactionId of [started.transactionId, randomUUID()])
        await expect(
          auth.oauth.callback("google", { ...command, transactionId }, null),
        ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(auth.providerFetch).not.toHaveBeenCalled();
      expect((await oauthRows())[0]!.consumed_at).toBeNull();
    });

    it("concurrent callbacks return one session and preserve the single consumed transaction", async () => {
      const started = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "login",
          redirectUri: redirect("google"),
        },
        null,
      );
      const command = await auth.registerGrant(started, "google");
      const result = await Promise.allSettled(
        [1, 2].map(() => auth.oauth.callback("google", command, null)),
      );
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: "invalid_grant" });
      expect(
        (await h.pool!.query("SELECT * FROM passenger.sessions")).rows,
      ).toHaveLength(1);
    });

    it("link callback stays bound to original account and identity collision rolls back while keeping proof burned", async () => {
      const f = await h.authenticatedAccount();
      const other = await h.authenticatedAccount();
      const started = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "link",
          redirectUri: redirect("google"),
        },
        f.identity,
      );
      const command = await auth.registerGrant(started, "google", {
        subject: "qa-link-bound",
      });
      await expect(
        auth.oauth.callback("google", command, other.identity),
      ).rejects.toMatchObject({ code: "unauthorized" });
      expect((await oauthRows())[0]!.consumed_at).not.toBeNull();
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.logins WHERE provider='google'",
          )
        ).rows,
      ).toHaveLength(0);
      const lawful = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "link",
          redirectUri: redirect("google"),
        },
        f.identity,
      );
      await auth.oauth.callback(
        "google",
        await auth.registerGrant(lawful, "google", {
          subject: "qa-link-bound",
        }),
        f.identity,
      );
      const collision = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "link",
          redirectUri: redirect("google"),
        },
        other.identity,
      );
      await expect(
        auth.oauth.callback(
          "google",
          await auth.registerGrant(collision, "google", {
            subject: "qa-link-bound",
          }),
          other.identity,
        ),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.logins WHERE provider='google'",
          )
        ).rows[0].drts_passenger_id,
      ).toBe(f.owner);
    });

    it("downstream OAuth session insertion failure retains burned proof and cannot issue a replay credential", async () => {
      const started = await auth.oauth.start(
        "google",
        {
          provider: "google",
          purpose: "login",
          redirectUri: redirect("google"),
        },
        null,
      );
      const command = await auth.registerGrant(started, "google");
      await h.pool!.query(
        "ALTER TABLE passenger.sessions ADD CONSTRAINT qa_oauth_downstream_failure CHECK(false) NOT VALID",
      );
      await expect(
        auth.oauth.callback("google", command, null),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await oauthRows())[0]!.consumed_at).not.toBeNull();
      expect(
        (await h.pool!.query("SELECT * FROM passenger.sessions")).rows,
      ).toHaveLength(0);
      await expect(
        auth.oauth.callback("google", command, null),
      ).rejects.toMatchObject({ code: "invalid_grant" });
    });

    it("signed Facebook deletion uses real verification, soft deletion and historical finance retention", async () => {
      const started = await auth.oauth.start(
        "facebook",
        {
          provider: "facebook",
          purpose: "login",
          redirectUri: redirect("facebook"),
        },
        null,
      );
      const result = await auth.oauth.callback(
        "facebook",
        await auth.registerGrant(started, "facebook"),
        null,
      );
      if (result.result !== "logged_in")
        throw new Error("Facebook fixture did not log in.");
      const identity = await h.accounts.authenticateAccessToken(
        result.accessToken!,
      );
      const event = await h.receiptTrip(identity!.drtsPassengerId);
      const before = (
        await h.pool!.query(
          "SELECT * FROM billing.multi_taxi_passenger_payments WHERE order_id=$1",
          [event.orderId],
        )
      ).rows;
      await auth.facebookDeletion.delete(
        auth.signedFacebookDeletion("42420001"),
      );
      expect(
        (
          await h.pool!.query(
            "SELECT status FROM passenger.accounts WHERE drts_passenger_id=$1",
            [identity!.drtsPassengerId],
          )
        ).rows[0].status,
      ).toBe("deleted");
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM billing.multi_taxi_passenger_payments WHERE order_id=$1",
            [event.orderId],
          )
        ).rows,
      ).toEqual(before);
      expect(
        await h.accounts.authenticateAccessToken(result.accessToken!),
      ).toBeNull();
    });
  },
);
