import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { vi } from "vitest";
import type { PoolClient } from "pg";
import type { DriverTaskRecord } from "@drts/contracts";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { PaymentChargeRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentRefundRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.repository";
import { PaymentRefundService } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.service";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import type { PaymentCapturePolicy } from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.policy";
import type {
  BindResult,
  CaptureCommand,
  MoneyResult,
  PaymentProviderPort,
  RefundCommand,
} from "../../../apps/api/src/modules/passenger-app/payment/payment-provider.port";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { OwnedMobilityMultiTaxiTripCompletedEvent } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";

const require = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
require("reflect-metadata");
const { Pool } = require("pg") as typeof import("pg");
// Never open a DB or socket on the worker VM, even with an inherited DB URL.
export const hostedPaymentEnabled = process.env.GITHUB_ACTIONS === "true";
const databaseUrl = process.env.DATABASE_URL;
const runFile = promisify(execFile);

/** Observe real PG errors without changing rows, SQL, parameters or rejection.
 * Production deliberately sanitizes persistence errors; code/position/hash
 * identify an SQL defect without logging a token, credential or raw message. */
class DiagnosedDatabaseService extends DatabaseService {
  private readonly observed = new WeakSet<PoolClient>();
  override async connect(): Promise<PoolClient> {
    const client = await super.connect();
    if (!this.observed.has(client)) {
      this.observed.add(client);
      const query = client.query.bind(client);
      client.query = ((sql: string, values?: unknown[]) =>
        query(sql, values).catch((error: unknown) => {
          const fields =
            error && typeof error === "object"
              ? (error as Record<string, unknown>)
              : {};
          const metadata: Record<string, string> = {
            sqlSha256: createHash("sha256").update(sql).digest("hex"),
          };
          for (const key of [
            "code",
            "position",
            "schema",
            "table",
            "column",
            "constraint",
          ]) {
            if (typeof fields[key] === "string") metadata[key] = fields[key];
          }
          process.stderr.write(
            `Payment QA SQL failure ${JSON.stringify(metadata)}\n`,
          );
          throw error;
        })) as typeof client.query;
    }
    return client;
  }
}
export const syntheticPolicy: PaymentCapturePolicy = {
  retryDelaysMs: [0],
  retryDefinitiveDeclines: false,
  unknownReadbackDelaysMs: [0, 0],
};

/** Harmless, scripted PSP boundary. No adapter, network, device or real policy. */
export class SyntheticPaymentProvider implements PaymentProviderPort {
  readonly name = "qa_synthetic_psp";
  readonly available = true;
  bind = vi.fn(
    async (credential: string, key: string): Promise<BindResult> => ({
      status: "completed",
      card: {
        token: `qa.stored.${credential}.${key}`,
        last4: "0042",
        cardType: "SYNTHETIC",
        expiryMonth: "12",
        expiryYear: "2099",
      },
    }),
  );
  capture = vi.fn(
    async (command: CaptureCommand): Promise<MoneyResult> => ({
      status: "completed",
      providerRef: `qa.capture.${command.idempotencyKey}`,
    }),
  );
  readCapture = vi.fn(
    async (key: string): Promise<MoneyResult> => ({
      status: "completed",
      providerRef: `qa.capture.${key}`,
    }),
  );
  refund = vi.fn(
    async (command: RefundCommand): Promise<MoneyResult> => ({
      status: "completed",
      providerRef: `qa.refund.${command.idempotencyKey}`,
    }),
  );
  readRefund = vi.fn(
    async (key: string): Promise<MoneyResult> => ({
      status: "completed",
      providerRef: `qa.refund.${key}`,
    }),
  );
}

export function platformIdentity(): RequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "qa-ops",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: [],
    scopes: ["billing:write"],
    requestId: null,
  };
}

/** Production migration runner on an owned template; cloned cases preserve
 * immutable audit triggers. Cleanup drops only successfully created names. */
export class PaymentPostgresHarness {
  private readonly template = `pax_payment_tpl_${randomUUID().replaceAll("-", "")}`;
  private readonly created = new Set<string>();
  private admin?: InstanceType<typeof Pool>;
  private activeName: string | undefined;
  pool: InstanceType<typeof Pool> | undefined;
  database!: DatabaseService;
  methods!: PaymentMethodRepository;
  methodService!: PaymentMethodService;
  charges!: PaymentChargeRepository;
  chargeService!: PaymentChargeService;
  refunds!: PaymentRefundRepository;
  refundService!: PaymentRefundService;
  accounts!: PassengerAccountService;
  accountStore!: PassengerAccountRepository;
  provider!: SyntheticPaymentProvider;
  cipher!: PaymentTokenCipher;
  taxi!: MultiTaxiRepository;
  owned!: OwnedMobilityRepository;

  async open(): Promise<void> {
    if (!hostedPaymentEnabled)
      throw new Error("Payment DB/HTTP is GitHub-hosted only.");
    if (!databaseUrl)
      throw new Error(
        "Hosted Payment QA requires DATABASE_URL; missing configuration is a failure.",
      );
    this.admin = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10000,
    });
    await this.admin.query(`CREATE DATABASE "${this.template}"`);
    this.created.add(this.template);
    // Require the native client: never take the runner's Docker fallback.
    const { stdout: psqlVersion } = await runFile("psql", ["--version"]);
    const { stdout: checkout } = await runFile("git", ["rev-parse", "HEAD"]);
    const { stdout } = await runFile(
      "bash",
      ["operations/database/db-apply.sh"],
      {
        env: { ...process.env, DATABASE_URL: this.url(this.template) },
        timeout: 180000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    process.stdout.write(
      `Payment QA migration execution ${JSON.stringify({
        argv: ["bash", "operations/database/db-apply.sh"],
        cwd: process.cwd(),
        utc: new Date().toISOString(),
        checkoutSha: checkout.trim(),
        node: process.version,
        psql: psqlVersion.trim(),
        runId: process.env.GITHUB_RUN_ID,
        ownedDatabase: this.template,
        exitCode: 0,
      })}\n${stdout}\n`,
    );
    const verifier = new Pool({ connectionString: this.url(this.template) });
    try {
      const files = (await readdir("infra/migrations"))
        .filter((name) => /^V[0-9A-Z]+__.+\.sql$/.test(name))
        .sort();
      const checksums = new Map<string, string>();
      for (const file of files) {
        checksums.set(
          file,
          createHash("sha256")
            .update(await readFile(`infra/migrations/${file}`))
            .digest("hex"),
        );
      }
      const applied = await verifier.query(
        "SELECT version,file_name,checksum FROM admin.schema_migrations ORDER BY version",
      );
      // db-apply intentionally canonicalizes identical signatures (V0036 and
      // V0047 are byte-identical). Include V0018A and require every distinct
      // checkout checksum, plus an actual source filename/version for each row.
      // Do not require a second ledger row for a runner-deduplicated file.
      const distinct = new Set(checksums.values());
      if (applied.rows.length !== distinct.size)
        throw new Error(
          "Production migration signature count differs from checkout.",
        );
      for (const row of applied.rows) {
        if (
          checksums.get(row.file_name) !== row.checksum ||
          row.version !== row.file_name.split("__")[0]
        ) {
          throw new Error(
            `Production migration provenance differs: ${row.file_name}`,
          );
        }
      }
      const recorded = new Set(applied.rows.map((row) => row.checksum));
      if (
        recorded.size !== distinct.size ||
        [...distinct].some((checksum) => !recorded.has(checksum))
      )
        throw new Error(
          "A production migration checksum is missing from the runner ledger.",
        );
      process.stdout.write(
        `Payment QA: full db-apply exit=0; ${files.length} source files / ${distinct.size} distinct migration checksums verified; runner stdout SHA256=${createHash("sha256").update(stdout).digest("hex")}\n`,
      );
    } finally {
      await verifier.end();
    }
  }

  private url(name: string): string {
    const url = new URL(databaseUrl!);
    url.pathname = `/${name}`;
    return url.toString();
  }

  private async closeCase(): Promise<void> {
    await this.database?.onModuleDestroy();
    await this.pool?.end();
    this.pool = undefined;
    // Ensure subsequent cleanup cannot close an already closed service.
    this.database = undefined as unknown as DatabaseService;
    if (this.activeName) {
      await this.admin!.query(`DROP DATABASE "${this.activeName}"`);
      this.created.delete(this.activeName);
      this.activeName = undefined;
    }
  }

  async reset(): Promise<void> {
    await this.closeCase();
    const name = `pax_payment_case_${randomUUID().replaceAll("-", "")}`;
    await this.admin!.query(
      `CREATE DATABASE "${name}" TEMPLATE "${this.template}"`,
    );
    this.created.add(name);
    this.activeName = name;
    this.pool = new Pool({
      connectionString: this.url(name),
      max: 12,
      connectionTimeoutMillis: 10000,
    });
    const previous = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = this.url(name);
      this.database = new DiagnosedDatabaseService();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    this.provider = new SyntheticPaymentProvider();
    this.cipher = new PaymentTokenCipher(
      JSON.stringify({
        activeKeyId: "qa-only",
        keys: { "qa-only": Buffer.alloc(32, 42).toString("base64") },
      }),
    );
    const runtime = { provider: this.provider, cipher: this.cipher };
    this.methods = new PaymentMethodRepository(this.database);
    this.methodService = new PaymentMethodService(this.methods, runtime);
    this.taxi = new MultiTaxiRepository(this.database);
    this.owned = new OwnedMobilityRepository(this.database, this.taxi);
    this.charges = new PaymentChargeRepository(this.database);
    this.chargeService = new PaymentChargeService(
      this.charges,
      runtime,
      syntheticPolicy,
    );
    this.refunds = new PaymentRefundRepository(this.database);
    this.refundService = new PaymentRefundService(this.refunds, runtime);
    this.accountStore = new PassengerAccountRepository(this.database);
    this.accounts = new PassengerAccountService(
      this.accountStore,
      new PassengerJwtService(),
    );
  }

  async close(): Promise<void> {
    try {
      await this.closeCase();
      for (const name of this.created) {
        await this.admin!.query(`DROP DATABASE "${name}"`);
        this.created.delete(name);
      }
    } finally {
      await this.admin?.end();
    }
  }

  async account(): Promise<string> {
    const id = `drts_passenger_${randomUUID()}`;
    await this.accountStore.transaction((tx) =>
      tx.insertAccount({
        drtsPassengerId: id,
        displayName: "Synthetic QA",
        contactPhoneVerified: false,
        contactConsent: false,
        status: "active",
        createdAt: new Date().toISOString(),
      }),
    );
    return id;
  }

  async method(owner: string, credential = `qa.credential.${randomUUID()}`) {
    const result = await this.methodService.bind(owner, {
      provider_token: credential,
    });
    if (result.status !== "completed" || !result.method)
      throw new Error("Synthetic binding did not complete.");
    return result.method;
  }

  async ride(
    owner: string,
    methodId: string,
  ): Promise<OwnedMobilityMultiTaxiTripCompletedEvent> {
    const orderId = randomUUID();
    const tripId = randomUUID();
    const quoteId = randomUUID();
    const now = new Date().toISOString();
    // Dependency fixture only: formal V0112 snapshot, no replacement DDL or payment SQL.
    await this.pool!.query(
      `INSERT INTO passenger.fare_quote_snapshots
      (fare_snapshot_id,drts_passenger_id,fare_version,origin_lat,origin_lng,destination_lat,destination_lng,
       scheduled_at,route,tariff_snapshot,breakdown,service_area_evaluation,estimated_min,estimated_max,created_at,expires_at)
      VALUES ($1,$2,'taipei-20230401',25,121,25.1,121.1,now()+interval '1 hour','{}','{}','{}','{}',85,500,$3,$3::timestamptz+interval '15 minutes')`,
      [quoteId, owner, now],
    );
    await this.pool!.query(
      `INSERT INTO passenger.booking_histories
      (drts_passenger_id,order_id,fare_snapshot_id,passenger_confirmed_at) VALUES ($1,$2,$3,$4)`,
      [owner, orderId, quoteId, now],
    );
    const order = buildOrderFixture({
      orderId,
      status: "completed",
      runtimeProfileCode: "multi_taxi_direct",
      orderSource: "portal",
      serviceBucket: "standard_taxi",
      dispatchSemantics: "reservation",
      passenger: {
        passengerId: owner,
        name: "Synthetic QA",
        phone: "0900000000",
      },
      paymentMethodTokenRef: methodId,
    });
    const task: DriverTaskRecord = {
      taskId: tripId,
      orderId,
      dispatchJobId: randomUUID(),
      assignmentId: randomUUID(),
      driverId: "qa-driver",
      vehicleId: "qa-vehicle",
      sourcePlatform: null,
      routeProvided: false,
      waypoints: [],
      status: "completed",
      acceptedAt: now,
      departedAt: now,
      arrivedPickupAt: now,
      startedAt: now,
      completedAt: now,
      actualDistanceKm: 2,
      actualDurationSec: 600,
      fare: { amountMinor: 125, currency: "TWD" },
      proof: null,
    };
    await this.owned.persistChanges({ orders: [order], driverTasks: [task] });
    return {
      runtimeProfileCode: "multi_taxi_direct",
      orderId,
      tripId,
      plateNo: "QA-0000",
      pickupAt: now,
      dropoffAt: now,
      travelDurationSeconds: 600,
      routeSummary: "synthetic",
      distanceMeters: 2000,
      fareMinor: 125,
      tollMinor: 0,
      currency: "TWD",
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "1999",
      completedAt: now,
    };
  }

  async obligation() {
    const owner = await this.account();
    const method = await this.method(owner);
    const event = await this.ride(owner, method.paymentMethodId);
    return { owner, method, event };
  }

  async state(orderId: string) {
    const charge = await this.charges.withOrder(orderId, (session) =>
      session.load(),
    );
    const billing = await this.pool!.query(
      "SELECT * FROM billing.multi_taxi_passenger_payments WHERE order_id=$1",
      [orderId],
    );
    const journal = await this.pool!.query(
      "SELECT * FROM passenger.payment_idempotency_keys WHERE entity_id=$1 AND operation<>'bind' ORDER BY operation",
      [orderId],
    );
    return { charge, billing: billing.rows[0], journal: journal.rows };
  }
}
