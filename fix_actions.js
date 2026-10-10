const fs = require("fs");
const file = "apps/passenger-app-web/components/ride/passenger-ride-page.tsx";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  /void[\s\S]*?\}>\(token, action, authMode === "token"\)/m,
  'void requestPassengerRideAction(token, action, {}, authMode === "token")',
);

fs.writeFileSync(file, code);
