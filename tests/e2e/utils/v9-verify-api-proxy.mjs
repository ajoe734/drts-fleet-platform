import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT ?? "3401", 10);
const upstreamBaseUrl =
  process.env.DRTS_V9_VERIFY_UPSTREAM_API_URL ??
  "https://drts-dev-api-waji3fer3a-uc.a.run.app";

const now = () => new Date().toISOString();

function buildRefresh(dataFreshness = "fresh", staleAfterMs = 5_000) {
  return {
    generated_at: now(),
    stale_after_ms: staleAfterMs,
    data_freshness: dataFreshness,
    source: "sandbox",
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function buildTenantBooking(bookingId, orderId, overrides = {}) {
  return {
    booking_id: bookingId,
    order_id: orderId,
    tenant_id: "tenant-demo-001",
    partner_id: "partner-bank-demo-001",
    partner_program_id: "program-airport-alpha",
    partner_entry_slug: "bank-demo-alpha-airport",
    status: "active",
    service_bucket: "business_dispatch",
    business_dispatch_subtype: "credit_card_airport_transfer",
    booking_type: "oneway",
    reservation_window_start: "2026-06-28T08:30:00.000Z",
    reservation_window_end: "2026-06-28T09:30:00.000Z",
    recurrence_rule: null,
    modifiable_until: "2026-06-28T07:30:00.000Z",
    cancelable_until: "2026-06-28T07:30:00.000Z",
    pickup: {
      address: "88 Corporate HQ, Staging City",
      address_id: null,
    },
    dropoff: {
      address: "Staging International Airport, Terminal 2",
      address_id: null,
    },
    passenger: {
      name: "E2E Airport Passenger",
      phone: "+886900000098",
      passenger_id: null,
    },
    booked_by: {
      name: "E2E Airport Operator",
      email: "e2e-partner-cutover@example.com",
      staff_id: "e2e-staff-02",
    },
    onsite_contact: null,
    cost_center: null,
    vehicle_preference: null,
    benefit_reference: "benefit-e2e-cutover-20260628143000",
    direction: "dropoff",
    flight_no: "CI1439",
    terminal: "T2",
    luggage_count: null,
    notes: null,
    quoted_fare: {
      currency: "NTD",
      amount_minor: 150000,
    },
    quoted_fare_source: "platform_pricing_rule",
    quoted_fare_rule_version: "enterprise_dispatch.default.v1",
    manual_fare_override: null,
    approval_state: "not_required",
    approval_request_ids: [],
    compliance_gates: [],
    order_status: "created",
    created_at: "2026-06-28T07:30:00.000Z",
    updated_at: "2026-06-28T08:20:00.000Z",
    ...overrides,
  };
}

const tenantBookings = [
  buildTenantBooking("booking-avf-001", "order-avf-001"),
  buildTenantBooking("booking-avf-002", "order-avf-002", {
    pickup: {
      address: "North Gate Office Park, Sandbox District",
      address_id: null,
    },
    dropoff: {
      address: "Tesla ODD Loading Bay, Sector 7",
      address_id: null,
    },
    passenger: {
      name: "Fallback Continuation Rider",
      phone: "+886900000099",
      passenger_id: null,
    },
    reservation_window_start: "2026-06-28T10:00:00.000Z",
    reservation_window_end: "2026-06-28T11:00:00.000Z",
    updated_at: "2026-06-28T10:12:00.000Z",
  }),
];

const tenantBookingsById = new Map(
  tenantBookings.map((booking) => [booking.booking_id, booking]),
);

function buildProjection(bookingId, orderId, overrides = {}) {
  return {
    booking_id: bookingId,
    order_id: orderId,
    sandbox_trip_id: orderId,
    audience: "tenant",
    fulfillment_mode: "human_fallback",
    state: "assigned",
    status_code: "human_fallback_assigned",
    messages: [
      {
        message_code: "sandbox_fulfillment.human_fallback_active",
        category: "info",
      },
    ],
    eta_minutes: 9,
    extra_charge_disclosed: false,
    provider_brand_disclosed: false,
    updated_at: "2026-06-28T08:20:00.000Z",
    ...overrides,
  };
}

const tenantProjectionsById = new Map([
  ["booking-avf-001", buildProjection("booking-avf-001", "order-avf-001")],
  [
    "booking-avf-002",
    buildProjection("booking-avf-002", "order-avf-002", {
      fulfillment_mode: "mixed",
      state: "in_trip",
      status_code: "vehicle_change_in_progress",
      messages: [
        {
          message_code:
            "sandbox_fulfillment.service_continues_with_human_driver",
          category: "info",
        },
      ],
      eta_minutes: 14,
      extra_charge_disclosed: true,
      updated_at: "2026-06-28T10:12:00.000Z",
    }),
  ],
]);

function buildOpsOrder(orderId, overrides = {}) {
  return {
    order_id: orderId,
    order_no: `O-${orderId.toUpperCase()}`,
    booking_id: `booking-${orderId}`,
    status: "driver_accepted",
    pickup: {
      address: "88 Corporate HQ, Staging City",
      address_id: null,
    },
    dropoff: {
      address: "Staging International Airport, Terminal 2",
      address_id: null,
    },
    passenger: {
      name: "E2E Airport Passenger",
      phone: "+886900000098",
      passenger_id: null,
    },
    eta_snapshot: {
      eta_minutes: 7,
      calculated_at: "2026-06-28T08:18:00.000Z",
    },
    passenger_disclosure: {
      message_code: "sandbox_fulfillment.human_fallback_active",
      requires_acknowledgement: true,
      acknowledged_at: null,
    },
    created_at: "2026-06-28T07:30:00.000Z",
    updated_at: "2026-06-28T08:18:00.000Z",
    ...overrides,
  };
}

const opsOrdersById = new Map([
  [
    "demo-order-ops-001",
    buildOpsOrder("demo-order-ops-001", {
      status: "driver_accepted",
      booking_id: "booking-avf-001",
    }),
  ],
  [
    "demo-order-ops-002",
    buildOpsOrder("demo-order-ops-002", {
      status: "created",
      booking_id: "booking-avf-002",
      passenger: {
        name: "Fallback Exception Rider",
        phone: "+886900000097",
        passenger_id: null,
      },
      eta_snapshot: {
        eta_minutes: 12,
        calculated_at: "2026-06-28T08:16:00.000Z",
      },
      passenger_disclosure: {
        message_code: "sandbox_fulfillment.status_update_available",
        requires_acknowledgement: false,
        acknowledged_at: "2026-06-28T08:12:00.000Z",
      },
    }),
  ],
]);

const opsAlerts = [
  {
    alert_id: "roc-alert-human-fallback-001",
    alert_type: "human_fallback",
    status: "open",
    severity: "warning",
    title: "AV fallback reassignment in progress",
    summary: "Vehicle handoff is being coordinated for the same booking chain.",
    vehicle_id: "veh-sandbox-001",
    order_id: "demo-order-ops-001",
    sandbox_program_id: "sandbox-demo-001",
    opened_at: "2026-06-28T08:10:00.000Z",
    updated_at: "2026-06-28T08:18:00.000Z",
    available_actions: [
      {
        action: "fallback-to-human",
        enabled: false,
        disabled_reason_code: "already_in_progress",
        requires_reason: false,
        risk_level: "high",
      },
      {
        action: "open-incident",
        enabled: true,
        requires_reason: true,
        risk_level: "medium",
      },
      {
        action: "resolve",
        enabled: true,
        requires_reason: true,
        risk_level: "medium",
      },
      {
        action: "ack",
        enabled: true,
        requires_reason: false,
        risk_level: "low",
      },
    ],
  },
  {
    alert_id: "roc-alert-sandbox-exception-001",
    alert_type: "sandbox_exception",
    status: "acknowledged",
    severity: "critical",
    title: "Sandbox exception requires manual review",
    summary:
      "Routing and operating-area checks disagree with the assigned path.",
    vehicle_id: "veh-sandbox-002",
    order_id: "demo-order-ops-002",
    sandbox_program_id: "sandbox-demo-001",
    opened_at: "2026-06-28T08:05:00.000Z",
    updated_at: "2026-06-28T08:16:00.000Z",
    available_actions: [
      {
        action: "open-incident",
        enabled: true,
        requires_reason: true,
        risk_level: "high",
      },
      {
        action: "operational-hold",
        enabled: true,
        requires_reason: true,
        risk_level: "high",
      },
      {
        action: "start-evidence-freeze",
        enabled: true,
        requires_reason: true,
        risk_level: "high",
      },
      {
        action: "ack",
        enabled: true,
        requires_reason: false,
        risk_level: "low",
      },
    ],
  },
];

const opsTrips = [
  {
    trip_id: "sandbox-trip-001",
    order_id: "demo-order-ops-001",
    human_fallback_active: true,
  },
  {
    trip_id: "sandbox-trip-002",
    order_id: "demo-order-ops-002",
    human_fallback_active: false,
  },
];

function shouldStubTenantPath(pathname) {
  return (
    pathname === "/api/tenant/bookings" ||
    /^\/api\/tenant\/bookings\/[^/]+$/.test(pathname) ||
    /^\/api\/tenant\/bookings\/[^/]+\/sandbox-fulfillment$/.test(pathname)
  );
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function proxyToUpstream(request, response, url) {
  const upstreamUrl = new URL(url.pathname + url.search, upstreamBaseUrl);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (
      value === undefined ||
      key === "host" ||
      key === "connection" ||
      key === "content-length"
    ) {
      continue;
    }

    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = request.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readRequestBody(request);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      ...(body && body.length > 0 ? { body } : {}),
    });
    const payload = Buffer.from(await upstreamResponse.arrayBuffer());
    const contentType =
      upstreamResponse.headers.get("content-type") ??
      "application/octet-stream";

    response.writeHead(upstreamResponse.status, {
      "content-type": contentType,
      "content-length": payload.length,
    });
    response.end(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown upstream proxy error";
    sendJson(response, 502, {
      error: {
        code: "VERIFY_PROXY_UPSTREAM_ERROR",
        message,
      },
    });
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "127.0.0.1"}`,
  );

  if (requestUrl.pathname === "/healthz") {
    sendText(response, 200, "ok");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    await proxyToUpstream(request, response, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/api/roc/alerts") {
    sendJson(response, 200, {
      data: {
        items: opsAlerts,
        refresh: buildRefresh(),
      },
    });
    return;
  }

  if (requestUrl.pathname === "/api/roc/trips") {
    sendJson(response, 200, {
      data: {
        items: opsTrips,
        refresh: buildRefresh(),
      },
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/api/orders/demo-order-ops-")) {
    const orderId = requestUrl.pathname.split("/").at(-1);
    const order = orderId ? opsOrdersById.get(orderId) : null;

    if (!order) {
      sendJson(response, 404, {
        message: `No stubbed order for ${orderId ?? "unknown order"}`,
      });
      return;
    }

    sendJson(response, 200, {
      data: {
        item: order,
        refresh: buildRefresh(),
      },
    });
    return;
  }

  if (requestUrl.pathname === "/api/tenant/bookings") {
    sendJson(response, 200, {
      data: {
        items: tenantBookings,
      },
    });
    return;
  }

  if (shouldStubTenantPath(requestUrl.pathname)) {
    const pathParts = requestUrl.pathname.split("/");
    const bookingId = pathParts.at(4);

    if (!bookingId) {
      sendJson(response, 404, {
        message: "Missing bookingId for tenant fallback stub.",
      });
      return;
    }

    if (requestUrl.pathname.endsWith("/sandbox-fulfillment")) {
      const projection = tenantProjectionsById.get(bookingId);
      if (!projection) {
        sendJson(response, 404, {
          message: `No stubbed sandbox fulfillment projection for ${bookingId}`,
        });
        return;
      }

      sendJson(response, 200, {
        data: projection,
      });
      return;
    }

    const booking = tenantBookingsById.get(bookingId);
    if (!booking) {
      sendJson(response, 404, {
        message: `No stubbed booking for ${bookingId}`,
      });
      return;
    }

    sendJson(response, 200, {
      data: booking,
    });
    return;
  }

  await proxyToUpstream(request, response, requestUrl);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `v9 verify API proxy listening on http://127.0.0.1:${port} -> ${upstreamBaseUrl}`,
  );
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down v9 verify API proxy.`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
