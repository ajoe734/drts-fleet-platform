import http from "node:http";

const PORT = Number(process.env.MAP_BOOKING_AUTHORITY_PORT ?? "3001");

function json(res, status, body) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

const ctbcEntry = {
  partnerId: "partner-ctbc",
  partnerCode: "CTBC",
  partnerType: "bank",
  programId: "program-ctbc-airport",
  programCode: "CTBC-WE",
  tenantId: "tenant-ctbc",
  bankCode: "CTBC",
  entrySlug: "ctbc",
  displayName: "中國信託世界卡機場接送",
  businessDispatchSubtype: "credit_card_airport_transfer",
  authMode: "partner_session",
  eligibilityMode: "bank_card_inline",
  entryHost: "ctbc.partner.invalid",
  entryPath: "/ctbc",
  themeAccent: "#1B4FA0",
  brandingMetadata: {
    displayName: "中國信託世界卡機場接送",
    themeAccent: "#1B4FA0",
    supportEmail: "airport-service@ctbc.invalid",
    supportPhone: "0800-000-001",
  },
  eligibilityContract: null,
  status: "active",
  activeFlag: true,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  auditMetadata: {
    source: "mock_map_booking_authority",
    requestId: "req-mock-partner-entry",
    createdBy: "codex2",
    updatedBy: "codex2",
  },
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    json(res, 400, { error: { code: "BAD_REQUEST", message: "Missing URL." } });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/partner/entries/ctbc") {
    json(res, 200, {
      data: ctbcEntry,
      meta: {
        requestId: "req-mock-partner-entry",
        timestamp: "2026-07-03T00:00:00.000Z",
      },
    });
    return;
  }

  json(res, 404, {
    error: {
      code: "NOT_FOUND",
      message: `${req.method} ${url.pathname} is not mocked.`,
      retryable: false,
    },
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-map-booking-authority listening on ${PORT}`);
});
