import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../../apps/api/src/common/idempotency";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ServiceAreaRepository } from "../../../apps/api/src/modules/service-area/service-area.repository";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { EligibilityContextResolver } from "../../../apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { VehicleEligibilityRepository } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VoiceBookingCommandService } from "../../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import {
  createVoiceBookingResultDelivery,
  type VoiceBookingResultDelivery,
} from "../../../apps/api/src/modules/voice-booking/voice-booking-result-delivery";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { seedVoiceDispatchWorkFixture } from "../../support/voice-dispatch-workitem-postgres-fixture";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

// Hosted only: all formal migrations and real booking/queue/order/task/ledger
// repositories. Qualification inventory and original voice prerequisite ports
// are synthetic; no PSTN, media, provider or full background-runtime claim.
describe.skipIf(!hostedPaymentEnabled)(
  "committed voice dispatch work on full PostgreSQL schema",
  () => {
    const h = new PaymentPostgresHarness();
    const peers: ReturnType<typeof makePeer>[] = [];
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterEach(async () => {
      for (const p of peers.splice(0)) {
        await p.owned.onModuleDestroy();
        await p.registry.onModuleDestroy();
        await p.events.onModuleDestroy();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);

    function makePeer(database: DatabaseService) {
      const audit = new AuditNotificationService();
      const products = new ServiceProductService(
        audit,
        new ServiceProductRepository(database),
      );
      const profiles = new DriverProfileService(
        audit,
        new DriverProfileRepository(database),
      );
      const registryStore = new RegulatoryRegistryRepository(database);
      const ops = new OpsDispatchEventsService(
        new EventEmitter() as never,
        database,
      );
      const registry = new RegulatoryRegistryService(
        ops,
        audit,
        profiles,
        registryStore,
      );
      const eligibility = new VehicleEligibilityService(
        registry,
        audit,
        new VehicleEligibilityRepository(database),
        products,
      );
      const areas = new ServiceAreaService(
        new ServiceAreaRepository(database),
        audit,
      );
      const runtime = new RuntimeEligibilityEvaluator(
        new EligibilityContextResolver(registry, products, eligibility),
        audit,
        new VehicleEligibilityRepository(database),
      );
      const events = new OwnedMobilityTaskEventsService(
        new EventEmitter() as never,
        database,
      );
      const repository = new OwnedMobilityRepository(database);
      const voice = new VoiceBookingRepository(database);
      const owned = new OwnedMobilityService(
        registry,
        audit,
        {
          registerRecordingAttachmentListener() {},
          registerRecordingStateChangeListener() {},
        } as never,
        events,
        ops,
        repository,
        undefined,
        eligibility,
        products,
        undefined,
        runtime,
        undefined,
        undefined,
        areas,
        undefined,
        new IdempotencyService(new IdempotencyRepository(database)),
        voice,
      );
      const peer = {
        database,
        products,
        profiles,
        registryStore,
        registry,
        eligibility,
        areas,
        events,
        owned,
        repository,
        voice,
      };
      return peer;
    }

    async function initialize(p: ReturnType<typeof makePeer>) {
      await p.products.onModuleInit();
      await p.profiles.onModuleInit();
      await p.registry.onModuleInit();
      await p.eligibility.onModuleInit();
      await p.areas.onModuleInit();
      await p.owned.onModuleInit();
      await p.events.onModuleInit();
    }

    async function seededPeers() {
      const a = makePeer(h.database);
      const b = makePeer(h.peerDatabase());
      peers.push(a, b);
      await a.registryStore.persistChanges({
        vehicles: a.registry.listVehicles(),
        drivers: a.registry.listDrivers(),
        supplyPairs: a.registry.listSupplyPairs(),
        contracts: a.registry.listContracts(),
        policies: a.registry.listPolicies(),
        exclusivities: a.registry.listExclusivities(),
      });
      // The committed-booking fixture's synthetic product port does not
      // configure the dispatch authority. Persist that prerequisite through
      // its original service before both actual peers load it.
      await a.products.upsertRuntimeProfilePolicy({
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
        active: true,
        effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
        effectiveUntil: null,
      });
      await initialize(a);
      // External GPS is synthetic, but its original registry write and peer
      // readback are real. Retain the actual autonomous freshness/policy gates.
      await a.registry.recordDriverLocation({
        driverId: "drv-demo-001",
        lat: 25.03,
        lng: 121.56,
        accuracyM: 5,
        recordedAt: new Date().toISOString(),
      });
      await initialize(b);
      return { a, b };
    }

    async function commitVoiceOrder(p: ReturnType<typeof makePeer>) {
      const f = await seedVoiceDispatchWorkFixture(h.pool!);
      const commands = new VoiceBookingCommandService(
        p.voice,
        f.makeEvidence(p.voice) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const accepted = await commands.accept("fixture-provider", f.request);
      const committed = await new VoiceCommandRunnerService(
        commands,
        p.repository,
      ).execute(accepted.commandId);
      expect(committed.status).toBe("succeeded");
      expect(committed.orderId).toBeTruthy();
      return { f, committed };
    }

    function runnerFor(
      p: ReturnType<typeof makePeer>,
      f: Awaited<ReturnType<typeof seedVoiceDispatchWorkFixture>>,
      audit?: AuditNotificationService,
      delivery?: VoiceBookingResultDelivery,
    ) {
      const commands = new VoiceBookingCommandService(
        p.voice,
        f.makeEvidence(p.voice) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      return new VoiceCommandRunnerService(
        commands,
        p.repository,
        p.owned.getAutonomousDispatchExecutor(),
        undefined,
        undefined,
        undefined,
        audit,
        delivery,
      );
    }

    async function linkedRows(orderId: string) {
      return (
        await h.pool!.query(
          `SELECT o.order_id, j.dispatch_job_id, a.assignment_id, t.task_id,
      t.status AS task_status, w.status AS work_status
      FROM ops.phase1_owned_orders o
      JOIN ops.phase1_dispatch_jobs j USING(order_id)
      JOIN ops.phase1_dispatch_assignments a ON a.order_id=o.order_id AND a.dispatch_job_id=j.dispatch_job_id
      JOIN ops.phase1_driver_tasks t ON t.order_id=o.order_id AND t.assignment_id=a.assignment_id
      JOIN voice.command_receipt r ON r.order_id=o.order_id
      JOIN voice.work_item w ON w.command_id=r.command_id AND w.work_type='request_dispatch'
      WHERE o.order_id=$1`,
          [orderId],
        )
      ).rows;
    }

    it("persists an explicitly simulated notification receipt for the original booking result", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const delivery = createVoiceBookingResultDelivery({
        VOICE_BOOKING_RESULT_DELIVERY: "simulation",
      })!;
      const result = await runnerFor(
        b,
        f,
        new AuditNotificationService(new AuditLogRepository(b.database)),
        delivery,
      ).runOnce({ supportedTypes: ["notify_booking_result"] });
      expect(result).toMatchObject({
        success: true,
        result: {
          status: "simulated",
          orderId: committed.orderId,
          provider: "simulation",
        },
      });
      const rows = await h.pool!.query(
        `SELECT a.audit_id, a.resource_id, a.new_value, w.status AS work_status
         FROM admin.audit_logs a JOIN voice.work_item w
         ON w.command_id::text=a.request_id AND w.work_type='notify_booking_result'
         WHERE a.request_id=$1 AND a.action_name='voice.booking.result_notification'`,
        [committed.commandId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        resource_id: committed.orderId,
        work_status: "completed",
        new_value: {
          commandId: committed.commandId,
          orderId: committed.orderId,
          bookingStatus: "succeeded",
          deliveryStatus: "simulated",
          provider: "simulation",
          simulated: true,
        },
      });
      expect(result!.result).toMatchObject({
        auditId: rows.rows[0].audit_id,
        providerMessageId: rows.rows[0].new_value.providerMessageId,
      });
    }, 30000);

    it("a fresh peer replays a lost notification acknowledgement without a duplicate durable receipt", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const simulation = () =>
        createVoiceBookingResultDelivery({
          VOICE_BOOKING_RESULT_DELIVERY: "simulation",
        })!;
      const first = runnerFor(
        b,
        f,
        new AuditNotificationService(new AuditLogRepository(b.database)),
        simulation(),
      );
      first.completeWorkItemWithDomainState = async () => {
        throw new Error("injected notification ACK loss");
      };
      expect(
        await first.runOnce({ supportedTypes: ["notify_booking_result"] }),
      ).toMatchObject({ success: false });
      const before = await h.pool!.query(
        `SELECT audit_id, new_value FROM admin.audit_logs WHERE request_id=$1 AND action_name='voice.booking.result_notification'`,
        [committed.commandId],
      );
      expect(before.rows).toHaveLength(1);
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await initialize(restarted);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      expect(
        await runnerFor(
          restarted,
          f,
          new AuditNotificationService(
            new AuditLogRepository(restarted.database),
          ),
          simulation(),
        ).runOnce({ supportedTypes: ["notify_booking_result"] }),
      ).toMatchObject({
        success: true,
        result: {
          status: "simulated",
          auditId: before.rows[0].audit_id,
          providerMessageId: before.rows[0].new_value.providerMessageId,
        },
      });
      const after = await h.pool!.query(
        `SELECT audit_id, new_value FROM admin.audit_logs WHERE request_id=$1 AND action_name='voice.booking.result_notification'`,
        [committed.commandId],
      );
      expect(after.rows).toEqual(before.rows);
      const work = await h.pool!.query(
        `SELECT status,attempt FROM voice.work_item WHERE command_id=$1 AND work_type='notify_booking_result'`,
        [committed.commandId],
      );
      expect(work.rows).toEqual([{ status: "completed", attempt: 2 }]);
    }, 30000);

    it("Nest bootstrap continues booking work after a durable call close, without an HTTP listener or manual runOnce", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const sessionStore = new VoiceSessionRepository(a.database);
      const session = await sessionStore.findSessionById(
        f.request.voiceSessionId,
      );
      const closed = await new VoiceSessionService(sessionStore).closeSession(
        f.request.voiceSessionId,
        session!.sessionVersion,
      );
      expect(closed.dialogState).toBe("closed");
      expect(closed.mediaState).toBe("ended");
      const runner = runnerFor(
        b,
        f,
        new AuditNotificationService(new AuditLogRepository(b.database)),
        createVoiceBookingResultDelivery({
          VOICE_BOOKING_RESULT_DELIVERY: "simulation",
        })!,
      );
      const require = createRequire(
        new URL("../../../apps/api/package.json", import.meta.url),
      );
      const { NestFactory } = require("@nestjs/core");
      const previous = process.env.VOICE_BACKGROUND_RUNNER_ENABLED;
      let app: { close(): Promise<void> } | undefined;
      try {
        process.env.VOICE_BACKGROUND_RUNNER_ENABLED = "true";
        app = await NestFactory.createApplicationContext(
          {
            module: class HostedVoiceRunnerLifecycle {},
            providers: [
              { provide: VoiceCommandRunnerService, useValue: runner },
            ],
          },
          { logger: false, abortOnError: false },
        );
        await expect
          .poll(
            async () => {
              const result = await h.pool!.query(
                `SELECT work_type,status FROM voice.work_item WHERE command_id=$1
             AND work_type IN ('request_dispatch','publish_booking_audit','notify_booking_result') ORDER BY work_type`,
                [committed.commandId],
              );
              return result.rows;
            },
            { timeout: 15000, interval: 100 },
          )
          .toEqual([
            { work_type: "notify_booking_result", status: "completed" },
            { work_type: "publish_booking_audit", status: "completed" },
            { work_type: "request_dispatch", status: "completed" },
          ]);
        expect(await linkedRows(committed.orderId!)).toHaveLength(1);
        const notImplemented = await h.pool!.query(
          `SELECT status FROM voice.work_item WHERE voice_session_id=$1 AND work_type='finalize_recording'`,
          [f.request.voiceSessionId],
        );
        expect(notImplemented.rows).toEqual([{ status: "pending" }]);
        const audits = await h.pool!.query(
          `SELECT action_name FROM admin.audit_logs WHERE request_id=$1 ORDER BY action_name`,
          [committed.commandId],
        );
        expect(audits.rows).toEqual([
          { action_name: "voice.booking.created" },
          { action_name: "voice.booking.result_notification" },
        ]);
      } finally {
        await app?.close();
        if (previous === undefined)
          delete process.env.VOICE_BACKGROUND_RUNNER_ENABLED;
        else process.env.VOICE_BACKGROUND_RUNNER_ENABLED = previous;
      }
      expect(runner.running).toBe(false);
      expect(await runner.runOnce()).toBeNull();
    }, 30000);

    it("publishes the original immutable booking audit into the canonical PostgreSQL audit feed", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const sink = new AuditNotificationService(
        new AuditLogRepository(b.database),
      );
      const result = await runnerFor(b, f, sink).runOnce({
        supportedTypes: ["publish_booking_audit"],
      });
      expect(result).toMatchObject({
        success: true,
        result: {
          status: "published",
          commandId: committed.commandId,
          orderId: committed.orderId,
        },
      });
      const rows = await h.pool!.query(
        `SELECT a.audit_id, a.resource_id, a.new_value, w.status AS work_status
         FROM admin.audit_logs a
         JOIN voice.work_item w ON w.command_id::text=a.request_id AND w.work_type='publish_booking_audit'
         WHERE a.request_id=$1 AND a.action_name='voice.booking.created'`,
        [committed.commandId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        resource_id: committed.orderId,
        work_status: "completed",
        new_value: {
          actorType: "voice_agent",
          actorId: f.authority.actorId,
          commandId: committed.commandId,
          orderId: committed.orderId,
          resourceScopeId: f.scopeId,
          snapshotHash: f.request.snapshotHash,
        },
      });
      expect(result!.result).toMatchObject({ auditId: rows.rows[0].audit_id });
    }, 30000);

    it("lost audit-work acknowledgement replays on a fresh peer without duplicating the canonical audit", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const intentBefore = await h.pool!.query(
        `SELECT record FROM voice.booking_audit_intent WHERE command_id=$1`,
        [committed.commandId],
      );
      const first = runnerFor(
        b,
        f,
        new AuditNotificationService(new AuditLogRepository(b.database)),
      );
      first.completeWorkItemWithDomainState = async () => {
        throw new Error("injected audit-work acknowledgement loss");
      };
      expect(
        await first.runOnce({ supportedTypes: ["publish_booking_audit"] }),
      ).toMatchObject({
        success: false,
        error: "injected audit-work acknowledgement loss",
      });
      const before = await h.pool!.query(
        `SELECT audit_id FROM admin.audit_logs WHERE request_id=$1 AND action_name='voice.booking.created'`,
        [committed.commandId],
      );
      expect(before.rows).toHaveLength(1);
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await initialize(restarted);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      expect(
        await runnerFor(
          restarted,
          f,
          new AuditNotificationService(
            new AuditLogRepository(restarted.database),
          ),
        ).runOnce({ supportedTypes: ["publish_booking_audit"] }),
      ).toMatchObject({
        success: true,
        result: { status: "published", auditId: before.rows[0].audit_id },
      });
      const after = await h.pool!.query(
        `SELECT audit_id FROM admin.audit_logs WHERE request_id=$1 AND action_name='voice.booking.created'`,
        [committed.commandId],
      );
      expect(after.rows).toEqual(before.rows);
      const intentAfter = await h.pool!.query(
        `SELECT record FROM voice.booking_audit_intent WHERE command_id=$1`,
        [committed.commandId],
      );
      expect(intentAfter.rows).toEqual(intentBefore.rows);
    }, 30000);

    it("a preinitialized peer consumes the committed work into the same persisted order, offer and task", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      expect(() => b.owned.getOrder(committed.orderId!)).toThrow();
      const result = await runnerFor(b, f).runOnce({
        supportedTypes: ["request_dispatch"],
      });
      expect(result).toMatchObject({
        success: true,
        commandId: committed.commandId,
        result: { status: "offered", orderId: committed.orderId },
      });
      const rows = await linkedRows(committed.orderId!);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        order_id: committed.orderId,
        task_status: "pending_acceptance",
        work_status: "completed",
      });
      expect(result!.result).toMatchObject({
        taskId: rows[0].task_id,
        assignmentId: rows[0].assignment_id,
        dispatchJobId: rows[0].dispatch_job_id,
      });
      const capacity = await h.pool!.query(
        `SELECT resource_type,status FROM ops.dispatch_resource_reservations
      WHERE assignment_id=$1 ORDER BY resource_type`,
        [rows[0].assignment_id],
      );
      expect(capacity.rows).toEqual([
        { resource_type: "driver", status: "held" },
        { resource_type: "vehicle", status: "held" },
      ]);
    }, 30000);

    it("no-supply work preserves the durable retry queue across fresh-peer replay and supply recovery", async () => {
      const { a } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      for (const driver of a.registry.listDrivers()) {
        await a.registry.updateDriverWorkStateFromPersistence(driver.driverId, {
          workState: "offline",
        });
      }
      const cold = makePeer(h.peerDatabase());
      peers.push(cold);
      await initialize(cold);
      const result = await runnerFor(cold, f).runOnce({
        supportedTypes: ["request_dispatch"],
      });
      expect(result).toMatchObject({
        success: true,
        result: { status: "no_supply", orderId: committed.orderId },
      });
      const before = await h.pool!.query(
        `SELECT o.record AS order_record, j.dispatch_job_id, j.status AS job_status
         FROM ops.phase1_owned_orders o JOIN ops.phase1_dispatch_jobs j USING(order_id)
         WHERE o.order_id=$1`,
        [committed.orderId],
      );
      expect(before.rows).toHaveLength(1);
      expect(before.rows[0].order_record).toMatchObject({
        status: "delayed_queue",
        queueFamily: "delayed_retry_queue",
        dispatchAttemptCount: 1,
      });
      expect(before.rows[0].job_status).toBe("no_supply");
      await a.registry.updateDriverWorkStateFromPersistence("drv-demo-001", {
        workState: "available",
      });
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await initialize(restarted);
      expect(
        await restarted.owned.executeAutoDispatch(committed.orderId!),
      ).toMatchObject({
        status: "no_supply",
        dispatchJobId: before.rows[0].dispatch_job_id,
      });
      const after = await h.pool!.query(
        `SELECT record FROM ops.phase1_owned_orders WHERE order_id=$1`,
        [committed.orderId],
      );
      expect(after.rows[0].record).toEqual(before.rows[0].order_record);
      const tasks = await h.pool!.query(
        `SELECT task_id FROM ops.phase1_driver_tasks WHERE order_id=$1`,
        [committed.orderId],
      );
      expect(tasks.rows).toHaveLength(0);
    }, 30000);

    it("supply exhausted after matching commits the original no-supply policy on the same job before completing work", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      await b.owned.prepareOrderAction({ orderId: committed.orderId! });
      const job = await b.owned.dispatchOrder(
        committed.orderId!,
        { mode: "auto" },
        undefined,
        "before-supply-disappears",
        { required: true },
      );
      expect(job.status).toBe("matching");
      for (const driver of a.registry.listDrivers()) {
        await a.registry.updateDriverWorkStateFromPersistence(driver.driverId, {
          workState: "offline",
        });
      }
      expect(
        await runnerFor(b, f).runOnce({ supportedTypes: ["request_dispatch"] }),
      ).toMatchObject({
        success: true,
        result: { status: "no_supply", dispatchJobId: job.dispatchJobId },
      });
      const rows = await h.pool!.query(
        `SELECT o.record AS order_record, j.dispatch_job_id, j.status AS job_status, w.status AS work_status
         FROM ops.phase1_owned_orders o JOIN ops.phase1_dispatch_jobs j USING(order_id)
         JOIN voice.command_receipt r ON r.order_id=o.order_id
         JOIN voice.work_item w ON w.command_id=r.command_id AND w.work_type='request_dispatch'
         WHERE o.order_id=$1`,
        [committed.orderId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        dispatch_job_id: job.dispatchJobId,
        job_status: "no_supply",
        work_status: "completed",
        order_record: {
          status: "delayed_queue",
          dispatchAttemptCount: 1,
          noSupplyEscalation: {
            dispatchJobId: job.dispatchJobId,
            escalationAction: "move_to_delayed_queue",
          },
        },
      });
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await initialize(restarted);
      expect(restarted.owned.getOrder(committed.orderId!)).toMatchObject({
        status: "delayed_queue",
        dispatchAttemptCount: 1,
      });
    }, 30000);

    it("lost queue acknowledgement resumes on a fresh peer without a second job, assignment or task", async () => {
      const { a, b } = await seededPeers();
      const { f, committed } = await commitVoiceOrder(a);
      const first = runnerFor(b, f);
      // Fault only the queue acknowledgement transaction after the real domain
      // effect committed. No order, assignment, SQL result or clock is replaced.
      first.completeWorkItemWithDomainState = async () => {
        throw new Error(
          "injected queue acknowledgement loss after offer commit",
        );
      };
      expect(
        await first.runOnce({ supportedTypes: ["request_dispatch"] }),
      ).toMatchObject({
        success: false,
        error: "injected queue acknowledgement loss after offer commit",
      });
      const before = await linkedRows(committed.orderId!);
      expect(before).toHaveLength(1);
      expect(before[0].work_status).toBe("pending");
      const restarted = makePeer(h.peerDatabase());
      peers.push(restarted);
      await initialize(restarted);
      // Honour the original attempt-one real retry delay; do not edit run_after.
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const retried = await runnerFor(restarted, f).runOnce({
        supportedTypes: ["request_dispatch"],
      });
      expect(retried).toMatchObject({
        success: true,
        result: {
          status: "offered",
          orderId: committed.orderId,
          taskId: before[0].task_id,
          assignmentId: before[0].assignment_id,
          dispatchJobId: before[0].dispatch_job_id,
        },
      });
      const after = await linkedRows(committed.orderId!);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        ...before[0],
        work_status: "completed",
      });
    }, 30000);
  },
);
