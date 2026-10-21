import { randomUUID } from "node:crypto";
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
import { IdempotencyRepository } from "../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency/idempotency.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerComplaintController } from "../../../apps/api/src/modules/passenger-app/complaint/passenger-complaint.controller";
import { PassengerComplaintService } from "../../../apps/api/src/modules/passenger-app/complaint/passenger-complaint.service";
import { PassengerReceiptController } from "../../../apps/api/src/modules/passenger-app/receipt/passenger-receipt.controller";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiController } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  simulatedE04,
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
const opsHeaders = {
  "x-realm": "ops",
  "x-actor-type": "ops_user",
  "x-actor-id": "qa-ops",
  "x-scopes": "complaints:read",
  "x-role-families": "ops",
};

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Receipt CRM mounted HTTP PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    let app: INestApplication | undefined;
    let origin: string;
    let owner: string;
    let token: string;
    let foreignToken: string;
    let refresh: string;
    let event: Awaited<ReturnType<typeof h.receiptTrip>>;
    let services: Awaited<ReturnType<typeof h.receiptServices>>;

    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      vi.stubEnv("APP_ENV", "test");
      vi.stubEnv(
        "JWT_KEY_RING_JSON",
        JSON.stringify([
          {
            kid: "qa-receipt-only",
            status: "active",
            algorithm: "HS256",
            publicKey: "qa-public-synthetic-receipt-key-never-for-deployment",
            privateKey: "qa-public-synthetic-receipt-key-never-for-deployment",
          },
        ]),
      );
      vi.stubEnv("JWT_RETIRED_KIDS", "");
      await h.reset();
      owner = await h.account();
      event = await h.receiptTrip(owner);
      services = await h.receiptServices();
      const session = await h.accounts.issueSession(
        owner,
        "synthetic-receipt-http",
      );
      token = session.accessToken;
      refresh = session.refreshToken;
      foreignToken = (
        await h.accounts.issueSession(
          await h.account(),
          "synthetic-receipt-http",
        )
      ).accessToken;
      // Separate Ops instance is mounted before passenger writes; it must refresh real SQL.
      const peer = await h.receiptServices();
      const constructors = [
        [MultiTaxiController, [MultiTaxiService]],
        [
          PassengerBookingController,
          [PassengerBookingService, MultiTaxiService],
        ],
        [PassengerComplaintController, [PassengerComplaintService]],
        [
          PassengerReceiptController,
          [PassengerBookingService, MultiTaxiService],
        ],
        [
          ComplaintController,
          [ComplaintService, IncidentService, IdempotencyService],
        ],
      ] as const;
      for (const [controller, types] of constructors)
        Reflect.defineMetadata("design:paramtypes", types, controller);
      @Module({
        controllers: [
          MultiTaxiController,
          PassengerBookingController,
          PassengerComplaintController,
          PassengerReceiptController,
          ComplaintController,
        ],
        providers: [
          { provide: PassengerBookingService, useValue: services.booking },
          { provide: MultiTaxiService, useValue: services.multi },
          {
            provide: PassengerComplaintService,
            useValue: services.passengerComplaints,
          },
          { provide: ComplaintService, useValue: peer.complaints },
          {
            provide: IncidentService,
            useValue: new IncidentService(peer.audit),
          },
          {
            provide: IdempotencyService,
            useValue: new IdempotencyService(
              new IdempotencyRepository(h.database),
            ),
          },
        ],
      })
      class ReceiptHttpModule {}
      // Actual controllers and production envelope/auth machinery. Socket hosted only.
      app = await NestFactory.create(ReceiptHttpModule, {
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
        `Receipt CRM QA mounted HTTP ${JSON.stringify({ controllers: constructors.map(([c]) => c.name), transport: "fetch over hosted loopback", utc: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID })}\n`,
      );
    }, 30000);
    afterEach(async () => {
      try {
        await app?.close();
        app = undefined;
      } finally {
        vi.unstubAllEnvs();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);

    async function request(
      method: string,
      path: string,
      bearer?: string,
      body?: unknown,
      extra: Record<string, string> = {},
    ) {
      const response = await fetch(`${origin}/api/${path}`, {
        method,
        headers: {
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const text = bytes.toString();
      return {
        status: response.status,
        headers: response.headers,
        bytes,
        text,
        json: response.headers.get("content-type")?.includes("application/json")
          ? JSON.parse(text)
          : undefined,
      };
    }
    const ridePath = () => `passenger-app/rides/${event.orderId}`;
    const complaintBody = () => ({
      rideId: event.orderId,
      category: "lost_item",
      content: "QA lost bag",
      contactConsent: false,
      lostItemDescription: "QA blue bag",
    });

    it("mounted lost-item create, replay and conflict persist one case visible to peer Ops HTTP", async () => {
      const headers = {
        "idempotency-key": "qa-http-intake",
        "x-request-id": "qa-http-trace",
      };
      const first = await request(
        "POST",
        `${ridePath()}/complaints`,
        token,
        complaintBody(),
        headers,
      );
      expect(first.status).toBe(201);
      expect(first.json.meta.request_id).toBe("qa-http-trace");
      const id = first.json.data.complaint_id;
      expect(
        (
          await request(
            "POST",
            `${ridePath()}/complaints`,
            token,
            complaintBody(),
            headers,
          )
        ).json.data,
      ).toEqual(first.json.data);
      const conflict = await request(
        "POST",
        `${ridePath()}/complaints`,
        token,
        { ...complaintBody(), contactConsent: true },
        headers,
      );
      expect(conflict.status).toBe(409);
      expect(conflict.json.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      const detail = await request(
        "GET",
        `complaints/${id}`,
        undefined,
        undefined,
        opsHeaders,
      );
      expect(detail.status).toBe(200);
      expect(detail.json.data).toMatchObject({
        case_no: id,
        related_order_id: event.orderId,
        category: "lost_and_found",
      });
      expect(detail.json.data.description).toContain("QA blue bag");
      expect(
        (
          await request(
            "GET",
            `complaints/${id}/timeline`,
            undefined,
            undefined,
            opsHeaders,
          )
        ).json.data.items,
      ).toHaveLength(1);
      expect(
        (
          await request("GET", "complaints", undefined, undefined, opsHeaders)
        ).json.data.items.filter(
          (row: { case_no: string }) => row.case_no === id,
        ),
      ).toHaveLength(1);
      const state = await h.receiptState(event.orderId);
      expect(state.intakes[0]!.contact_consent).toBe(false);
      expect(state.cases).toHaveLength(1);
    });

    it("mounted ride token opt-in returns canonical rating and peer Ops sees its single case", async () => {
      const grant = await h.receiptToken(event.orderId);
      const path = `passenger-rides/${grant.raw}/ratings`;
      const body = {
        score: 2,
        contactRequested: true,
        comment: "QA HTTP token contact",
      };
      const response = await request("POST", path, undefined, body);
      expect(response.status).toBe(201);
      expect(response.json.data).toMatchObject({
        order_id: event.orderId,
        passenger_subject_ref: owner,
        score: 2,
      });
      expect((await request("POST", path, undefined, body)).json.data).toEqual(
        response.json.data,
      );
      expect(
        (
          await request("POST", path, undefined, {
            ...body,
            contactRequested: false,
          })
        ).status,
      ).toBe(409);
      const state = await h.receiptState(event.orderId);
      for (const name of [
        "ratings",
        "rideConsents",
        "cases",
        "timelines",
      ] as const)
        expect(state[name]).toHaveLength(1);
      expect(state.consents).toHaveLength(0);
      expect(state.intakes).toHaveLength(0);
      const id = state.rideConsents[0]!.complaint_case_no;
      const ops = await request(
        "GET",
        `complaints/${id}`,
        undefined,
        undefined,
        opsHeaders,
      );
      expect(ops.status).toBe(200);
      expect(ops.json.data).toMatchObject({
        case_no: id,
        related_order_id: event.orderId,
        category: "driver_service",
      });
      expect(
        (
          await request(
            "GET",
            `complaints/${id}/timeline`,
            undefined,
            undefined,
            opsHeaders,
          )
        ).json.data.items,
      ).toHaveLength(1);
      expect(response.text).not.toContain(grant.raw);
    });

    it.each([
      { score: 2, contactRequested: false },
      { score: 5, contactRequested: true },
      { score: 2 },
    ])(
      "mounted token %j retains choice and its score-based case requirement",
      async (body) => {
        const grant = await h.receiptToken(event.orderId);
        expect(
          (
            await request(
              "POST",
              `passenger-rides/${grant.raw}/ratings`,
              undefined,
              body,
            )
          ).status,
        ).toBe(201);
        const state = await h.receiptState(event.orderId);
        expect(state.rideConsents).toHaveLength(1);
        expect(state.rideConsents[0]).toMatchObject({
          contact_requested: body.contactRequested ?? false,
          case_required: body.score <= 2,
          rating_id: state.ratings[0]!.rating_id,
        });
        expect(state.ratings).toHaveLength(1);
        expect(state.consents).toHaveLength(0);
        expect(state.intakes).toHaveLength(0);
        if (body.score > 2) {
          expect(state.rideConsents[0]!.complaint_case_no).toBeNull();
          expect(state.cases).toHaveLength(0);
          expect(state.timelines).toHaveLength(0);
          return;
        }
        expect(state.cases).toHaveLength(1);
        expect(state.timelines).toHaveLength(1);
        const id = state.cases[0]!.case_no;
        expect(state.rideConsents[0]!.complaint_case_no).toBe(id);
        expect(state.timelines[0]).toMatchObject({
          case_no: id,
          action: "case_created",
        });
        const ops = await request(
          "GET",
          `complaints/${id}`,
          undefined,
          undefined,
          opsHeaders,
        );
        expect(ops.status).toBe(200);
        expect(ops.json.data).toMatchObject({
          case_no: id,
          related_order_id: event.orderId,
          category: "driver_service",
        });
        expect(ops.json.data.description).toContain("同意客服聯繫：否");
        expect(ops.json.data.description).toContain("不需客服聯繫");
        const timeline = await request(
          "GET",
          `complaints/${id}/timeline`,
          undefined,
          undefined,
          opsHeaders,
        );
        expect(timeline.status).toBe(200);
        expect(timeline.json.data.items).toHaveLength(1);
        expect(timeline.json.data.items[0]).toMatchObject({
          entry_id: state.timelines[0]!.entry_id,
          case_no: id,
          action: "case_created",
        });
        expect(timeline.json.data.items[0].note).toContain("同意客服聯繫：否");
      },
    );

    it("mounted invalid token, persisted revocation/scope and malformed choice return lawful denials", async () => {
      expect(
        (
          await request(
            "POST",
            "passenger-rides/qa-missing/ratings",
            undefined,
            { score: 2, contactRequested: true },
          )
        ).status,
      ).toBe(404);
      for (const reason of ["revoked", "scope", "choice"] as const) {
        const grant = await h.receiptToken(event.orderId);
        if (reason === "revoked")
          await h.pool!.query(
            "UPDATE ops.passenger_ride_access_tokens SET revoked_at=now() WHERE token_id=$1",
            [grant.record.tokenId],
          );
        if (reason === "scope")
          await h.pool!.query(
            "UPDATE ops.passenger_ride_access_tokens SET scopes='[\"ride:read\"]'::jsonb WHERE token_id=$1",
            [grant.record.tokenId],
          );
        const response = await request(
          "POST",
          `passenger-rides/${grant.raw}/ratings`,
          undefined,
          { score: 2, contactRequested: reason === "choice" ? "yes" : true },
        );
        expect(response.status).toBe(
          reason === "revoked" ? 404 : reason === "scope" ? 403 : 400,
        );
        expect(response.text).not.toContain(grant.raw);
      }
      for (const rows of Object.values(await h.receiptState(event.orderId)))
        expect(rows).toHaveLength(0);
    });

    it("mounted token native consent failure returns error without partial records and recovery creates one case", async () => {
      const grant = await h.receiptToken(event.orderId);
      await h.pool!.query(
        "ALTER TABLE ops.passenger_ride_rating_consents ADD CONSTRAINT qa_token_http_failure CHECK(false) NOT VALID",
      );
      const path = `passenger-rides/${grant.raw}/ratings`;
      const body = { score: 1, contactRequested: true };
      const failed = await request("POST", path, undefined, body);
      expect(failed.status).toBe(500);
      expect(failed.text).not.toContain(grant.raw);
      expect(failed.text).not.toContain("qa_token_http_failure");
      for (const rows of Object.values(await h.receiptState(event.orderId)))
        expect(rows).toHaveLength(0);
      await h.pool!.query(
        "ALTER TABLE ops.passenger_ride_rating_consents DROP CONSTRAINT qa_token_http_failure",
      );
      expect((await request("POST", path, undefined, body)).status).toBe(201);
      expect((await h.receiptState(event.orderId)).cases).toHaveLength(1);
    });

    it("mounted original token receipt downloads use persisted simulated E04 and refuse a revoked grant", async () => {
      const grant = await h.receiptToken(event.orderId);
      const row = await services.certificates.writeCompletedTrip({
        ...event,
        e04Snapshot: structuredClone(simulatedE04),
      });
      const path = `passenger-rides/${grant.raw}/receipt`;
      const metadata = await request("GET", `${path}/downloads`);
      expect(metadata.status).toBe(200);
      expect(metadata.json.data).toMatchObject({
        certificate_id: row.receiptId,
        order_id: event.orderId,
        html_url: `/api/${path}/artifacts/html`,
        pdf_url: `/api/${path}/artifacts/pdf`,
      });
      for (const format of ["html", "pdf"] as const) {
        const response = await request("GET", `${path}/artifacts/${format}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        if (format === "html")
          expect(response.text).toContain(
            "QA simulated operator &lt;escaped&gt;",
          );
        else expect(response.bytes.subarray(0, 8).toString()).toBe("%PDF-1.7");
        expect(response.text).not.toContain(grant.raw);
      }
      await h.pool!.query(
        "UPDATE ops.passenger_ride_access_tokens SET revoked_at=now() WHERE token_id=$1",
        [grant.record.tokenId],
      );
      expect((await request("GET", `${path}/downloads`)).status).toBe(404);
      expect((await request("GET", `${path}/artifacts/html`)).status).toBe(404);
    });

    it("mounted low rating opt-in creates one canonical case and refuses changed retry", async () => {
      const body = {
        rating: 2,
        comments: "QA HTTP low rating",
        contactRequested: true,
      };
      for (let index = 0; index < 2; index++) {
        const response = await request("POST", `${ridePath()}/ratings`, token, {
          rideId: event.orderId,
          ...body,
        });
        expect(response.status).toBe(201);
        expect(response.json.data.success).toBe(true);
      }
      expect(
        (
          await request("POST", `${ridePath()}/ratings`, token, {
            ...body,
            contactRequested: false,
          })
        ).status,
      ).toBe(409);
      const state = await h.receiptState(event.orderId);
      for (const name of [
        "ratings",
        "consents",
        "intakes",
        "cases",
        "timelines",
      ] as const)
        expect(state[name]).toHaveLength(1);
      const ops = await request(
        "GET",
        `complaints/${state.intakes[0]!.case_no}`,
        undefined,
        undefined,
        opsHeaders,
      );
      expect(ops.status).toBe(200);
      expect(ops.json.data.category).toBe("driver_service");
    });

    it.each([
      { rating: 1, contactRequested: false },
      { rating: 5, contactRequested: true },
    ])(
      "mounted rating $rating contact=$contactRequested persists consent and its score-based case requirement",
      async (body) => {
        expect(
          (await request("POST", `${ridePath()}/ratings`, token, body)).status,
        ).toBe(201);
        const state = await h.receiptState(event.orderId);
        expect(state.ratings).toHaveLength(1);
        expect(state.consents[0]!.contact_requested).toBe(
          body.contactRequested,
        );
        expect(state.consents).toHaveLength(1);
        expect(state.consents[0]).toMatchObject({
          case_required: body.rating <= 2,
          rating_id: state.ratings[0]!.rating_id,
        });
        if (body.rating > 2) {
          expect(state.consents[0]!.complaint_case_no).toBeNull();
          expect(state.cases).toHaveLength(0);
          expect(state.timelines).toHaveLength(0);
          expect(state.intakes).toHaveLength(0);
          return;
        }
        expect(state.cases).toHaveLength(1);
        expect(state.timelines).toHaveLength(1);
        expect(state.intakes).toHaveLength(1);
        const id = state.cases[0]!.case_no;
        expect(state.consents[0]!.complaint_case_no).toBe(id);
        expect(state.intakes[0]).toMatchObject({
          case_no: id,
          contact_consent: false,
        });
        expect(state.timelines[0]).toMatchObject({
          case_no: id,
          action: "case_created",
        });
        const ops = await request(
          "GET",
          `complaints/${id}`,
          undefined,
          undefined,
          opsHeaders,
        );
        expect(ops.status).toBe(200);
        expect(ops.json.data).toMatchObject({
          case_no: id,
          related_order_id: event.orderId,
          category: "driver_service",
        });
        expect(ops.json.data.description).toContain("同意客服聯繫：否");
        expect(ops.json.data.description).toContain("不需客服聯繫");
        const timeline = await request(
          "GET",
          `complaints/${id}/timeline`,
          undefined,
          undefined,
          opsHeaders,
        );
        expect(timeline.status).toBe(200);
        expect(timeline.json.data.items).toHaveLength(1);
        expect(timeline.json.data.items[0]).toMatchObject({
          entry_id: state.timelines[0]!.entry_id,
          case_no: id,
          action: "case_created",
        });
        expect(timeline.json.data.items[0].note).toContain("同意客服聯繫：否");
      },
    );

    it("mounted account receipt metadata, HTML and PDF survive snapshot regeneration", async () => {
      const row = await services.certificates.writeCompletedTrip({
        ...event,
        e04Snapshot: structuredClone(simulatedE04),
      });
      const metadata = await request(
        "GET",
        `${ridePath()}/receipt/downloads`,
        token,
      );
      expect(metadata.status).toBe(200);
      expect(metadata.json.data).toMatchObject({
        certificate_id: row.receiptId,
        order_id: event.orderId,
        html_url: `/api/${ridePath()}/receipt/artifacts/html`,
        pdf_url: `/api/${ridePath()}/receipt/artifacts/pdf`,
      });
      for (const format of ["html", "pdf"] as const) {
        const response = await request(
          "GET",
          `${ridePath()}/receipt/artifacts/${format}`,
          token,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("content-disposition")).toContain(
          `.${format}`,
        );
        if (format === "html") {
          expect(response.headers.get("content-type")).toContain("text/html");
          expect(response.text).toContain("歐陽");
          expect(response.text).toContain(
            "QA simulated operator &lt;escaped&gt;",
          );
        } else {
          expect(response.headers.get("content-type")).toBe("application/pdf");
          expect(response.bytes.subarray(0, 8).toString()).toBe("%PDF-1.7");
        }
        expect(response.text).not.toContain(token);
      }
      const regenerated = await new CertificateSupportRepository(
        h.database,
      ).regenerate({
        certificateId: row.receiptId,
        actorId: "qa-ops",
        reason: "QA HTTP regeneration",
        idempotencyKey: "qa-http-regenerate",
        issuedAt: new Date().toISOString(),
      });
      expect(
        (await request("GET", `${ridePath()}/receipt/downloads`, token)).json
          .data.certificate_id,
      ).toBe(regenerated.row.receiptId);
      expect(
        (await request("GET", `${ridePath()}/receipt/artifacts/html`, token))
          .text,
      ).toContain("歐陽");
    });

    it("foreign and missing ride IDs are indistinguishable across receipt and mutation routes", async () => {
      const before = await h.receiptState(event.orderId);
      for (const suffix of [
        "",
        "/receipt/downloads",
        "/receipt/artifacts/html",
        "/receipt/artifacts/pdf",
        "/complaints",
        "/ratings",
      ]) {
        const mutation = suffix === "/complaints" || suffix === "/ratings";
        const missing = randomUUID();
        const first = await request(
          mutation ? "POST" : "GET",
          `${ridePath()}${suffix}`,
          foreignToken,
          suffix === "/complaints"
            ? complaintBody()
            : suffix === "/ratings"
              ? { rideId: event.orderId, rating: 1, contactRequested: true }
              : undefined,
          { "idempotency-key": "qa-foreign" },
        );
        const second = await request(
          mutation ? "POST" : "GET",
          `passenger-app/rides/${missing}${suffix}`,
          foreignToken,
          suffix === "/complaints"
            ? { ...complaintBody(), rideId: missing }
            : suffix === "/ratings"
              ? { rideId: event.orderId, rating: 1, contactRequested: true }
              : undefined,
          { "idempotency-key": "qa-missing" },
        );
        expect(first.status).toBe(404);
        expect(second.status).toBe(404);
        expect(first.json.error.code).toBe(second.json.error.code);
        expect(first.json.error.message).toBe(second.json.error.message);
      }
      expect(await h.receiptState(event.orderId)).toEqual(before);
    });

    it("anonymous, forged, revoked and deleted-account sessions cannot read or mutate", async () => {
      for (const bearer of [undefined, "qa.forged.session"])
        expect(
          (await request("GET", `${ridePath()}/receipt/downloads`, bearer))
            .status,
        ).toBe(401);
      await h.accounts.logout(refresh);
      const revoked = await request(
        "POST",
        `${ridePath()}/complaints`,
        token,
        complaintBody(),
        { "idempotency-key": "qa-revoked" },
      );
      expect(revoked.status).toBe(401);
      expect(revoked.text).not.toContain(token);
      const fresh = (await h.accounts.issueSession(owner, "qa-before-delete"))
        .accessToken;
      await h.accountStore.transaction((tx) =>
        tx.anonymize(owner, new Date().toISOString()),
      );
      expect(
        (await request("GET", `${ridePath()}/receipt/artifacts/html`, fresh))
          .status,
      ).toBe(401);
      expect(
        (
          await request("POST", `${ridePath()}/ratings`, fresh, {
            rating: 1,
            contactRequested: true,
          })
        ).status,
      ).toBe(401);
      expect((await h.receiptState(event.orderId)).cases).toHaveLength(0);
      expect(
        (
          await h.pool!.query(
            "SELECT order_id FROM passenger.booking_histories WHERE order_id=$1",
            [event.orderId],
          )
        ).rows,
      ).toHaveLength(1);
    });

    it("mandatory intake consent, lost-item description and idempotency key are checked over HTTP", async () => {
      for (const body of [
        { ...complaintBody(), contactConsent: undefined },
        { ...complaintBody(), lostItemDescription: undefined },
      ]) {
        expect(
          (
            await request("POST", `${ridePath()}/complaints`, token, body, {
              "idempotency-key": "qa-invalid",
            })
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await request(
            "POST",
            `${ridePath()}/complaints`,
            token,
            complaintBody(),
          )
        ).status,
      ).toBe(400);
      expect((await h.receiptState(event.orderId)).cases).toHaveLength(0);
    });

    it("mounted receipt reports missing receipt and unsupplied issuer/provider E04 facts", async () => {
      const missing = await request(
        "GET",
        `${ridePath()}/receipt/downloads`,
        token,
      );
      expect(missing.status).toBe(404);
      expect(missing.json.error.code).toBe("PASSENGER_RECEIPT_NOT_READY");
      await services.certificates.writeCompletedTrip(event);
      for (const suffix of ["downloads", "artifacts/html", "artifacts/pdf"]) {
        const response = await request(
          "GET",
          `${ridePath()}/receipt/${suffix}`,
          token,
        );
        expect(response.status).toBe(409);
        expect(response.json.error.code).toBe("PASSENGER_E04_NOT_READY");
      }
    });

    it("mounted real constraint failure rolls back rating, consent, case, timeline and summary", async () => {
      const before = await h.receiptState(event.orderId);
      await h.pool!.query(
        "ALTER TABLE passenger.rating_consents ADD CONSTRAINT qa_http_failure CHECK(false) NOT VALID",
      );
      const failure = await request("POST", `${ridePath()}/ratings`, token, {
        rating: 1,
        contactRequested: true,
      });
      expect(failure.status).toBe(500);
      expect(failure.json.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(failure.text).not.toContain("qa_http_failure");
      expect(failure.text).not.toContain(token);
      expect(await h.receiptState(event.orderId)).toEqual(before);
      await h.pool!.query(
        "ALTER TABLE passenger.rating_consents DROP CONSTRAINT qa_http_failure",
      );
      expect(
        (
          await request("POST", `${ridePath()}/ratings`, token, {
            rating: 1,
            contactRequested: true,
          })
        ).status,
      ).toBe(201);
    });
  },
);
