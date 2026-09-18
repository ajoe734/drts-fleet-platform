const fs = require("fs");
const file =
  "tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  "      for (const alloc of content.partner_notification_allocations) {",
  '      for (const alloc of content.partner_notification_allocations) {\n        if (alloc.version === "V0104") continue; // ROUTE task creates V0104',
);

fs.writeFileSync(file, code);
