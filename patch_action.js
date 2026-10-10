const fs = require("fs");
const file = "apps/passenger-app-web/components/ride/passenger-ride-page.tsx";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  '    void requestPassengerRideAction<{\n      contactUri?: string | null;\n    }>(token, action, authMode === "token")',
  '    void requestPassengerRideAction(token, action, {}, authMode === "token")',
);

fs.writeFileSync(file, code);
