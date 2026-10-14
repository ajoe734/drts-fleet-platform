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
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  accountSigningFixture,
  simulatedE04,
} from "./payment-postgres-harness";

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Account session production PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      await h.reset();
    }, 30000);
    afterEach(() => vi.unstubAllEnvs());
    afterAll(() => h.close(), 30000);
    const peer = () =>
      new PassengerAccountService(
        new PassengerAccountRepository(h.peerDatabase()),
        new PassengerJwtService(),
      );
    async function rows(owner: string) {
      const [accounts, identities, sessions] = await Promise.all([
        h.pool!.query(
          "SELECT * FROM passenger.accounts WHERE drts_passenger_id=$1",
          [owner],
        ),
        h.pool!.query(
          "SELECT * FROM passenger.logins WHERE drts_passenger_id=$1 ORDER BY identity_id",
          [owner],
        ),
        h.pool!.query(
          "SELECT * FROM passenger.sessions WHERE drts_passenger_id=$1 ORDER BY session_id",
          [owner],
        ),
      ]);
      return {
        account: accounts.rows[0],
        identities: identities.rows,
        sessions: sessions.rows,
      };
    }

    it("same verified identity coalesces through two actual transactions without merging matching email attributes", async () => {
      const other = peer();
      const subject = `qa-${randomUUID()}`;
      const { result, sessions, contention } = await h.concurrentMutations(
        () =>
          Promise.all(
            [h.accounts, other].map((service) =>
              service.findOrCreateByIdentity("google", subject, {
                verifiedEmail: "qa-shared@example.invalid",
              }),
            ),
          ),
        true,
      );
      expect(result[0]!.drtsPassengerId).toBe(result[1]!.drtsPassengerId);
      expect(new Set(sessions).size).toBe(2);
      expect(contention).toHaveLength(1);
      expect((await rows(result[0]!.drtsPassengerId)).identities).toHaveLength(
        1,
      );
      const separate = await other.findOrCreateByIdentity("line", subject, {
        verifiedEmail: "qa-shared@example.invalid",
      });
      expect(separate.drtsPassengerId).not.toBe(result[0]!.drtsPassengerId);
    });

    it("two accounts competing to link one identity have exactly one durable owner", async () => {
      const a = await h.authenticatedAccount();
      const b = await h.authenticatedAccount();
      const other = peer();
      const subject = `qa-link-${randomUUID()}`;
      const { result, sessions, contention } = await h.concurrentMutations(
        () =>
          Promise.allSettled([
            h.accounts.linkIdentity(a.identity, "google", subject),
            other.linkIdentity(b.identity, "google", subject),
          ]),
        true,
      );
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
      const failure = result.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failure.reason).toMatchObject({ code: "conflict" });
      expect(new Set(sessions).size).toBe(2);
      expect(contention).toHaveLength(1);
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.logins WHERE provider='google' AND subject=$1",
            [subject],
          )
        ).rows,
      ).toHaveLength(1);
    });

    it("concurrent last-two unlink operations preserve one identity under the real account lock", async () => {
      const f = await h.authenticatedAccount();
      const other = peer();
      await h.accounts.linkIdentity(f.identity, "google", "qa-second-login");
      const identities = (await rows(f.owner)).identities;
      const { result, sessions } = await h.concurrentMutations(() =>
        Promise.allSettled(
          identities.map((identity, i) =>
            (i ? other : h.accounts).unlinkIdentity(
              f.identity,
              identity.identity_id,
            ),
          ),
        ),
      );
      expect(new Set(sessions).size).toBe(2);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: "last_identity_error" });
      expect((await rows(f.owner)).identities).toHaveLength(1);
    });

    it("refresh preserves absolute expiry and concurrent reuse revokes the entire issued family", async () => {
      const f = await h.authenticatedAccount();
      const other = peer();
      const before = (await rows(f.owner)).sessions[0]!;
      const first = await h.accounts.refresh(f.session.refreshToken);
      const rotated = await rows(f.owner);
      expect(rotated.sessions).toHaveLength(2);
      expect(
        rotated.sessions.every(
          (s) => s.expires_at.getTime() === before.expires_at.getTime(),
        ),
      ).toBe(true);
      expect(
        rotated.sessions.filter((s) => !s.consumed_at && !s.revoked_at),
      ).toHaveLength(1);
      const { result, sessions } = await h.concurrentMutations(() =>
        Promise.allSettled(
          [h.accounts, other].map((service) =>
            service.refresh(first.refreshToken),
          ),
        ),
      );
      expect(new Set(sessions).size).toBe(2);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (result.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: "invalid_grant" });
      expect(
        (await rows(f.owner)).sessions.every(
          (s) => s.revoked_at && s.revocation_reason === "refresh_reuse",
        ),
      ).toBe(true);
      const issued = (
        result.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
          accessToken: string;
        }>
      ).value;
      expect(
        await h.accounts.authenticateAccessToken(issued.accessToken),
      ).toBeNull();
    });

    it("logout of a consumed generation and logoutAll durably revoke current families", async () => {
      const f = await h.authenticatedAccount();
      const second = await h.accounts.issueSession(f.owner);
      const rotated = await h.accounts.refresh(f.session.refreshToken);
      await h.accounts.logout(f.session.refreshToken);
      expect(
        await h.accounts.authenticateAccessToken(rotated.accessToken),
      ).toBeNull();
      const active = await h.accounts.authenticateAccessToken(
        second.accessToken,
      );
      expect(active).not.toBeNull();
      await h.accounts.logoutAll(active);
      expect(
        await h.accounts.authenticateAccessToken(second.accessToken),
      ).toBeNull();
      expect((await rows(f.owner)).sessions.every((s) => s.revoked_at)).toBe(
        true,
      );
    });

    it("expired family rejects refresh and access authentication against actual stored rows", async () => {
      const f = await h.authenticatedAccount();
      await h.pool!.query(
        "UPDATE passenger.sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE drts_passenger_id=$1",
        [f.owner],
      );
      await expect(
        h.accounts.refresh(f.session.refreshToken),
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(
        await h.accounts.authenticateAccessToken(f.session.accessToken),
      ).toBeNull();
    });

    it("removed identity cannot issue a verified-identity session and deleted account cannot issue any session", async () => {
      const f = await h.authenticatedAccount();
      await h.accounts.linkIdentity(
        f.identity,
        "google",
        "qa-surviving-identity",
      );
      const login = (await rows(f.owner)).identities.find(
        (row) => row.provider === "email",
      )!;
      await h.accounts.unlinkIdentity(f.identity, login.identity_id);
      const before = await rows(f.owner);
      await expect(
        h.accounts.issueSession(f.owner, "", {
          provider: "email",
          subject: f.subject,
        }),
      ).rejects.toMatchObject({ code: "unauthorized" });
      expect(await rows(f.owner)).toEqual(before);
      await h.accounts.deleteAccount(f.identity);
      await expect(h.accounts.issueSession(f.owner)).rejects.toMatchObject({
        code: "unauthorized",
      });
    });

    it("session issuance versus account deletion serializes on actual mutation clients and leaves no live family", async () => {
      const f = await h.authenticatedAccount();
      const other = peer();
      const { result, sessions } = await h.concurrentMutations(() =>
        Promise.allSettled([
          other.issueSession(f.owner, "", {
            provider: "email",
            subject: f.subject,
          }),
          h.accounts.deleteAccount(f.identity),
        ]),
      );
      expect(new Set(sessions).size).toBe(2);
      expect(result[1]!.status).toBe("fulfilled");
      expect((await rows(f.owner)).account.status).toBe("deleted");
      expect((await rows(f.owner)).sessions.every((s) => s.revoked_at)).toBe(
        true,
      );
      if (result[0]!.status === "fulfilled")
        expect(
          await h.accounts.authenticateAccessToken(
            result[0]!.value.accessToken,
          ),
        ).toBeNull();
      else expect(result[0]!.reason).toMatchObject({ code: "unauthorized" });
    });

    it("verified issuance versus unlink respects the actual commit order without inventing unlink revocation", async () => {
      const f = await h.authenticatedAccount();
      const other = peer();
      await h.accounts.linkIdentity(f.identity, "google", "qa-survivor");
      const login = (await rows(f.owner)).identities.find(
        (row) => row.provider === "email",
      )!;
      const { result, sessions, statements } = await h.concurrentMutations(() =>
        Promise.allSettled([
          other.issueSession(f.owner, "", {
            provider: "email",
            subject: f.subject,
          }),
          h.accounts.unlinkIdentity(f.identity, login.identity_id),
        ]),
      );
      expect(new Set(sessions).size).toBe(2);
      expect(result[1]!.status).toBe("fulfilled");
      expect(
        (await rows(f.owner)).identities.map((row) => row.provider),
      ).toEqual(["google"]);
      if (result[0]!.status === "fulfilled") {
        const issuingPid = statements.find((row) => row.verb === "INSERT")!.pid;
        expect(statements.filter((row) => row.verb === "COMMIT")[0]!.pid).toBe(
          issuingPid,
        );
        expect(
          await h.accounts.authenticateAccessToken(
            result[0]!.value.accessToken,
          ),
        ).not.toBeNull();
      } else {
        expect(result[0]!.reason).toMatchObject({ code: "unauthorized" });
        expect((await rows(f.owner)).sessions).toHaveLength(1);
      }
    });

    it("real failed identity insertion rolls back the newly-created account", async () => {
      const before = (await h.pool!.query("SELECT * FROM passenger.accounts"))
        .rows;
      await h.pool!.query(
        "ALTER TABLE passenger.logins ADD CONSTRAINT qa_login_failure CHECK(false) NOT VALID",
      );
      await expect(
        h.accounts.findOrCreateByIdentity("google", "qa-failed-signup"),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await h.pool!.query("SELECT * FROM passenger.accounts")).rows,
      ).toEqual(before);
      expect(
        (await h.pool!.query("SELECT * FROM passenger.logins")).rows,
      ).toHaveLength(0);
    });

    it("failed refresh successor insertion rolls back consumption of the original credential", async () => {
      const f = await h.authenticatedAccount();
      const before = await rows(f.owner);
      await h.pool!.query(
        `ALTER TABLE passenger.sessions ADD CONSTRAINT qa_session_failure CHECK(session_id='${before.sessions[0]!.session_id}'::uuid) NOT VALID`,
      );
      await expect(
        h.accounts.refresh(f.session.refreshToken),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await rows(f.owner)).toEqual(before);
      await h.pool!.query(
        "ALTER TABLE passenger.sessions DROP CONSTRAINT qa_session_failure",
      );
      expect(
        (await h.accounts.refresh(f.session.refreshToken)).refreshToken,
      ).not.toBe(f.session.refreshToken);
    });

    it("soft deletion anonymizes PII and sessions while retaining exact quote, trip, billing and receipt records", async () => {
      const f = await h.authenticatedAccount();
      await h.accounts.updateMe(f.identity, {
        displayName: "QA retained user",
        contactPhone: "0900000000",
        contactConsent: true,
      });
      const event = await h.receiptTrip(f.owner);
      const services = await h.receiptServices();
      await services.certificates.writeCompletedTrip({
        ...event,
        e04Snapshot: structuredClone(simulatedE04),
      });
      async function history() {
        return Promise.all(
          [
            "SELECT * FROM passenger.fare_quote_snapshots WHERE drts_passenger_id=$1",
            "SELECT * FROM passenger.booking_histories WHERE drts_passenger_id=$1",
            "SELECT * FROM billing.multi_taxi_passenger_payments WHERE order_id=$1",
            "SELECT * FROM reporting.multi_taxi_electronic_receipts WHERE order_id=$1",
          ].map((sql, i) =>
            h
              .pool!.query(sql, [i < 2 ? f.owner : event.orderId])
              .then((r) => r.rows),
          ),
        );
      }
      const before = await history();
      await h.accounts.deleteAccount(f.identity);
      expect(await history()).toEqual(before);
      const after = await rows(f.owner);
      expect(after.account).toMatchObject({
        status: "deleted",
        display_name: null,
        contact_phone: null,
        verified_email: null,
        contact_consent: false,
      });
      expect(after.identities).toHaveLength(0);
      expect(
        after.sessions.every((row) => row.revoked_at && row.device_ua === null),
      ).toBe(true);
      expect(
        await h.accounts.authenticateAccessToken(f.session.accessToken),
      ).toBeNull();
    });

    it("unpaid deletion refusal rolls back prior revocation and preserves profile, login and finance rows", async () => {
      const f = await h.authenticatedAccount();
      const event = await h.receiptTrip(f.owner, false);
      const before = await rows(f.owner);
      await expect(h.accounts.deleteAccount(f.identity)).rejects.toMatchObject({
        code: "pending_payment_block",
      });
      expect(await rows(f.owner)).toEqual(before);
      expect(
        await h.accounts.authenticateAccessToken(f.session.accessToken),
      ).not.toBeNull();
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM passenger.booking_histories WHERE order_id=$1",
            [event.orderId],
          )
        ).rows,
      ).toHaveLength(1);
      expect(before.sessions[0]!.refresh_token_hash).toBe(
        createHash("sha256").update(f.session.refreshToken).digest("hex"),
      );
    });
  },
);
