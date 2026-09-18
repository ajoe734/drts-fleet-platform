const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";
let code = fs.readFileSync(file, "utf8");

// Replace createMultiTaxiRide call to pass the factory
code = code.replace(
  /buildAndPersistMultiTaxiRide\([\s\S]*?authorization,\s*requestedPickupAt,\s*identity,\s*requestId,\s*callContext,\s*\);/,
  "buildAndPersistMultiTaxiRide(\n      command,\n      authorization,\n      requestedPickupAt,\n      identity,\n      requestId,\n      callContext,\n      partnerNotificationContextFactory\n    );",
);

// Add factory to buildAndPersistMultiTaxiRide signature
code = code.replace(
  /private buildAndPersistMultiTaxiRide\([\s\S]*?authorization: MultiTaxiOperatingAuthorizationRecord,\s*requestedPickupAt: string,\s*identity\?: BootstrapRequestIdentity \| null,\s*requestId\?: string,\s*callContext\?: MultiTaxiCallContext,\s*\) \{/,
  "private buildAndPersistMultiTaxiRide(\n    command: CreateMultiTaxiRideCommand,\n    authorization: MultiTaxiOperatingAuthorizationRecord,\n    requestedPickupAt: string,\n    identity?: BootstrapRequestIdentity | null,\n    requestId?: string,\n    callContext?: MultiTaxiCallContext,\n    partnerNotificationContextFactory?: (orderId: string) => { route: Record<string, any>; sequence: Record<string, any> }\n  ) {",
);

fs.writeFileSync(file, code);
