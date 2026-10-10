const fs = require("fs");
const file = "tests/unit/pax-web-shell-20261009/bff.test.ts";
let code = fs.readFileSync(file, "utf8");

const additionalMalicious = `      { method: "GET", path: ["rides", "123", "unknown_action"] }, // unknown ride action
      { method: "POST", path: ["rides", "123"] }, // POST rides/:id not allowed
      { method: "POST", path: ["rides", "123", "cancel", "extra"] }, // extra segment
`;

code = code.replace(
  '      { method: "GET", path: ["auth", "oauth", "google", "extra"] }, // extra segments',
  '      { method: "GET", path: ["auth", "oauth", "google", "extra"] }, // extra segments\n' +
    additionalMalicious,
);

const additionalValid = `      {
        method: "GET",
        path: ["rides"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "GET",
        path: ["rides", "active"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "GET",
        path: ["rides", "123"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "GET",
        path: ["rides", "123", "events"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "GET",
        path: ["rides", "123", "receipt"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["rides", "123", "cancel"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["rides", "123", "ratings"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["rides", "123", "contact"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["rides", "123", "complaints"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
`;

code = code.replace(
  '      {\n        method: "POST",\n        path: ["rides"],',
  additionalValid +
    '      {\n        method: "POST",\n        path: ["rides"],',
);

fs.writeFileSync(file, code);
