const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  "callContext?: MultiTaxiCallContext,",
  "callContext?: MultiTaxiCallContext,\n    partnerNotificationContext?: { route: Record<string, any>; sequence: Record<string, any> },",
);

code = code.replace(
  "      { orders: [order], dispatchTraceLogs: [traceLog] },",
  "      { \n        orders: [order], \n        dispatchTraceLogs: [traceLog],\n        ...(partnerNotificationContext ? {\n          orderPartnerNotificationRoutes: [partnerNotificationContext.route],\n          partnerNotificationSequences: [partnerNotificationContext.sequence]\n        } : {})\n      },",
);

fs.writeFileSync(file, code);
