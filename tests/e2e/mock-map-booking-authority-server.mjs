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

let lastTenantBookingCommand = null;

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

  if (
    req.method === "POST" &&
    url.pathname === "/api/partner/ingress/handoff"
  ) {
    json(res, 200, {
      data: {
        accessToken: "handoff-token",
        tokenType: "Bearer",
        expiresIn: "15m",
        partnerEntrySlug: "ctbc",
        drtsPassengerId: "passenger-embed-001",
        identity: {
          actorType: "referral_passenger",
          actorId: "passenger-embed-001",
          realm: "partner",
          authMode: "jwt_bearer",
          roleFamilies: ["partner"],
          roles: ["partner_booking"],
          scopes: ["partner:book"],
          tenantId: "tenant-ctbc",
          partnerId: "partner-ctbc",
          partnerProgramId: "program-ctbc-airport",
          partnerEntrySlug: "ctbc",
          drtsPassengerId: "passenger-embed-001",
        },
      },
      meta: {
        requestId: "req-mock-handoff",
        timestamp: "2026-07-26T00:00:00.000Z",
      },
    });
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname === "/api/partner/eligibility/verify"
  ) {
    json(res, 200, {
      data: {
        eligibilityVerificationId: "elig-embed-001",
        verificationStatus: "eligible",
      },
      meta: {
        requestId: "req-mock-eligibility",
        timestamp: "2026-07-26T00:00:01.000Z",
      },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tenant/bookings") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      lastTenantBookingCommand = JSON.parse(body || "{}");
      json(res, 200, {
        data: {
          bookingId: "booking-embed-001",
          orderId: "order-embed-001",
          eligibilityVerificationId:
            lastTenantBookingCommand.eligibilityVerificationId ?? null,
        },
        meta: {
          requestId: "req-mock-create-booking",
          timestamp: "2026-07-26T00:00:02.000Z",
        },
      });
    });
    return;
  }

  if (
    req.method === "GET" &&
    url.pathname === "/api/tenant/bookings/booking-embed-001"
  ) {
    json(res, 200, {
      data: {
        bookingId: "booking-embed-001",
        orderId: "order-embed-001",
        orderStatus: "created",
        reservationWindowStart:
          lastTenantBookingCommand?.reservationWindowStart ??
          "2026-07-27T21:30:00.000Z",
      },
      meta: {
        requestId: "req-mock-booking-read",
        timestamp: "2026-07-26T00:00:03.000Z",
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/orders/order-embed-001") {
    json(res, 200, {
      data: {
        orderId: "order-embed-001",
        orderNo: "ORD-EMBED-001",
        status: "created",
        pickup: lastTenantBookingCommand?.pickup ?? {
          address: "台北市信義區松仁路 100 號",
          surface: "partner_booking",
        },
        dropoff: lastTenantBookingCommand?.dropoff ?? {
          address: "桃園 T2 · 第二航廈 出發接送區",
          surface: "partner_booking",
        },
        etaSnapshot: {
          etaMinutes: 12,
          calculatedAt: "2026-07-26T00:00:04.000Z",
        },
      },
      meta: {
        requestId: "req-mock-order-read",
        timestamp: "2026-07-26T00:00:04.000Z",
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
