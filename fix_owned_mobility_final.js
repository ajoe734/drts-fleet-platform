const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";
let code = fs.readFileSync(file, "utf8");

// 1. Update createMultiTaxiRide signature
const regex1 =
  /createMultiTaxiRide\(\s*command: CreateMultiTaxiRideCommand,\s*authorization: MultiTaxiOperatingAuthorizationRecord,\s*identity\?: BootstrapRequestIdentity \| null,\s*requestId\?: string,\s*callContext\?: MultiTaxiCallContext,\s*\): MaybePromise<OwnedOrderRecord> \{/;
code = code.replace(
  regex1,
  "createMultiTaxiRide(\n    command: CreateMultiTaxiRideCommand,\n    authorization: MultiTaxiOperatingAuthorizationRecord,\n    identity?: BootstrapRequestIdentity | null,\n    requestId?: string,\n    callContext?: MultiTaxiCallContext,\n    partnerNotificationContextFactory?: (orderId: string) => { route: Record<string, any>; sequence: Record<string, any> }\n  ): MaybePromise<OwnedOrderRecord> {",
);

// 2. Pass to buildAndPersistMultiTaxiRide
const regex2 =
  /this\.buildAndPersistMultiTaxiRide\(\s*command,\s*authorization,\s*requestedPickupAt,\s*identity,\s*requestId,\s*callContext,\s*\)/g;
code = code.replace(
  regex2,
  "this.buildAndPersistMultiTaxiRide(\n      command,\n      authorization,\n      requestedPickupAt,\n      identity,\n      requestId,\n      callContext,\n      partnerNotificationContextFactory\n    )",
);

// 3. Update buildAndPersistMultiTaxiRide signature
const regex3 =
  /private buildAndPersistMultiTaxiRide\(\s*command: CreateMultiTaxiRideCommand,\s*authorization: MultiTaxiOperatingAuthorizationRecord,\s*requestedPickupAt: string,\s*identity: BootstrapRequestIdentity \| null \| undefined,\s*requestId: string \| undefined,\s*callContext: MultiTaxiCallContext \| undefined,\s*\): OwnedOrderRecord \{/;
code = code.replace(
  regex3,
  "private buildAndPersistMultiTaxiRide(\n    command: CreateMultiTaxiRideCommand,\n    authorization: MultiTaxiOperatingAuthorizationRecord,\n    requestedPickupAt: string,\n    identity: BootstrapRequestIdentity | null | undefined,\n    requestId: string | undefined,\n    callContext: MultiTaxiCallContext | undefined,\n    partnerNotificationContextFactory?: (orderId: string) => { route: Record<string, any>; sequence: Record<string, any> }\n  ): OwnedOrderRecord {",
);

// 4. Update the persistChanges call in buildAndPersistMultiTaxiRide
const oldPersist = `    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "create_multi_taxi_ride",
    );`;
const newPersist = `    this.persistChanges(
      { 
        orders: [order], 
        dispatchTraceLogs: [traceLog],
        ...(partnerNotificationContextFactory ? {
          orderPartnerNotificationRoutes: [partnerNotificationContextFactory(order.orderId).route],
          partnerNotificationSequences: [partnerNotificationContextFactory(order.orderId).sequence]
        } : {})
      },
      "create_multi_taxi_ride",
    );`;
code = code.replace(oldPersist, newPersist);

fs.writeFileSync(file, code);
