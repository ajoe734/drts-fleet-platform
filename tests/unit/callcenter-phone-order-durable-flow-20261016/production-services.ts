import { EventEmitter } from "node:events";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { IdempotencyRepository } from "../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency/idempotency.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

/** Composition only. The supplied database is the executor boundary; every
 * tested writer, reader, mutation and idempotency implementation is production. */
export function productionServices(database: DatabaseService) {
  const audit = new AuditNotificationService();
  const calls = new CallcenterService(
    audit,
    new CallcenterRepository(database),
  );
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const repository = new OwnedMobilityRepository(database);
  const owned = new OwnedMobilityService(
    new RegulatoryRegistryService(
      events,
      audit,
      new DriverProfileService(audit),
    ),
    audit,
    calls,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    events,
    repository,
  );
  owned.registerCallRecordingListeners();
  const controller = new CallcenterController(
    calls,
    {} as never,
    {} as never,
    {} as never,
  );
  const idempotency = new IdempotencyRepository(database);
  const orderController = new OwnedMobilityController(
    owned,
    new IdempotencyService(idempotency),
  );
  return {
    audit,
    calls,
    events,
    repository,
    owned,
    controller,
    idempotency,
    orderController,
  };
}

export const phoneCommand = (callId: string) => ({
  callId,
  agentId: "synthetic-agent",
  passenger: { name: "Synthetic Caller", phone: "+886900000203" },
  pickup: { address: "Synthetic pickup" },
  dropoff: { address: "Synthetic dropoff" },
});
