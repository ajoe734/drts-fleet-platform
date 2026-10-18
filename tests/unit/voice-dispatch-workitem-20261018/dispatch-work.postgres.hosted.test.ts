import { EventEmitter } from "node:events";
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
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { VehicleEligibilityRepository } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VoiceBookingCommandService } from "../../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
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
        undefined,
        undefined,
        undefined,
        undefined,
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
      await initialize(a);
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
