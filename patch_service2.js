const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  "    partnerNotificationContext?: { route: Record<string, any>; sequence: Record<string, any> },",
  "    partnerNotificationContextFactory?: (orderId: string) => { route: Record<string, any>; sequence: Record<string, any> },",
);

code = code.replace(
  "          orderPartnerNotificationRoutes: [partnerNotificationContext.route],\n          partnerNotificationSequences: [partnerNotificationContext.sequence]",
  "          orderPartnerNotificationRoutes: [partnerNotificationContextFactory(order.orderId).route],\n          partnerNotificationSequences: [partnerNotificationContextFactory(order.orderId).sequence]",
);
code = code.replace(
  "...(partnerNotificationContext ? {",
  "...(partnerNotificationContextFactory ? {",
);

fs.writeFileSync(file, code);
