import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { vi } from "vitest";
import type { PoolClient } from "pg";
import type {
  DriverTaskRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";
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
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { PassengerComplaintService } from "../../../apps/api/src/modules/passenger-app/complaint/passenger-complaint.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import { CertificateSupportService } from "../../../apps/api/src/modules/certificate-support/certificate-support.service";

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
export class DiagnosedDatabaseService extends DatabaseService {
  probe:
    | {
        begin: () => Promise<void>;
        sessions: Set<number>;
        mutations: { pid: number; sqlSha256: string }[];
      }
    | undefined;
  override async connect(): Promise<PoolClient> {
    const client = await super.connect();
    {
      // Instrument only the leased production executor. Pool.query uses the
      // callback overload on returned clients; preserve that API and restore
      // the exact native method before releasing this lease back to the pool.
      const nativeQuery = client.query;
      const query = client.query.bind(client);
      const release = client.release.bind(client);
      const observe = async (sql: string, values?: unknown[]) => {
        const probe = this.probe;
        let pid: number | undefined;
        if (
          probe &&
          (sql.trim() === "BEGIN" || /^\s*(INSERT|UPDATE)/i.test(sql))
        ) {
          pid = (await query("SELECT pg_backend_pid() AS pid")).rows[0]
            .pid as number;
        }
        const result = await query(sql, values).catch((error: unknown) => {
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
        });
        if (probe && sql.trim() === "BEGIN") {
          probe.sessions.add(pid!);
          await probe.begin();
        }
        if (probe && pid !== undefined && /^\s*(INSERT|UPDATE)/i.test(sql)) {
          probe.mutations.push({
            pid,
            sqlSha256: createHash("sha256").update(sql).digest("hex"),
          });
        }
        return result;
      };
      client.query = ((...args: unknown[]) => {
        if (typeof args[0] !== "string" || typeof args.at(-1) === "function") {
          return Reflect.apply(nativeQuery, client, args);
        }
        return observe(args[0], args[1] as unknown[] | undefined);
      }) as typeof client.query;
      client.release = (...args) => {
        client.query = nativeQuery;
        return release(...args);
      };
    }
    return client;
  }
}
export const syntheticPolicy: PaymentCapturePolicy = {
  retryDelaysMs: [0],
  retryDefinitiveDeclines: false,
  unknownReadbackDelaysMs: [0, 0],
};

/** Explicitly simulated issuer/credential/payment facts, never legal E04 evidence. */
export const simulatedE04 = {
  fleetOperatorName: "QA simulated operator <escaped>",
  driverSurname: "歐陽",
  driverRegistrationMasked: "••••0042",
  fareBreakdown: {
    startMinor: 8501,
    distanceMinor: 1303,
    delayMinor: 0,
    nightMinor: 0,
  },
  paymentMethodDisplay: "QA simulated captured card ••••0042",
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
    const database = this.database;
    const pool = this.pool;
    // Detach before awaiting cleanup so a timed-out hook cannot end the same
    // pool twice and obscure the original failure on subsequent cases.
    this.database = undefined as unknown as DatabaseService;
    this.pool = undefined;
    await database?.onModuleDestroy();
    await pool?.end();
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

  /** Relational dependency fixtures, never a claim of real PSP or legal E04 facts.
   * No Payment bind prerequisite is required for independent Receipt/CRM QA. */
  async receiptTrip(owner: string, paid = true) {
    const event = await this.ride(owner, randomUUID());
    event.pickupAt = new Date(
      Date.parse(event.completedAt) - 600000,
    ).toISOString();
    event.fareMinor = 19037;
    event.tollMinor = 271;
    event.driverSurname = "歐陽";
    event.driverSurnameSource = "driver_profile_declared";
    event.driverSurnameProfileUpdatedAt = event.completedAt;
    event.actualFareBreakdown = {
      startMinor: 8501,
      distanceMinor: 1303,
      delayMinor: 0,
      nightMinor: 0,
    };
    const state = await this.owned.loadState();
    const task = state.driverTasks.find((row) => row.taskId === event.tripId)!;
    task.startedAt = event.pickupAt;
    task.fare = { amountMinor: event.fareMinor, currency: event.currency };
    const snapshot: PassengerDispatchDisclosureSnapshot = {
      snapshotId: randomUUID(),
      runtimeProfileCode: "multi_taxi_direct",
      orderId: event.orderId,
      bookingId: null,
      dispatchJobId: task.dispatchJobId,
      assignmentId: task.assignmentId,
      assignmentVersion: 1,
      vehicle: {
        vehicleId: task.vehicleId,
        make: "QA",
        model: "synthetic",
        plateNo: event.plateNo,
        modelYear: 2099,
        doorCount: 4,
        color: null,
        profileVersion: 1,
      },
      driver: {
        driverId: task.driverId,
        displayName: "Synthetic driver",
        registrationMaskedDisplay: "••••0042",
        registrationStatus: "verified_active",
        registrationEffectiveUntil: "2099-01-01T00:00:00Z",
        credentialVersion: 1,
      },
      rating: {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        aggregateVersion: 1,
      },
      eta: { minutes: null, calculatedAt: null, locationFreshness: "missing" },
      routeFare: {
        routeSnapshotId: randomUUID(),
        quoteSnapshotId: randomUUID(),
        orderId: event.orderId,
        pickup: {
          address: "Synthetic origin",
          lat: 25,
          lng: 121,
          coordinateSource: "manual_pin",
          geocodeConfidence: "manual",
          resolvedAt: event.pickupAt,
        },
        dropoff: {
          address: "Synthetic destination",
          lat: 25.1,
          lng: 121.1,
          coordinateSource: "manual_pin",
          geocodeConfidence: "manual",
          resolvedAt: event.pickupAt,
        },
        estimatedDistanceMeters: 2000,
        estimatedDurationSeconds: 600,
        encodedPolyline: null,
        chargingMode: "meter_estimate",
        estimatedFareMinor: 125,
        payableFareMinor: null,
        currency: "TWD",
        farePolicyId: "qa-fixture",
        farePolicyVersion: "qa-fixture",
        fareChangeRuleId: "qa-fixture",
        fareChangeRuleVersion: "qa-fixture",
        fareChangeRuleDisplayText: "Synthetic dependency",
        passengerConfirmedAt: event.pickupAt,
        generatedAt: event.pickupAt,
      },
      createdAt: event.pickupAt,
      supersededAt: null,
    };
    await this.owned.persistChanges({
      driverTasks: [task],
      passengerDisclosureSnapshots: [snapshot],
    });
    if (paid)
      await this.pool!.query(
        `INSERT INTO billing.multi_taxi_passenger_payments
       (payment_id,order_id,provider_payment_ref,status,amount_minor,currency)
       VALUES ($1,$2,'qa-simulated-capture','captured',$3,$4)`,
        [randomUUID(), event.orderId, event.fareMinor, event.currency],
      );
    return event;
  }

  async receiptServices() {
    // Audit service uses its existing memory boundary; no email/provider delivery.
    const audit = new AuditNotificationService();
    const complaintRepository = new ComplaintRepository(this.database);
    const complaints = new ComplaintService(audit, complaintRepository);
    const certificates = new CertificateSupportService(
      new CertificateSupportRepository(this.database),
    );
    const owned = new OwnedMobilityService(
      {} as never,
      audit,
      {
        registerRecordingAttachmentListener() {},
        registerRecordingStateChangeListener() {},
      } as never,
      {} as never,
      undefined,
      this.owned,
    );
    // Only hydration; do not register this service for scheduler bootstrap.
    await owned.onModuleInit();
    const multi = new MultiTaxiService(
      owned,
      this.taxi,
      undefined,
      audit,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      certificates,
    );
    const booking = new PassengerBookingService(
      new PassengerBookingRepository(this.database),
      multi,
      new PassengerFareRepository(this.database),
      this.accountStore,
      complaints,
    );
    return {
      audit,
      owned,
      multi,
      booking,
      complaints,
      complaintRepository,
      certificates,
      passengerComplaints: new PassengerComplaintService(booking, complaints),
    };
  }

  /** Barrier on BEGIN of the actual production submission executors. Mutation
   * logs distinguish writes from replay; PIDs never use unrelated pool clients. */
  async concurrentMutations<T>(work: () => Promise<T>) {
    const database = this.database as DiagnosedDatabaseService;
    let arrivals = 0;
    let release!: () => void;
    let fail!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    const timer = setTimeout(
      () => fail(new Error("Two production transactions did not reach BEGIN.")),
      5000,
    );
    database.probe = {
      sessions: new Set(),
      mutations: [],
      begin: async () => {
        if (++arrivals === 2) release();
        await barrier;
      },
    };
    try {
      const result = await work();
      const mutations = database.probe.mutations;
      const sessions = [...database.probe.sessions];
      process.stdout.write(
        `Receipt CRM QA production session provenance ${JSON.stringify({ sessions, mutations })}\n`,
      );
      return { result, sessions, mutations };
    } finally {
      clearTimeout(timer);
      database.probe = undefined;
    }
  }

  async receiptState(orderId: string) {
    const queries = {
      ratings: [
        "SELECT * FROM ops.passenger_trip_ratings WHERE order_id=$1",
        [orderId],
      ],
      consents: [
        "SELECT * FROM passenger.rating_consents WHERE order_id=$1",
        [orderId],
      ],
      intakes: [
        "SELECT * FROM passenger.complaints WHERE order_id=$1 ORDER BY case_no",
        [orderId],
      ],
      cases: [
        "SELECT * FROM crm.phase1_complaint_cases WHERE record->>'relatedOrderId'=$1 ORDER BY case_no",
        [orderId],
      ],
      timelines: [
        "SELECT t.* FROM crm.phase1_complaint_timelines t JOIN crm.phase1_complaint_cases c USING(case_no) WHERE c.record->>'relatedOrderId'=$1 ORDER BY entry_id",
        [orderId],
      ],
      summaries: [
        "SELECT * FROM ops.driver_rating_summaries WHERE driver_id='qa-driver'",
        [],
      ],
    } as const;
    return Object.fromEntries(
      await Promise.all(
        Object.entries(queries).map(async ([name, [sql, params]]) => [
          name,
          (await this.pool!.query(sql, [...params])).rows,
        ]),
      ),
    ) as Record<keyof typeof queries, Record<string, any>[]>;
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
