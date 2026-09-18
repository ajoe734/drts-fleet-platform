const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";
let code = fs.readFileSync(file, "utf8");

const regex1 =
  /buildAndPersistMultiTaxiRide\(\s*command,\s*authorization,\s*requestedPickupAt,\s*identity,\s*requestId,\s*callContext,\s*\);/;
code = code.replace(
  regex1,
  "buildAndPersistMultiTaxiRide(\n      command,\n      authorization,\n      requestedPickupAt,\n      identity,\n      requestId,\n      callContext,\n      partnerNotificationContextFactory\n    );",
);

const regex2 =
  /private buildAndPersistMultiTaxiRide\(\s*command: CreateMultiTaxiRideCommand,\s*authorization: MultiTaxiOperatingAuthorizationRecord,\s*requestedPickupAt: string,\s*identity: BootstrapRequestIdentity \| null \| undefined,\s*requestId: string \| undefined,\s*callContext: MultiTaxiCallContext \| undefined,\s*\): OwnedOrderRecord \{/;
code = code.replace(
  regex2,
  "private buildAndPersistMultiTaxiRide(\n    command: CreateMultiTaxiRideCommand,\n    authorization: MultiTaxiOperatingAuthorizationRecord,\n    requestedPickupAt: string,\n    identity: BootstrapRequestIdentity | null | undefined,\n    requestId: string | undefined,\n    callContext: MultiTaxiCallContext | undefined,\n    partnerNotificationContextFactory?: (orderId: string) => { route: Record<string, any>; sequence: Record<string, any> }\n  ): OwnedOrderRecord {",
);

fs.writeFileSync(file, code);
