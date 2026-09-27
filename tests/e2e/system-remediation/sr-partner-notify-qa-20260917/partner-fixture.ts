import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect } from "@playwright/test";
import type {
  CreatePartnerChannelEntryCommand,
  PartnerChannelEntryRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressHandoffSession,
  PartnerEntryNotificationBinding,
  TenantWebhookEndpoint,
  MultiTaxiOperatingAuthorizationRecord,
} from "@drts/contracts";
import { decodeTenantWire } from "../sr-qa-tenant-001/http-boundary";
import { ControlledReceiver, type ReceiverScope } from "./controlled-receiver";
import type { ServiceProductRecord } from "../../../../apps/api/src/modules/service-product/service-product.types";

const run = promisify(execFile);
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing hosted fixture ${name}`);
  return value;
}
interface Database {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, any>[] }>;
  end(): Promise<void>;
}
export interface PartnerFixtureEntry {
  entry: PartnerChannelEntryRecord;
  partnerUserRef: string;
  apiKey: string;
  token: string;
  webhookId: string;
  binding: PartnerEntryNotificationBinding;
}

/** Uses the existing hosted full AppModule, real bearer/step-up authority and migrations. */
export class PartnerFixture {
  readonly entries: PartnerFixtureEntry[] = [];
  readonly requests: {
    event: string;
    rawBody: string;
    hash: string;
    status: number;
    responseBody: string;
    secretVersion: number;
  }[] = [];
  readonly db: Database;
  receiver!: ControlledReceiver;
  private server?: Server;
  private directory?: string;
  private scopes: ReceiverScope[] = [];
  private url = "";
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  // Faults only apply to real passenger events, never governance setup.
  fault:
    | "none"
    | "timeout"
    | "invalid_ack"
    | "html_ack"
    | "wrong_notification"
    | "wrong_delivery"
    | "wrong_entry"
    | "missing_receipt" = "none";

  constructor() {
    if (
      process.env.GITHUB_ACTIONS !== "true" ||
      required("DRTS_UAT_ENV") !== "sandbox"
    )
      throw new Error(
        "Partner runtime acceptance must run in the authorized hosted workflow",
      );
    const apiRequire = createRequire(path.resolve("apps/api/package.json"));
    const { Pool } = apiRequire("pg") as {
      Pool: new (args: { connectionString: string }) => Database;
    };
    this.db = new Pool({ connectionString: required("DATABASE_URL") });
  }

  async call<T>(
    apiPath: string,
    token: string | null,
    method = "GET",
    data?: unknown,
    tenant?: string,
  ): Promise<T> {
    const origin = required("DRTS_UAT_API_URL");
    const headers: Record<string, string> = {
      "x-request-id": `partner-qa-${randomUUID()}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { "x-tenant-id": tenant } : {}),
      ...(method === "POST" && apiPath === "tenant/webhooks/test"
        ? { "idempotency-key": randomUUID() }
        : {}),
    };
    // The authoritative policy also gates tenant webhook creation/test/update.
    // Let it decide whether this exact action/session requires a proof.
    if (method !== "GET" && token) {
      const proof = await fetch(`${origin}/api/identity/step-up-proofs`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ method, path: `/api/${apiPath}` }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      expect(proof.status, `step-up ${apiPath}`).toBe(201);
      const envelope = decodeTenantWire(await proof.json());
      expect(typeof envelope.data.required).toBe("boolean");
      if (envelope.data.required) {
        expect(typeof envelope.data.stepUpReference).toBe("string");
        headers["x-drts-step-up-reference"] = envelope.data.stepUpReference;
      }
    }
    // Node fetch keeps credential issuance/exchange out of Playwright traces.
    // Browser requests retain their real trace; no auth/response interception.
    const response = await fetch(`${origin}/api/${apiPath}`, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.headers.get("x-drts-candidate-sha")).toBe(
      required("CANDIDATE_SHA"),
    );
    const envelope = decodeTenantWire(await response.json());
    expect(
      response.status,
      `${method} ${apiPath}: ${envelope.error?.code ?? "response"}`,
    ).toBe(method === "POST" ? 201 : 200);
    expect(envelope.data).toBeDefined();
    return envelope.data as T;
  }

  async start() {
    this.directory = await mkdtemp(
      path.join(tmpdir(), "partner-hosted-receiver-"),
    );
    this.receiver = new ControlledReceiver(this.directory, this.scopes);
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        void (async () => {
          const raw = Buffer.concat(chunks);
          const reply = await this.receiver.handle(request.headers, raw);
          const event = String(request.headers["x-drts-event-type"]);
          const passenger =
            event.startsWith("passenger.") &&
            event !== "passenger.notification.test.v1";
          const fault = passenger ? this.fault : "none";
          let status = reply.status;
          let body = reply.body;
          if (fault === "invalid_ack") {
            status = 204;
            body = "";
          } else if (fault === "html_ack") {
            status = 200;
            body = "<html><body>Accepted</body></html>";
          } else if (
            fault.startsWith("wrong_") ||
            fault === "missing_receipt"
          ) {
            // Corrupt only the external response AFTER a valid signed request
            // has been durably accepted. The DRTS ack validator stays real.
            const ack = JSON.parse(body);
            const key = {
              wrong_notification: "notification_id",
              wrong_delivery: "delivery_id",
              wrong_entry: "partner_entry_slug",
              missing_receipt: "receipt_id",
            }[
              fault as
                | "wrong_notification"
                | "wrong_delivery"
                | "wrong_entry"
                | "missing_receipt"
            ];
            if (fault === "missing_receipt") delete ack[key];
            else ack[key] = `mismatched-${randomUUID()}`;
            body = JSON.stringify(ack);
          }
          this.requests.push({
            event,
            rawBody: raw.toString("utf8"),
            hash: createHash("sha256").update(raw).digest("hex"),
            status,
            responseBody: body,
            // Evidence only: retain the public version, never the secret/HMAC.
            secretVersion: Number(
              /^v=(\d+);/.exec(
                String(request.headers["x-drts-webhook-signature"]),
              )?.[1],
            ),
          });
          const finish = () => {
            response.writeHead(status, {
              "Content-Type":
                fault === "html_ack" ? "text/html" : "application/json",
            });
            response.end(body);
          };
          if (fault === "timeout") {
            // Production ack deadline is 10 seconds, including response body.
            const timer = setTimeout(() => {
              this.timers.delete(timer);
              finish();
            }, 11_000);
            this.timers.add(timer);
          } else finish();
        })().catch(() => {
          response.writeHead(503);
          response.end("{}");
        });
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Receiver address unavailable");
    this.url = `http://127.0.0.1:${address.port}/notify`;
    const platform = required("DRTS_UAT_TOKEN_PLATFORM");
    // The default taxi_reservation product is deliberately inactive. Configure
    // both product and runtime policy through governance, before creating rides.
    const products = await this.call<{ items: ServiceProductRecord[] }>(
      "admin/service-products",
      platform,
    );
    const reservation = products.items.find(
      (product) => product.serviceProductType === "taxi_reservation",
    );
    if (reservation) {
      if (!reservation.active)
        await this.call(
          `admin/service-products/${reservation.serviceProductId}`,
          platform,
          "PUT",
          { active: true },
        );
    } else {
      await this.call("admin/service-products", platform, "POST", {
        serviceProductType: "taxi_reservation",
        displayName: "Controlled QA taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
      });
    }
    const productReadback = await this.call<{ items: ServiceProductRecord[] }>(
      "admin/service-products",
      platform,
    );
    expect(
      productReadback.items.find(
        (product) => product.serviceProductType === "taxi_reservation",
      )?.active,
    ).toBe(true);
    await this.call(
      "admin/service-products/runtime-policies/multi_taxi_direct/taxi_reservation",
      platform,
      "PUT",
      {
        active: true,
        effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
        effectiveUntil: new Date(Date.now() + 3_600_000).toISOString(),
      },
    );
    // Playwright starts a new worker after a failure. Reuse the single effective
    // authorization so that a rerun cannot make production resolution ambiguous.
    const authorizations = await this.call<{
      items: MultiTaxiOperatingAuthorizationRecord[];
    }>("platform-admin/multi-taxi/authorizations", platform);
    const active = authorizations.items.filter(
      (authorization) =>
        authorization.status === "approved" &&
        Date.parse(authorization.effectiveFrom) <= Date.now() &&
        (authorization.effectiveUntil === null ||
          Date.parse(authorization.effectiveUntil) > Date.now()),
    );
    expect(
      active.length,
      "one unambiguous operating authorization",
    ).toBeLessThanOrEqual(1);
    if (active.length === 0) {
      const authorization =
        await this.call<MultiTaxiOperatingAuthorizationRecord>(
          "platform-admin/multi-taxi/authorizations",
          platform,
          "POST",
          {
            operatorId: `qa-${randomUUID()}`,
            authorityCode: "QA-CONTROLLED",
            businessPlanVersion: "qa-v1",
            serviceAreaCodes: ["QA"],
            activeFareVersionId: "qa-fare",
            effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
            effectiveUntil: new Date(Date.now() + 3_600_000).toISOString(),
          },
        );
      await this.call(
        `platform-admin/multi-taxi/authorizations/${authorization.authorizationId}/activate`,
        platform,
        "POST",
        {},
      );
    }
    const tenantA = required("DRTS_UAT_TENANT_A");
    const tenantB = required("DRTS_UAT_TENANT_B");
    expect(tenantA).not.toBe(tenantB);
    for (const [tenantId, token, count] of [
      [tenantA, required("DRTS_UAT_TOKEN_A"), 2],
      [tenantB, required("DRTS_UAT_TOKEN_B"), 1],
    ] as const) {
      const entries = new Map<string, ReadonlySet<string>>();
      const secret = randomUUID();
      this.scopes.push({ tenantId, secret, secretVersion: 1, entries });
      const webhook = await this.call<
        Pick<TenantWebhookEndpoint, "webhookId" | "status">
      >(
        "tenant/webhooks",
        token,
        "POST",
        {
          url: this.url,
          secret,
          events: [
            "tenant.webhook.test",
            "passenger.notification.test.v1",
            "passenger.receipt_ready.v1",
          ],
        },
        tenantId,
      );
      const tested = await this.call<{ httpStatus: number }>(
        "tenant/webhooks/test",
        token,
        "POST",
        { webhookId: webhook.webhookId },
        tenantId,
      );
      expect(tested.httpStatus).toBe(204);
      for (let index = 0; index < count; index++) {
        const slug = `qa-notify-${randomUUID().slice(0, 8)}`;
        const body: CreatePartnerChannelEntryCommand = {
          tenantId,
          partnerCode: `qa_${randomUUID().replaceAll("-", "")}`,
          programId: `qa-${randomUUID()}`,
          partnerType: "referral_channel",
          entrySlug: slug,
          displayName: "Controlled QA entry",
          businessDispatchSubtype: "enterprise_dispatch",
          authMode: "partner_api_key",
          eligibilityMode: "none",
          entryHost: "127.0.0.1:3002",
          entryPath: `/embed/${slug}`,
          status: "active",
          activeFlag: true,
        };
        const entry = await this.call<PartnerChannelEntryRecord>(
          "platform-admin/partner-entries",
          platform,
          "POST",
          body,
        );
        expect(entry.tenantId).toBe(tenantId);
        const partnerUserRef = "qa-resident-shared-ref";
        entries.set(slug, new Set([partnerUserRef]));
        const issued = await this.call<PartnerIngressCredentialIssued>(
          `platform-admin/partner-entries/${slug}/credentials/issue`,
          platform,
          "POST",
          { purpose: "disposable hosted QA" },
        );
        expect(issued.plaintextKey).toBeTruthy();
        const binding = await this.call<PartnerEntryNotificationBinding>(
          `platform-admin/partner-entries/${slug}/notification-binding`,
          platform,
          "PUT",
          {
            webhookId: webhook.webhookId,
            eventTypes: ["receipt_ready"],
            expectedVersion: 0,
          },
        );
        expect(binding.state).toBe("test_pending");
        const contractTest = await this.call<{ kind: string }>(
          `platform-admin/partner-entries/${slug}/notification-binding/test`,
          platform,
          "POST",
          {},
        );
        expect(contractTest.kind).toBe("accepted");
        const validated = await this.call<PartnerEntryNotificationBinding>(
          `platform-admin/partner-entries/${slug}/notification-binding`,
          platform,
        );
        const enabled = await this.call<PartnerEntryNotificationBinding>(
          `platform-admin/partner-entries/${slug}/notification-binding/enable`,
          platform,
          "POST",
          { expectedVersion: validated.version },
        );
        expect(enabled.state).toBe("ready");
        this.entries.push({
          entry,
          apiKey: issued.plaintextKey,
          partnerUserRef,
          token,
          webhookId: webhook.webhookId,
          binding: enabled,
        });
      }
    }
  }

  async createRide(entry?: PartnerFixtureEntry) {
    const session = entry
      ? await this.call<PartnerIngressHandoffSession>(
          "partner/ingress/handoff",
          null,
          "POST",
          {
            entrySlug: entry.entry.entrySlug,
            apiKey: entry.apiKey,
            partnerUserRef: entry.partnerUserRef,
            consentScope: "passenger_identity_link",
          },
        )
      : null;
    const created = await this.call<{ ride: { orderId: string } }>(
      "multi-taxi/rides",
      session?.accessToken ?? null,
      "POST",
      {
        pickup: { address: "Controlled pickup" },
        dropoff: { address: "Controlled dropoff" },
        passenger: {
          passengerId: session?.drtsPassengerId ?? `qa-direct-${randomUUID()}`,
          name: "QA Fixture",
          phone: "0900000000",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
    );
    await expect
      .poll(
        async () =>
          (
            await this.db.query(
              "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id=$1",
              [created.ride.orderId],
            )
          ).rows.length,
      )
      .toBe(1);
    if (entry) {
      const route = (
        await this.db.query(
          "SELECT * FROM mobility.phase1_order_partner_notification_routes WHERE order_id=$1",
          [created.ride.orderId],
        )
      ).rows[0];
      expect(route).toMatchObject({
        tenant_id: entry.entry.tenantId,
        partner_id: entry.entry.partnerId,
        entry_slug: entry.entry.entrySlug,
        partner_user_ref: entry.partnerUserRef,
        drts_passenger_id: session!.drtsPassengerId,
        notification_policy_version: "partner_notification_v1",
      });
      expect(route!.ride_ref).toBe(created.ride.orderId);
    }
    return created.ride.orderId;
  }

  async revalidateEndpoint(entry: PartnerFixtureEntry) {
    const list = () =>
      this.call<{ items: TenantWebhookEndpoint[] }>(
        "tenant/webhooks",
        entry.token,
        "GET",
        undefined,
        entry.entry.tenantId,
      );
    const before = (await list()).items.find(
      (endpoint) => endpoint.webhookId === entry.webhookId,
    );
    expect(before).toBeDefined();
    // A permanent bad ack disables the shared endpoint under the existing
    // tenant policy. Recover through its real signed test, never SQL/status edits.
    const result = await this.call<{ httpStatus: number }>(
      "tenant/webhooks/test",
      entry.token,
      "POST",
      { webhookId: entry.webhookId },
      entry.entry.tenantId,
    );
    expect(result.httpStatus).toBe(204);
    const after = (await list()).items.find(
      (endpoint) => endpoint.webhookId === entry.webhookId,
    );
    expect(after?.status).toBe("active");
    return { before: before!.status, after: after!.status };
  }

  async binding(entry: PartnerFixtureEntry) {
    return this.call<PartnerEntryNotificationBinding>(
      `platform-admin/partner-entries/${entry.entry.entrySlug}/notification-binding`,
      required("DRTS_UAT_TOKEN_PLATFORM"),
    );
  }

  async revalidateBinding(entry: PartnerFixtureEntry) {
    const apiPath = `platform-admin/partner-entries/${entry.entry.entrySlug}/notification-binding`;
    const platform = required("DRTS_UAT_TOKEN_PLATFORM");
    const tested = await this.call<{ kind: string }>(
      `${apiPath}/test`,
      platform,
      "POST",
      {},
    );
    expect(tested.kind).toBe("accepted");
    const validated = await this.binding(entry);
    const enabled = await this.call<PartnerEntryNotificationBinding>(
      `${apiPath}/enable`,
      platform,
      "POST",
      { expectedVersion: validated.version },
    );
    expect(enabled.state).toBe("ready");
    return enabled;
  }

  async rotateReceiverSecret(entry: PartnerFixtureEntry) {
    const scope = this.scopes.find((s) => s.tenantId === entry.entry.tenantId)!;
    const secret = randomUUID();
    const rotated = await this.call<{ secretVersion: number }>(
      `tenant/webhooks/${entry.webhookId}/rotate-secret`,
      entry.token,
      "POST",
      { secret, rotationReason: "Controlled QA rotation" },
      entry.entry.tenantId,
    );
    expect(rotated.secretVersion).toBe(scope.secretVersion + 1);
    // Only the external receiver changes its signing-key version here.
    scope.secret = secret;
    scope.secretVersion = rotated.secretVersion;
    return rotated.secretVersion;
  }

  async resolveNavigation(
    entry: PartnerFixtureEntry,
    rideRef: string,
    partnerUserRef = entry.partnerUserRef,
    apiKey = entry.apiKey,
  ) {
    // Keep partner credentials and issued handoffs out of Playwright traces.
    const response = await fetch(
      `${required("DRTS_UAT_API_URL")}/api/partner/entries/${entry.entry.entrySlug}/notification-navigation/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ rideRef, partnerUserRef }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      },
    );
    expect(response.headers.get("x-drts-candidate-sha")).toBe(
      required("CANDIDATE_SHA"),
    );
    return {
      status: response.status,
      envelope: decodeTenantWire(await response.json()),
    };
  }

  async enqueue(
    orderId: string,
    mode: "partner" | "missing_route" = "partner",
    event: {
      createdAt?: string;
      nextAttemptAt?: string;
      payload?: Record<string, unknown>;
    } = {},
  ) {
    const { stdout } = await run(
      "./apps/api/node_modules/.bin/tsx",
      [
        "tests/e2e/system-remediation/sr-partner-notify-qa-20260917/enqueue-notification.ts",
        orderId,
        mode,
        JSON.stringify(event),
      ],
      { timeout: 20_000 },
    );
    const line = stdout
      .split("\n")
      .find((value) => value.startsWith('{"outboxId":'));
    if (!line)
      throw new Error("Production repository did not return fixture identity");
    const created = JSON.parse(line) as {
      outboxId: string;
      candidateSha: string;
    };
    expect(created.candidateSha).toBe(required("CANDIDATE_SHA"));
    return created.outboxId;
  }

  async outcome(outboxId: string) {
    return (
      await this.db.query(
        `SELECT o.*, c.wire_payload_hash, c.delivery_id, c.receipt_id,
      c.delivery_stage, c.failure_reason, c.retry_disposition,
      l.claim_state FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts c USING(outbox_id)
      LEFT JOIN ops.phase1_push_delivery_claims l USING(outbox_id) WHERE o.outbox_id=$1`,
        [outboxId],
      )
    ).rows[0];
  }

  async settled(outboxId: string) {
    await expect
      .poll(async () => (await this.outcome(outboxId))?.status, {
        timeout: 20_000,
        intervals: [200],
      })
      .toMatch(/^(delivered|failed)$/);
    return (await this.outcome(outboxId))!;
  }

  async close() {
    for (const timer of this.timers) clearTimeout(timer);
    if (this.server) {
      this.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        this.server!.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await this.db.end();
    if (this.directory)
      await rm(this.directory, { recursive: true, force: true });
  }
}
