const fs = require("fs");
const file = "apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts";
let code = fs.readFileSync(file, "utf8");

const additionalChecks = `
  if (method === "GET" && fullPath === "rides") return true;
  if (method === "GET" && fullPath === "rides/active") return true;
  if (method === "GET" && path.length === 2 && path[0] === "rides") return true; // GET rides/:id
  if (method === "GET" && path.length === 3 && path[0] === "rides" && path[2] === "events") return true; // GET rides/:id/events
  if (method === "GET" && path.length === 3 && path[0] === "rides" && path[2] === "receipt") return true; // GET rides/:id/receipt
  if (method === "POST" && path.length === 3 && path[0] === "rides" && path[2] === "cancel") return true; // POST rides/:id/cancel
  if (method === "POST" && path.length === 3 && path[0] === "rides" && path[2] === "ratings") return true; // POST rides/:id/ratings
  if (method === "POST" && path.length === 3 && path[0] === "rides" && path[2] === "contact") return true; // POST rides/:id/contact
  if (method === "POST" && path.length === 3 && path[0] === "rides" && path[2] === "complaints") return true; // POST rides/:id/complaints
`;

code = code.replace(
  '  if (method === "POST" && fullPath === "rides") return true;',
  '  if (method === "POST" && fullPath === "rides") return true;\n' +
    additionalChecks,
);

fs.writeFileSync(file, code);
