/**
 * PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 — product-level PostgreSQL + NestJS
 * controller harness for the ECPay Stage acceptance test.
 *
 * Mounts the real product controllers (`PaymentMethodController`,
 * `PaymentRefundController`, `PassengerBookingController`,
 * `PassengerReceiptController`) backed by an isolated migrated PostgreSQL
 * database (`PaymentPostgresHarness`) and the real `EcpayPaymentProvider` +
 * `PaymentTokenCipher` runtime from `paymentRuntimeFromEnv`.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type {
  DriverDeclaredSurnameSnapshot,
  DriverPublicRegistrationCredential,
  VehiclePassengerDisclosureProfile,
} from "@drts/contracts";
import type { INestApplication } from "../../../apps/api/node_modules/@nestjs/common";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { PassengerRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import { CertificateSupportService } from "../../../apps/api/src/modules/certificate-support/certificate-support.service";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
  type OwnedMobilityMultiTaxiTripCompletedEvent,
} from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { PassengerFareService } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.service";
import { paymentCapturePolicyFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.config";
import { PaymentMethodController } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.controller";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { PaymentRefundController } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.controller";
import { PaymentRefundService } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.service";
import type { PaymentRuntime } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";
import type { EncryptedPaymentToken } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import { PassengerReceiptController } from "../../../apps/api/src/modules/passenger-app/receipt/passenger-receipt.controller";
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import {
  PaymentPostgresHarness,
  accountSigningFixture,
  syntheticPolicy,
} from "../../unit/pax-qa-20261009/payment-postgres-harness";

const requireApi = createRequire(
  path.resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");
const { Module } = requireApi(
  "@nestjs/common",
) as typeof import("../../../apps/api/node_modules/@nestjs/common");
const { NestFactory, Reflector } = requireApi(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");
const { EventEmitter2 } = requireApi("eventemitter2") as {
  EventEmitter2: new () => {
    on(
      event: string,
      listener: (
        payload: OwnedMobilityMultiTaxiTripCompletedEvent,
      ) => Promise<void>,
    ): void;
    listenerCount(event: string): number;
    emitAsync(event: string, payload: unknown): Promise<unknown[]>;
  };
};

export const PLATFORM_BILLING_HEADERS = Object.freeze({
  "x-realm": "platform",
  "x-actor-type": "platform_admin",
  "x-actor-id": "qa-stage-ops",
  "x-scopes": "billing:write",
  "x-role-families": "platform",
});

export interface ProductOrderDatabaseInspection {
  pspTokens: Array<{
    payment_method_id: string;
    drts_passenger_id: string;
    psp_name: string;
    token_envelope: EncryptedPaymentToken | string | null;
    last4: string;
    card_type: string;
    expiry_month: string;
    expiry_year: string;
    is_default: boolean;
    status: string;
  }>;
  bookingHistories: Array<{
    order_id: string;
    drts_passenger_id: string;
    fare_snapshot_id: string;
  }>;
  ownedOrders: Array<{
    order_id: string;
    status: string;
    payment_method_token_ref: string | null;
    passenger_id: string | null;
  }>;
  completionOutbox: Array<{
    task_id: string;
    order_id: string;
    effect_type: string;
    status: string;
    attempt_count: number;
  }>;
  electronicReceipts: Array<{
    order_id: string;
    trip_id: string;
    payment_method_display: string | null;
    fleet_operator_name: string | null;
    driver_surname: string | null;
  }>;
  chargeRecords: Array<{
    payment_id: string;
    order_id: string;
    drts_passenger_id: string;
    payment_method_id: string | null;
    amount_minor: number;
    currency: string;
    status: string;
    attempt_count: number;
    provider_capture_ref: string | null;
    provider_refund_ref: string | null;
    last_error: string | null;
  }>;
  billingPayments: Array<{
    payment_id: string;
    order_id: string;
    provider_payment_ref: string;
    status: string;
    amount_minor: number;
    currency: string;
  }>;
  idempotencyKeys: Array<{
    idempotency_key: string;
    operation: string;
    entity_id: string;
    outcome: string;
    last_error: string | null;
  }>;
}

export interface ProductOrderStageContext {
  pg: PaymentPostgresHarness;
  app: INestApplication;
  apiOrigin: string;
  passengerId: string;
  accessToken: string;
  refreshToken: string;
  identity: PassengerRequestIdentity;
  fares: PassengerFareService;
  booking: PassengerBookingService;
  multi: MultiTaxiService;
  owned: OwnedMobilityService;
  certificates: CertificateSupportService;
  requestJson<T = Record<string, unknown>>(
    pathname: string,
    init?: RequestInit,
  ): Promise<{ status: number; headers: Headers; body: T }>;
  requestRaw(
    pathname: string,
    init?: RequestInit,
  ): Promise<{
    status: number;
    headers: Headers;
    buffer: Buffer;
    text: string;
  }>;
  createQuote(): Promise<{
    fareSnapshotId: string;
    scheduledAt: string;
    origin: { lat: number; lng: number; address: string };
    destination: { lat: number; lng: number; address: string };
  }>;
  completeProductOrder(
    orderId: string,
    fareMinor: number,
  ): Promise<{
    taskId: string;
    tripId: string;
    orderId: string;
    outboxStatus: string;
    outboxAttempts: number;
  }>;
  inspectDatabaseState(
    orderId?: string | null,
    paymentMethodId?: string | null,
  ): Promise<ProductOrderDatabaseInspection>;
  close(): Promise<void>;
}

export async function startProductOrderStageContext(params: {
  runtime: PaymentRuntime;
  passengerEmail: string;
}): Promise<ProductOrderStageContext> {
  accountSigningFixture();
  process.env.REQUIRE_SMS_VERIFICATION = "false";
  process.env.DRTS_INTERNAL_KEY = "";

  const capturePolicy = paymentCapturePolicyFromEnv(
    {
      PAX_PAYMENT_CAPTURE_ENABLED: "true",
      PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify(syntheticPolicy),
    },
    params.runtime,
  );
  if (!capturePolicy) {
    throw new Error("payment_capture_policy_not_enabled");
  }

  const pg = new PaymentPostgresHarness();
  await pg.open();
  await pg.reset({
    runtime: params.runtime,
    capturePolicy,
  });

  const auth = await pg.authenticatedAccount("email", params.passengerEmail);
  let bookingProfileReady = false;
  async function ensureBookingProfile() {
    if (bookingProfileReady) return;
    await pg.accounts.updateMe(auth.identity, {
      displayName: "Stage Product Order QA",
      contactPhone: "0900000000",
      contactConsent: true,
      termsVersion: "qa-terms",
      privacyVersion: "qa-privacy",
      feeAcknowledgementVersion: "qa-fees",
    });
    bookingProfileReady = true;
  }

  const { fares } = await pg.fareServices();

  const candidate = {
    driverId: "stage-synthetic-driver",
    vehicleId: "stage-synthetic-vehicle",
    etaMinutes: 5,
    operatingArea: "taipei",
    serviceBuckets: ["standard_taxi"],
  };
  const declaredSurname: DriverDeclaredSurnameSnapshot = {
    driverSurname: "歐陽",
    driverSurnameSource: "driver_profile_declared",
    driverSurnameProfileUpdatedAt: "2025-01-01T00:00:00.000Z",
  };
  const registry = {
    prepareMatchingSuppressions: () => undefined,
    assertCurrentMatchingSuppressionClear: () => undefined,
    getEligibleCandidates: () => [candidate],
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
    getVehicleLicenseType: () => "multi_purpose_taxi",
    getVehiclePassengerDisclosureProfile:
      (): VehiclePassengerDisclosureProfile => ({
        vehicleId: candidate.vehicleId,
        make: "QA synthetic make",
        model: "QA synthetic model",
        modelYear: 2025,
        doorCount: 4,
        color: "white",
        status: "complete",
        missingFieldCodes: [],
        verifiedByActorId: "qa-synthetic-verifier",
        verifiedAt: "2025-01-01T00:00:00.000Z",
        sourceSubmissionId: null,
        version: 1,
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
    getDriverPublicRegistrationCredential:
      (): DriverPublicRegistrationCredential => ({
        driverId: candidate.driverId,
        registrationNo: "QA-SYNTHETIC-0042",
        registrationArea: "QA",
        effectiveFrom: "2025-01-01T00:00:00.000Z",
        effectiveUntil: "2099-01-01T00:00:00.000Z",
        status: "verified_active",
        maskedDisplay: "••••0042",
        verifiedByActorId: "qa-synthetic-verifier",
        verifiedAt: "2025-01-01T00:00:00.000Z",
        sourceSubmissionId: null,
        version: 1,
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
    getDriverCompletionReceiptIdentity: async () => ({
      surname: declaredSurname,
      driverRegistrationMasked: "••••0042",
    }),
    getDriverDeclaredSurnameSnapshot: () => declaredSurname,
    listVehicles: () => [
      { vehicleId: candidate.vehicleId, plateNo: "TPE-8500" },
    ],
    listDrivers: () => [
      { driverId: candidate.driverId, name: "QA synthetic driver" },
    ],
  };

  const now = new Date().toISOString();
  const authorizationId = randomUUID();
  await pg.taxi.persistAuthorization({
    authorizationId,
    operatorId: "qa-synthetic-operator",
    authorityCode: "QA-SYNTHETIC",
    businessPlanVersion: "qa-stage-product-order",
    status: "approved",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "taipei-20230401",
    effectiveFrom: "2023-04-01T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: now,
    updatedAt: now,
  });
  await pg.taxi.persistVehicle({
    authorizationVehicleId: randomUUID(),
    authorizationId,
    vehicleId: candidate.vehicleId,
    status: "active",
    effectiveFrom: "2023-04-01T00:00:00.000Z",
    effectiveUntil: null,
  });

  const fleetPartnerRepository = new FleetPartnerRepository(pg.database);
  await fleetPartnerRepository.persistChanges({
    fleetPartners: [
      {
        fleetPartnerId: "fleet-stage-qa",
        legalName: "DRTS Stage 測試合作車隊（非正式）",
        displayName: "Stage QA Fleet",
        businessRegistrationNo: "00000000",
        contactName: "QA",
        contactPhone: "02-2944-0985",
        active: true,
        partnershipType: "business_dispatch_fleet",
        multiTaxiOperatorIds: ["qa-synthetic-operator"],
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  const audit = new AuditNotificationService();
  const taskEvents = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const opsEvents = {
    publishOrderCreated() {},
    publishOrderUpdated() {},
    publishDispatchJobUpdated() {},
  };
  const owned = new OwnedMobilityService(
    registry as never,
    audit,
    {
      registerRecordingAttachmentListener() {},
      registerRecordingStateChangeListener() {},
    } as never,
    taskEvents,
    opsEvents as never,
    pg.owned,
  );
  await owned.onModuleInit();

  const regulatoryRegistryRepository = new RegulatoryRegistryRepository(
    pg.database,
  );
  Reflect.set(owned, "receiptFleetRepository", fleetPartnerRepository);
  Reflect.set(owned, "receiptRegistryRepository", regulatoryRegistryRepository);
  Reflect.set(owned, "receiptPaymentMethods", pg.methodService);

  const certificates = new CertificateSupportService(
    new CertificateSupportRepository(pg.database),
  );
  const emitter = new EventEmitter2();
  emitter.on(OWNED_MOBILITY_TRIP_COMPLETED_EVENT, async () => undefined);
  emitter.on(
    OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
    async (event: OwnedMobilityMultiTaxiTripCompletedEvent) => {
      await certificates.writeCompletedTrip(event);
      await pg.chargeService.onTripCompleted(event);
    },
  );
  Reflect.set(owned, "eventEmitter", emitter);
  Reflect.set(owned, "multiTaxiRepository", pg.taxi);

  const multi = new MultiTaxiService(
    owned,
    pg.taxi,
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
  await multi.onModuleInit();

  const booking = new PassengerBookingService(
    new PassengerBookingRepository(pg.database),
    multi,
    new PassengerFareRepository(pg.database),
    pg.accountStore,
    undefined,
    new PassengerPushDevicesService(
      new PassengerPushDevicesRepository(pg.database),
    ),
  );

  Reflect.defineMetadata(
    "design:paramtypes",
    [PaymentMethodService, PassengerAccountService],
    PaymentMethodController,
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [PaymentRefundService],
    PaymentRefundController,
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [PassengerBookingService, MultiTaxiService],
    PassengerBookingController,
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [PassengerBookingService, MultiTaxiService],
    PassengerReceiptController,
  );

  @Module({
    controllers: [
      PaymentMethodController,
      PaymentRefundController,
      PassengerBookingController,
      PassengerReceiptController,
    ],
    providers: [
      { provide: PaymentMethodService, useValue: pg.methodService },
      { provide: PassengerAccountService, useValue: pg.accounts },
      { provide: PaymentRefundService, useValue: pg.refundService },
      { provide: PassengerBookingService, useValue: booking },
      { provide: MultiTaxiService, useValue: multi },
    ],
  })
  class ProductOrderStageHttpModule {}

  const app = await NestFactory.create(ProductOrderStageHttpModule, {
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
      pg.accounts,
    ),
  );
  app.useGlobalInterceptors(new SnakeCaseInterceptor());
  app.useGlobalFilters(new SnakeCaseExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as AddressInfo;
  const apiOrigin = `http://127.0.0.1:${address.port}`;

  async function requestRaw(pathname: string, init?: RequestInit) {
    const response = await fetch(`${apiOrigin}${pathname}`, init);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      status: response.status,
      headers: response.headers,
      buffer,
      text: buffer.toString("utf8"),
    };
  }

  async function requestJson<T = Record<string, unknown>>(
    pathname: string,
    init?: RequestInit,
  ) {
    const raw = await requestRaw(pathname, init);
    let body: T;
    try {
      body = JSON.parse(raw.text) as T;
    } catch {
      body = raw.text as unknown as T;
    }
    return {
      status: raw.status,
      headers: raw.headers,
      body,
    };
  }

  async function createQuote() {
    await ensureBookingProfile();
    const origin = {
      lat: 25.08,
      lng: 121.55,
      address: "台北市中山區北安路501號",
    };
    const destination = {
      lat: 25.1,
      lng: 121.57,
      address: "台北市內湖區內湖路一段360號",
    };
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const quote = await fares.quote(auth.identity, {
      originLat: origin.lat,
      originLng: origin.lng,
      destinationLat: destination.lat,
      destinationLng: destination.lng,
      scheduledAt,
    });
    if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId) {
      throw new Error(
        `fare_quote_not_serviceable:${quote.serviceAreaResult ?? "none"}`,
      );
    }
    return {
      fareSnapshotId: quote.fareSnapshotId,
      scheduledAt,
      origin,
      destination,
    };
  }

  async function completeProductOrder(orderId: string, fareMinor: number) {
    const job = await owned.dispatchOrder(orderId, { mode: "auto" });
    const assignment = await owned.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });
    const t0 = Date.now();
    const acceptedAt = new Date(t0 - 15 * 60_000).toISOString();
    const departedAt = new Date(t0 - 12 * 60_000).toISOString();
    const arrivedAt = new Date(t0 - 8 * 60_000).toISOString();
    const startedAt = new Date(t0 - 6 * 60_000).toISOString();
    const completedAt = new Date(t0).toISOString();

    await owned.acceptDriverTask(assignment.taskId, { acceptedAt });
    await owned.departDriverTask(assignment.taskId, {
      departedAt,
      currentLocation: { lat: 25.08, lng: 121.55 },
    });
    await owned.arrivedPickup(assignment.taskId, { arrivedAt });
    await owned.startDriverTask(assignment.taskId, { startedAt });
    await owned.completeDriverTask(
      assignment.taskId,
      {
        completedAt,
        actualDistanceKm: 1.25,
        actualDurationSec: 360,
        fare: { amountMinor: fareMinor, currency: "TWD" },
        proof: { photos: [] },
        actualFareBreakdown: {
          startMinor: fareMinor,
          distanceMinor: 0,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
      `stage-driver-complete:${orderId}`,
    );
    while (Reflect.get(owned, "driverCompletionOutboxDrainPromise")) {
      await Reflect.get(owned, "driverCompletionOutboxDrainPromise");
    }

    const outboxResult = await pg.pool!.query<{
      task_id: string;
      order_id: string;
      status: string;
      attempt_count: number;
      last_error: string | null;
    }>(
      `SELECT task_id, order_id, status, attempt_count, last_error
       FROM ops.driver_completion_outbox
       WHERE order_id = $1 AND effect_type = 'multi_taxi_certificate'`,
      [orderId],
    );
    const outboxRow = outboxResult.rows[0];
    if (!outboxRow) {
      throw new Error("completion_outbox_row_missing");
    }
    if (outboxRow.status !== "delivered" && outboxRow.last_error) {
      throw new Error(
        `completion_outbox_delivery_failed:${outboxRow.status}:${outboxRow.last_error}`,
      );
    }
    return {
      taskId: assignment.taskId,
      tripId: assignment.taskId,
      orderId,
      outboxStatus: outboxRow.status,
      outboxAttempts: Number(outboxRow.attempt_count),
    };
  }

  async function inspectDatabaseState(
    orderId?: string | null,
    paymentMethodId?: string | null,
  ): Promise<ProductOrderDatabaseInspection> {
    const [
      pspTokens,
      bookingHistories,
      ownedOrders,
      completionOutbox,
      electronicReceipts,
      chargeRecords,
      billingPayments,
      idempotencyKeys,
    ] = await Promise.all([
      pg.pool!.query<{
        payment_method_id: string;
        drts_passenger_id: string;
        psp_name: string;
        token_envelope: EncryptedPaymentToken | string | null;
        last4: string;
        card_type: string;
        expiry_month: string;
        expiry_year: string;
        is_default: boolean;
        status: string;
      }>(
        `SELECT payment_method_id::text AS payment_method_id,
                drts_passenger_id,
                provider AS psp_name,
                token_envelope,
                last4,
                card_type,
                expiry_month,
                expiry_year,
                is_default,
                status
         FROM passenger.psp_tokens
         WHERE drts_passenger_id = $1
           AND ($2::text IS NULL OR payment_method_id::text = $2)
         ORDER BY created_at ASC`,
        [auth.owner, paymentMethodId ?? null],
      ),
      pg.pool!.query<{
        order_id: string;
        drts_passenger_id: string;
        fare_snapshot_id: string;
      }>(
        `SELECT order_id::text AS order_id,
                drts_passenger_id,
                fare_snapshot_id::text AS fare_snapshot_id
         FROM passenger.booking_histories
         WHERE drts_passenger_id = $1
           AND ($2::text IS NULL OR order_id::text = $2)
         ORDER BY created_at ASC`,
        [auth.owner, orderId ?? null],
      ),
      pg.pool!.query<{
        order_id: string;
        status: string;
        payment_method_token_ref: string | null;
        passenger_id: string | null;
      }>(
        `SELECT order_id,
                status,
                record->>'paymentMethodTokenRef' AS payment_method_token_ref,
                record->'passenger'->>'passengerId' AS passenger_id
         FROM ops.phase1_owned_orders
         WHERE ($1::text IS NULL OR order_id = $1)
         ORDER BY order_id ASC`,
        [orderId ?? null],
      ),
      pg.pool!.query<{
        task_id: string;
        order_id: string;
        effect_type: string;
        status: string;
        attempt_count: number;
      }>(
        `SELECT task_id, order_id, effect_type, status, attempt_count
         FROM ops.driver_completion_outbox
         WHERE ($1::text IS NULL OR order_id = $1)
         ORDER BY order_id ASC`,
        [orderId ?? null],
      ),
      pg.pool!.query<{
        order_id: string;
        trip_id: string;
        payment_method_display: string | null;
        fleet_operator_name: string | null;
        driver_surname: string | null;
      }>(
        `SELECT order_id,
                COALESCE(record->>'tripId', record->>'trip_id', '') AS trip_id,
                record->'e04Snapshot'->>'paymentMethodDisplay' AS payment_method_display,
                record->'e04Snapshot'->>'fleetOperatorName' AS fleet_operator_name,
                record->'e04Snapshot'->>'driverSurname' AS driver_surname
         FROM reporting.multi_taxi_electronic_receipts
         WHERE ($1::text IS NULL OR order_id = $1)
         ORDER BY order_id ASC`,
        [orderId ?? null],
      ),
      pg.pool!.query<{
        payment_id: string;
        order_id: string;
        drts_passenger_id: string;
        payment_method_id: string | null;
        amount_minor: number;
        currency: string;
        status: string;
        attempt_count: number;
        provider_capture_ref: string | null;
        provider_refund_ref: string | null;
        last_error: string | null;
      }>(
        `SELECT payment_id,
                order_id::text AS order_id,
                drts_passenger_id,
                payment_method_id::text AS payment_method_id,
                amount_minor,
                currency,
                status,
                attempt_count,
                provider_capture_ref,
                provider_refund_ref,
                last_error_code AS last_error
         FROM passenger.payment_charge_records
         WHERE ($1::text IS NULL OR order_id::text = $1)
         ORDER BY order_id ASC`,
        [orderId ?? null],
      ),
      pg.pool!.query<{
        payment_id: string;
        order_id: string;
        provider_payment_ref: string;
        status: string;
        amount_minor: number;
        currency: string;
      }>(
        `SELECT payment_id, order_id, provider_payment_ref, status, amount_minor, currency
         FROM billing.multi_taxi_passenger_payments
         WHERE ($1::text IS NULL OR order_id = $1)
         ORDER BY order_id ASC`,
        [orderId ?? null],
      ),
      pg.pool!.query<{
        idempotency_key: string;
        operation: string;
        entity_id: string;
        outcome: string;
        last_error: string | null;
      }>(
        `SELECT idempotency_key,
                operation,
                entity_id::text AS entity_id,
                outcome,
                error_code AS last_error
         FROM passenger.payment_idempotency_keys
         ORDER BY idempotency_key ASC`,
      ),
    ]);

    return {
      pspTokens: pspTokens.rows,
      bookingHistories: bookingHistories.rows,
      ownedOrders: ownedOrders.rows,
      completionOutbox: completionOutbox.rows,
      electronicReceipts: electronicReceipts.rows,
      chargeRecords: chargeRecords.rows.map((row) => ({
        ...row,
        amount_minor: Number(row.amount_minor),
        attempt_count: Number(row.attempt_count),
      })),
      billingPayments: billingPayments.rows.map((row) => ({
        ...row,
        amount_minor: Number(row.amount_minor),
      })),
      idempotencyKeys: idempotencyKeys.rows,
    };
  }

  async function close() {
    try {
      await owned.onModuleDestroy();
    } catch {
      // ignore shutdown error during teardown
    }
    try {
      await app.close();
    } finally {
      await pg.close();
    }
  }

  return {
    pg,
    app,
    apiOrigin,
    passengerId: auth.owner,
    accessToken: auth.session.accessToken,
    refreshToken: auth.session.refreshToken,
    identity: auth.identity,
    fares,
    booking,
    multi,
    owned,
    certificates,
    requestJson,
    requestRaw,
    createQuote,
    completeProductOrder,
    inspectDatabaseState,
    close,
  };
}
