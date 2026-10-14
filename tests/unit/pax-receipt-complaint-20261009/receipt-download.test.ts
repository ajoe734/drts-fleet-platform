import { createHash } from "node:crypto";
import type { StreamableFile } from "../../../apps/api/node_modules/@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import { CertificateSupportService } from "../../../apps/api/src/modules/certificate-support/certificate-support.service";
import { CertificateSupportController } from "../../../apps/api/src/modules/certificate-support/certificate-support.controller";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiController } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PassengerReceiptController } from "../../../apps/api/src/modules/passenger-app/receipt/passenger-receipt.controller";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import type { CertificateE04Snapshot } from "../../../apps/api/src/modules/certificate-support/certificate-support.types";
import type { OwnedMobilityMultiTaxiTripCompletedEvent } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import type { PassthroughResponseLike } from "../../../apps/api/src/common/idempotency-http";
import {
  createProductionBookingFixture,
  NOW,
} from "../pax-booking-history-20261009/production-booking-fixture";

const OWNER = "drts_passenger_11111111-1111-4111-8111-111111111111";
const OTHER = "drts_passenger_22222222-2222-4222-8222-222222222222";
const identity = {
  realm: "passenger",
  actorType: "first_party_passenger",
  drtsPassengerId: OWNER,
} as RequestIdentity;
async function readBytes(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream())
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const capture: CertificateE04Snapshot = {
  fleetOperatorName: "unit-operator <escaped>",
  driverSurname: "測",
  driverRegistrationMasked: "••••1234",
  fareBreakdown: {
    startMinor: 8500,
    distanceMinor: 1000,
    delayMinor: 500,
    nightMinor: 0,
  },
  paymentMethodDisplay: "unit-card",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
  vi.stubEnv("PASSENGER_RIDE_TOKEN_PEPPER", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function fixture(complete = true, fromProducer = false) {
  const booking = createProductionBookingFixture();
  booking.account.drtsPassengerId = OWNER;
  booking.snapshot.drtsPassengerId = OWNER;
  const created = await booking.service.createRide(OWNER, booking.command);
  const orderId = created.ride.order.orderId;
  const tokenValue = "unit-receipt-token";
  const tokenHash = createHash("sha256")
    .update(`\0${tokenValue}`)
    .digest("hex");
  const token = {
    token_id: "11111111-1111-4111-8111-111111111111",
    order_id: orderId,
    passenger_subject_ref: OWNER,
    scopes: ["receipt:read"],
    expires_at: new Date(NOW + 3600000).toISOString(),
    revoked_at: null as string | null,
  };
  const transport = {
    tokenKnown: true,
    row: undefined as Record<string, unknown> | undefined,
    historicalRows: [] as Record<string, unknown>[],
    failLookup: false,
  };
  const queries: { sql: string; values: readonly unknown[] }[] = [];
  const originalQuery = booking.database.query.bind(booking.database);
  vi.spyOn(booking.database, "query").mockImplementation(
    async (sql, values = []) => {
      queries.push({ sql, values });
      if (sql.includes("FROM ops.passenger_ride_access_tokens")) {
        if (transport.failLookup) throw new Error("token storage failure");
        return {
          rows:
            transport.tokenKnown && values[0] === tokenHash
              ? [structuredClone(token)]
              : [],
        } as never;
      }
      if (
        sql.includes("INSERT INTO reporting.multi_taxi_electronic_receipts")
      ) {
        if (sql.includes("supersedes_receipt_id")) {
          transport.row = {
            receipt_id: values[0],
            order_id: values[1],
            receipt_no: values[2],
            receipt_version: values[3],
            is_current: true,
            supersedes_receipt_id: values[4],
            regeneration_idempotency_key: values[5],
            regenerated_by_actor_id: values[6],
            regeneration_reason: values[7],
            regeneration_audit_id: null,
            amount_minor: values[8],
            currency: values[9],
            issued_at: values[10],
            record: JSON.parse(values[11] as string),
          };
          return { rows: [structuredClone(transport.row)] } as never;
        }
        transport.row = {
          receipt_id: values[0],
          order_id: values[1],
          receipt_no: values[2],
          receipt_version: 1,
          is_current: true,
          supersedes_receipt_id: null,
          regeneration_idempotency_key: null,
          regenerated_by_actor_id: null,
          regeneration_reason: null,
          regeneration_audit_id: null,
          amount_minor: values[3],
          currency: values[4],
          issued_at: values[5],
          record: JSON.parse(values[6] as string),
        };
        return { rows: [] } as never;
      }
      if (
        sql.includes("UPDATE reporting.multi_taxi_electronic_receipts") &&
        transport.row
      ) {
        const previous = structuredClone(transport.row);
        previous.is_current = false;
        previous.record = {
          ...(previous.record as Record<string, unknown>),
          certificateState: "superseded",
          supersededByCertificateId: values[1],
        };
        transport.historicalRows.push(previous);
        return { rows: [] } as never;
      }
      if (sql.includes("FROM reporting.multi_taxi_electronic_receipts")) {
        if (sql.includes("WHERE regeneration_idempotency_key")) {
          return {
            rows:
              transport.row?.regeneration_idempotency_key === values[0]
                ? [structuredClone(transport.row)]
                : [],
          } as never;
        }
        // SQL transport fixtures, not a PostgreSQL/versioning simulator.
        // An unqualified order lookup may return the historical row first.
        const rows = [
          ...transport.historicalRows,
          ...(transport.row ? [transport.row] : []),
        ];
        const matching = rows.filter((row) =>
          [row.order_id, row.receipt_id, row.receipt_no].includes(values[0]),
        );
        const selected = sql.includes("is_current = true")
          ? matching.find((row) => row.is_current === true)
          : matching[0];
        return { rows: selected ? [selected] : [] } as never;
      }
      return originalQuery(sql, values);
    },
  );
  // A receipt SQL transport boundary only. Production repository code still
  // performs its BEGIN/read/version-copy/UPDATE/INSERT/COMMIT sequence.
  vi.spyOn(booking.database, "connect").mockImplementation(
    async () =>
      ({
        query: (sql: string, values?: readonly unknown[]) =>
          booking.database.query(sql, values),
        release() {},
      }) as never,
  );
  const certificates = new CertificateSupportService(
    new CertificateSupportRepository(booking.database),
  );
  // External immutable capture is a unit fixture. The actual production emitter
  // cannot yet supply it; e04-source-probe.mjs separately proves that blocker.
  let event: OwnedMobilityMultiTaxiTripCompletedEvent = {
    runtimeProfileCode: "multi_taxi_direct",
    orderId,
    tripId: "unit-trip",
    plateNo: "UNIT-01",
    pickupAt: new Date(NOW - 600000).toISOString(),
    dropoffAt: new Date(NOW).toISOString(),
    travelDurationSeconds: 600,
    routeSummary: "unit-origin → unit-destination",
    distanceMeters: 2000,
    fareMinor: 10000,
    tollMinor: 0,
    currency: "TWD",
    consumerServicePhone: "02-2944-0985",
    authorityComplaintPhone: "unit-authority",
    completedAt: new Date(NOW).toISOString(),
    ...(complete ? { e04Snapshot: structuredClone(capture) } : {}),
  };
  if (fromProducer) {
    // Invoke the real completion projection and fare validator. Only registry
    // lookup and already-captured completion/profile inputs are unit fixtures.
    const producer = Object.create(OwnedMobilityService.prototype) as {
      regulatoryRegistryService: { listVehicles: () => unknown[] };
      buildMultiTaxiCertificateEvent: (
        order: unknown,
        task: unknown,
        command: unknown,
        proof: unknown,
        surname: unknown,
      ) => OwnedMobilityMultiTaxiTripCompletedEvent;
    };
    producer.regulatoryRegistryService = {
      listVehicles: () => [{ vehicleId: "unit-vehicle", plateNo: "UNIT-01" }],
    };
    event = producer.buildMultiTaxiCertificateEvent(
      { ...booking.state.order!, fixedPrice: false },
      {
        taskId: "unit-trip",
        vehicleId: "unit-vehicle",
        startedAt: new Date(NOW - 600000).toISOString(),
      },
      {
        completedAt: new Date(NOW).toISOString(),
        actualDistanceKm: 2,
        actualDurationSec: 600,
        fare: { currency: "TWD", amountMinor: 19037 },
        // Deliberately not the aggregate: no sum/toll convention is asserted.
        actualFareBreakdown: {
          startMinor: 8501,
          distanceMinor: 1303,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
      {
        photos: [],
        expenseItems: [{ type: "toll", amountMinor: 271 }],
        signatureId: null,
      },
      {
        driverSurname: "歐陽",
        driverSurnameSource: "driver_profile_declared",
        driverSurnameProfileUpdatedAt: "2026-10-09T01:02:03.000Z",
      },
    );
    if (complete) {
      // Missing issuer/credential/payment authority is explicitly simulated
      // only in this isolated unit fixture, never by the production producer.
      event.e04Snapshot = {
        ...structuredClone(capture),
        driverSurname: event.driverSurname!,
        fareBreakdown: { ...event.actualFareBreakdown! },
      };
    }
  }
  await certificates.writeCompletedTrip(event);
  const multi = new MultiTaxiService(
    booking.owned,
    new MultiTaxiRepository(booking.database),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    certificates,
  );
  const headers: Record<string, string> = {};
  const response: PassthroughResponseLike = {
    status() {},
    setHeader(name, value) {
      headers[name] = value;
    },
  };
  return {
    booking,
    orderId,
    tokenValue,
    token,
    transport,
    queries,
    certificates,
    multi,
    event,
    headers,
    response,
    account: new PassengerReceiptController(booking.service, multi),
    tokenController: new MultiTaxiController(multi),
    platform: new CertificateSupportController(certificates),
    row: () => transport.row!,
  };
}

describe("captured E04 downstream mapping and authorized downloads (SQL fixtures, not acceptance)", () => {
  it("retains completion snapshots through the real regeneration repository and current read", async () => {
    const f = await fixture(false, true);
    const before = structuredClone(f.row().record);
    const regenerated = await new CertificateSupportRepository(
      f.booking.database,
    ).regenerate({
      certificateId: f.row().receipt_id as string,
      actorId: "unit-platform-actor",
      reason: "unit-regeneration",
      idempotencyKey: "unit-regeneration-key",
      issuedAt: new Date(NOW + 60000).toISOString(),
    });
    for (const field of [
      "actualFareBreakdown",
      "driverSurname",
      "driverSurnameSource",
      "driverSurnameProfileUpdatedAt",
    ]) {
      expect(regenerated.row.record[field]).toEqual(
        (before as Record<string, unknown>)[field],
      );
    }
    expect(regenerated.row.record).not.toHaveProperty("e04Snapshot");
    const current = await f.multi.getTrustedPassengerReceipt(f.orderId, OWNER);
    expect(current.receiptId).toBe(regenerated.row.receiptId);
    expect(current.record.driverSurnameProfileUpdatedAt).toBe(
      "2026-10-09T01:02:03.000Z",
    );
    expect(
      (await f.certificates.get(current.receiptId)).actualFareBreakdown,
    ).toEqual(f.event.actualFareBreakdown);
    await expect(
      f.multi.getPassengerReceiptDownloads(f.tokenValue),
    ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
  });

  it("keeps legacy completion facts absent rather than reconstructing them from full E04", async () => {
    const f = await fixture();
    const view = await f.certificates.get(f.row().receipt_id as string);
    for (const field of [
      "actualFareBreakdown",
      "driverSurname",
      "driverSurnameSource",
      "driverSurnameProfileUpdatedAt",
    ]) {
      expect(f.row().record).not.toHaveProperty(field);
      expect(view).not.toHaveProperty(field);
    }
  });

  it("preserves explicit zero components and exact declaration text without full E04", async () => {
    const f = await fixture(false, true);
    f.event.actualFareBreakdown = {
      startMinor: 0,
      distanceMinor: 0,
      delayMinor: 0,
      nightMinor: 0,
    };
    f.event.driverSurname = " 歐陽 ";
    f.transport.row = undefined;
    const row = await f.certificates.writeCompletedTrip(f.event);
    const view = await f.certificates.get(row.receiptId);
    expect(view.actualFareBreakdown).toEqual(f.event.actualFareBreakdown);
    expect(view.driverSurname).toBe(" 歐陽 ");
    expect(view).not.toHaveProperty("e04Snapshot");
  });

  it("preserves actual producer facts in JSONB and detached views without inventing E04", async () => {
    const f = await fixture(false, true);
    expect(f.event).not.toHaveProperty("e04Snapshot");
    const expected = {
      actualFareBreakdown: { ...f.event.actualFareBreakdown! },
      driverSurname: "歐陽",
      driverSurnameSource: "driver_profile_declared",
      driverSurnameProfileUpdatedAt: "2026-10-09T01:02:03.000Z",
    };
    expect(f.row().record).toMatchObject(expected);
    const view = await f.certificates.get(f.row().receipt_id as string);
    expect(view).toMatchObject(expected);
    expect(view).not.toHaveProperty("e04Snapshot");
    f.event.actualFareBreakdown!.startMinor = 99999;
    const returned = view as unknown as typeof expected;
    returned.actualFareBreakdown.distanceMinor = 99999;
    expect(await f.certificates.get(view.certificateId)).toMatchObject(
      expected,
    );
    expect(
      (await f.multi.getTrustedPassengerReceipt(f.orderId, OWNER)).record,
    ).toMatchObject(expected);
    for (const format of ["html", "pdf"] as const) {
      const artifact = await f.certificates.getArtifact(
        view.certificateId,
        format,
      );
      const bytes = artifact.buffer.toString("utf8");
      const text =
        format === "html"
          ? bytes
          : [...bytes.matchAll(/<([A-F0-9]+)> Tj/g)]
              .map((m) =>
                Buffer.from(m[1]!, "hex").swap16().toString("utf16le"),
              )
              .join("\n");
      expect(text).toContain("駕駛自填姓氏");
      expect(text).toContain("歐陽");
      expect(text).toContain("driver_profile_declared");
      expect(text).toContain(expected.driverSurnameProfileUpdatedAt);
      expect(text).toContain("TWD 85.01");
      expect(text).toContain("TWD 13.03");
      expect(text).toContain("TWD 0.00");
      expect(text).not.toContain("支付方式");
      await expect(
        f.account[format](identity, f.orderId, f.response),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
      await expect(
        f.multi.getPassengerReceiptArtifact(f.tokenValue, format),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
    }
  });

  it.each(["html", "pdf"] as const)(
    "uses captured facts on actual account/token %s with disclosed external E04 fixture",
    async (format) => {
      const f = await fixture(true, true);
      const content = await readBytes(
        await f.account[format](identity, f.orderId, f.response),
      );
      expect(content).toEqual(
        (await f.multi.getPassengerReceiptArtifact(f.tokenValue, format))
          .buffer,
      );
      const bytes = content.toString("utf8");
      const text =
        format === "html"
          ? bytes
          : [...bytes.matchAll(/<([A-F0-9]+)> Tj/g)]
              .map((m) =>
                Buffer.from(m[1]!, "hex").swap16().toString("utf16le"),
              )
              .join("\n");
      expect(text).toContain("driver_profile_declared");
      expect(text).toContain("TWD 85.01");
      expect(text).toContain("TWD 190.37");
      expect(text).toContain("TWD 2.71");
    },
  );

  it.each(["html", "pdf"] as const)(
    "serves own account and token %s bytes through the actual writer/repositories/renderer",
    async (format) => {
      const f = await fixture();
      const account = await f.account[format](identity, f.orderId, f.response);
      const token =
        format === "html"
          ? await f.tokenController.getPassengerReceiptHtml(
              f.tokenValue,
              f.response,
            )
          : await f.tokenController.getPassengerReceiptPdf(
              f.tokenValue,
              f.response,
            );
      const content = await readBytes(account);
      expect(content).toEqual(await readBytes(token));
      expect(account.getHeaders().type).toBe(
        format === "html" ? "text/html; charset=utf-8" : "application/pdf",
      );
      expect(account.getHeaders().disposition).toMatch(
        /^attachment; filename="MTX-/,
      );
      const bytes = content.toString("utf8");
      const text =
        format === "html"
          ? bytes
          : [...bytes.matchAll(/<([A-F0-9]+)> Tj/g)]
              .map((m) =>
                Buffer.from(m[1]!, "hex").swap16().toString("utf16le"),
              )
              .join("\n");
      for (const label of [
        "車隊／派遣業者",
        "車牌",
        "駕駛",
        "上車時間",
        "下車時間",
        "路線",
        "里程",
        "行駛時間",
        "起程",
        "續程",
        "延滯計時",
        "夜間加成",
        "通行費",
        "車資合計",
        "支付方式",
        "客服電話",
        "主管機關申訴電話",
      ])
        expect(text).toContain(label);
      expect(text).toContain("••••1234");
      expect(text).toContain("02-2944-0985");
      expect(text).toContain("TWD 85.00");
      expect(text).toContain("TWD 100.00");
      if (format === "html") {
        expect(text).toContain("unit-operator &lt;escaped&gt;");
        expect(text).not.toContain("unit-operator <escaped>");
      }
      expect(f.headers["Cache-Control"]).toBe("private, no-store");
      expect(f.headers["Referrer-Policy"]).toBe("no-referrer");
      expect(f.headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(
        f.queries.some((q) =>
          q.sql.includes("FROM passenger.booking_histories"),
        ),
      ).toBe(true);
      expect(
        f.queries.some((q) => q.sql.includes("WHERE token_digest = $1")),
      ).toBe(true);
    },
  );

  it("returns only authorized descriptors and preserves the existing receiptUrl field", async () => {
    const f = await fixture();
    const account = (await f.account.downloads(identity, f.orderId, f.response))
      .data;
    const token = (
      await f.tokenController.getPassengerReceiptDownloads(
        f.tokenValue,
        f.response,
      )
    ).data;
    expect(account.receiptUrl).toBe(account.htmlUrl);
    expect(account.pdfUrl).toBe(
      `/api/passenger-app/rides/${f.orderId}/receipt/artifacts/pdf`,
    );
    expect(token.receiptUrl).toBe(token.htmlUrl);
    expect(token.pdfUrl).toBe(
      `/api/passenger-rides/${f.tokenValue}/receipt/artifacts/pdf`,
    );
    expect(
      (await f.multi.getTrustedPassengerReceipt(f.orderId, OWNER)).record
        .htmlUrl,
    ).toBe(account.htmlUrl);
    expect(
      (await f.multi.getPassengerReceipt(f.tokenValue)).record.pdfUrl,
    ).toBe(token.pdfUrl);
    const platform = await f.certificates.get(f.row().receipt_id as string);
    expect(platform.htmlUrl).toContain(
      "/control-plane-proxy/platform-admin/multi-taxi/certificates/",
    );
  });

  it("downloads the current regenerated receipt through account and token paths, preserving platform history", async () => {
    const f = await fixture();
    const historical = structuredClone(f.row());
    historical.is_current = false;
    const currentId = `${historical.receipt_id}-v2`;
    f.transport.historicalRows.push(historical);
    f.transport.row = {
      ...structuredClone(historical),
      receipt_id: currentId,
      receipt_no: `${historical.receipt_no}-v2`,
      receipt_version: 2,
      is_current: true,
      supersedes_receipt_id: historical.receipt_id,
      record: {
        ...(historical.record as Record<string, unknown>),
        certificateVersion: "v2",
        generatedFrom: "certificate_regeneration",
      },
    };
    const before = f.queries.length;
    expect(
      (await f.account.downloads(identity, f.orderId, f.response)).data
        .certificateId,
    ).toBe(currentId);
    expect(
      (await f.multi.getPassengerReceiptDownloads(f.tokenValue)).certificateId,
    ).toBe(currentId);
    for (const format of ["html", "pdf"] as const) {
      const account = await f.account[format](identity, f.orderId, f.response);
      const token = await f.multi.getPassengerReceiptArtifact(
        f.tokenValue,
        format,
      );
      const content = await readBytes(account);
      expect(content).toEqual(token.buffer);
      expect(token.fileName).toBe(`${f.row().receipt_no}.${format}`);
      expect(
        (
          await f.certificates.getArtifact(
            historical.receipt_id as string,
            format,
          )
        ).buffer.length,
      ).toBeGreaterThan(0);
    }
    const lookups = f.queries
      .slice(before)
      .filter(
        (query) =>
          query.sql.includes("FROM reporting.multi_taxi_electronic_receipts") &&
          query.sql.includes("WHERE order_id = $1"),
      );
    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) {
      expect(lookup.sql).toContain("AND is_current = true");
      expect(lookup.sql).toContain("ORDER BY receipt_version DESC");
      expect(lookup.values).toEqual([f.orderId]);
    }
  });

  it.each(["current unavailable", "no current"])(
    "refuses passenger downloads when %s without returning historical success",
    async (scenario) => {
      const f = await fixture();
      const historical = structuredClone(f.row());
      historical.is_current = false;
      f.transport.historicalRows.push(historical);
      f.transport.row = {
        ...structuredClone(historical),
        receipt_id: `${historical.receipt_id}-v2`,
        receipt_no: `${historical.receipt_no}-v2`,
        receipt_version: 2,
        is_current: scenario === "current unavailable",
        supersedes_receipt_id: historical.receipt_id,
        record: {
          ...(historical.record as Record<string, unknown>),
          certificateVersion: "v2",
          certificateState: "unavailable",
        },
      };
      const code =
        scenario === "current unavailable"
          ? "PASSENGER_E04_NOT_READY"
          : "PASSENGER_RECEIPT_NOT_READY";
      await expect(
        f.account.downloads(identity, f.orderId, f.response),
      ).rejects.toMatchObject({ code });
      await expect(
        f.multi.getPassengerReceiptDownloads(f.tokenValue),
      ).rejects.toMatchObject({ code });
      for (const format of ["html", "pdf"] as const) {
        await expect(
          f.account[format](identity, f.orderId, f.response),
        ).rejects.toMatchObject({ code });
        await expect(
          f.multi.getPassengerReceiptArtifact(f.tokenValue, format),
        ).rejects.toMatchObject({ code });
      }
      expect(
        (
          await f.certificates.getArtifact(
            historical.receipt_id as string,
            "html",
          )
        ).buffer.length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(["foreign", "unknown", "malformed"])(
    "rejects %s account ownership before rendering",
    async (scenario) => {
      const f = await fixture();
      const id =
        scenario === "foreign"
          ? f.orderId
          : scenario === "unknown"
            ? "33333333-3333-4333-8333-333333333333"
            : "bad";
      const actor =
        scenario === "foreign"
          ? ({ ...identity, drtsPassengerId: OTHER } as RequestIdentity)
          : identity;
      for (const format of ["html", "pdf"] as const)
        await expect(
          f.account[format](actor, id, f.response),
        ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
      await expect(
        f.multi.getTrustedPassengerReceiptArtifact(f.orderId, OTHER, "html"),
      ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
    },
  );

  it.each([
    "revoked",
    "expired",
    "invalid_expiry",
    "wrong_scope",
    "wrong_subject",
    "unknown",
  ])(
    "denies %s tokens even after a prior successful receipt download",
    async (scenario) => {
      const f = await fixture();
      await f.multi.getPassengerReceiptArtifact(f.tokenValue, "html");
      if (scenario === "revoked")
        f.token.revoked_at = new Date(NOW).toISOString();
      if (scenario === "expired")
        f.token.expires_at = new Date(NOW).toISOString();
      if (scenario === "invalid_expiry") f.token.expires_at = "invalid";
      if (scenario === "wrong_scope") f.token.scopes = ["ride:read"];
      if (scenario === "wrong_subject") f.token.passenger_subject_ref = OTHER;
      if (scenario === "unknown") f.transport.tokenKnown = false;
      for (const format of ["html", "pdf"] as const)
        await expect(
          f.multi.getPassengerReceiptArtifact(f.tokenValue, format),
        ).rejects.toBeInstanceOf(Error);
    },
  );

  it("fails closed on a live token storage outage", async () => {
    const f = await fixture();
    await f.multi.getPassengerReceiptArtifact(f.tokenValue, "html");
    f.transport.failLookup = true;
    await expect(
      f.multi.getPassengerReceiptArtifact(f.tokenValue, "pdf"),
    ).rejects.toThrow("token storage failure");
  });

  it("refuses a mismatched certificate row even with a valid owner/token", async () => {
    const f = await fixture();
    f.row().order_id = "33333333-3333-4333-8333-333333333333";
    // A poisoned SQL metadata link cannot bypass the canonical certificate order check.
    await expect(
      f.certificates.getPassengerArtifact(
        f.row().receipt_id as string,
        f.orderId,
        "html",
      ),
    ).rejects.toMatchObject({ code: "CERTIFICATE_NOT_FOUND" });
  });

  it("legacy complete platform artifacts remain downloadable while passenger E04 is unavailable", async () => {
    const f = await fixture(false);
    expect(
      (
        await readBytes(
          await f.platform.getHtmlArtifact(f.row().receipt_id as string),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await readBytes(
          await f.platform.getPdfArtifact(f.row().receipt_id as string),
        )
      ).toString("ascii", 0, 5),
    ).toBe("%PDF-");
    for (const format of ["html", "pdf"] as const) {
      await expect(
        f.account[format](identity, f.orderId, f.response),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
      await expect(
        f.multi.getPassengerReceiptArtifact(f.tokenValue, format),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
    }
  });

  it.each(["startMinor", "distanceMinor", "delayMinor", "nightMinor"] as const)(
    "rejects missing captured fare %s without inventing zero",
    async (field) => {
      const f = await fixture();
      const record = f.row().record as { e04Snapshot: CertificateE04Snapshot };
      delete (
        record.e04Snapshot.fareBreakdown as Partial<
          CertificateE04Snapshot["fareBreakdown"]
        >
      )[field];
      await expect(
        f.multi.getPassengerReceiptArtifact(f.tokenValue, "html"),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
    },
  );

  it("rejects an unmasked driver registration before persisting a captured completion", async () => {
    const f = await fixture();
    const calls = f.queries.length;
    await expect(
      f.certificates.writeCompletedTrip({
        ...f.event,
        e04Snapshot: { ...capture, driverRegistrationMasked: "12345678" },
      }),
    ).rejects.toMatchObject({ code: "CERTIFICATE_E04_SNAPSHOT_INVALID" });
    expect(f.queries.length).toBe(calls);
  });
});
