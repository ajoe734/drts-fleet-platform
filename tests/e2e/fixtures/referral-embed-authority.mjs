import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.REFERRAL_EMBED_FIXTURE_PORT ?? "3099");

const ordersByPassenger = new Map();
let orderCounter = 1;

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function writeHtml(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(body);
}

function buildEntry(entrySlug) {
  return {
    partner_id: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
    partner_code: "yuhe",
    partner_type: "referral_channel",
    program_id: "program-referral-community",
    program_code: "REFERRAL_COMMUNITY",
    tenant_id: "tenant-demo-001",
    bank_code: null,
    entry_slug: entrySlug,
    display_name: "御和物業",
    business_dispatch_subtype: "enterprise_dispatch",
    auth_mode: "partner_api_key",
    eligibility_mode: "none",
    entry_host: "app.yuhe-living.com.tw",
    entry_path: `/embed/${entrySlug}`,
    theme_accent: "#0F766E",
    branding_metadata: {
      display_name: "御和物業",
      theme_accent: "#0F766E",
      support_email: null,
      support_phone: "0800-911-200",
    },
    eligibility_contract: null,
    status: "active",
    active_flag: true,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: "2026-08-01T05:25:49.951Z",
    updated_at: "2026-08-01T05:25:49.951Z",
    audit_metadata: {
      source: "e2e_fixture",
      request_id: null,
      created_by: "system:e2e",
      updated_by: "system:e2e",
    },
  };
}

function getPassengerKey(request) {
  const passengerId = request.headers["x-drts-passenger-id"] || "referral-demo";
  const entrySlug = request.headers["x-partner-entry-slug"] || "yuhe-residence";
  return `${entrySlug}:${passengerId}`;
}

function getPassengerOrders(request) {
  const key = getPassengerKey(request);
  if (!ordersByPassenger.has(key)) {
    ordersByPassenger.set(key, []);
  }
  return ordersByPassenger.get(key);
}

function maskPhone(phone) {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  if (cleaned.length >= 10) {
    return `${cleaned.slice(0, 4)}-***-${cleaned.slice(-3)}`;
  }
  return "0912-***-820";
}

function buildReceipt(order) {
  return {
    orderId: order.orderId,
    orderNo: order.orderNo,
    status: order.status,
    completedAt: order.createdAt,
    passengerNameMasked: order.passengerName,
    passengerPhoneMasked: maskPhone(order.passengerPhone),
    driverName: "吳明翰",
    plateNumber: "BKR-2208",
    vehicleType: order.vehicleType,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    fareBase: 102,
    fareDistance: 131,
    fareTime: 57,
    totalFare: 290,
    formattedTotal: "NT$ 290",
    paymentChannel: "yuhe-residence (月結)",
    downloadUrl: `/api/referral/receipt/${order.orderId}/download`,
  };
}

function jsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/embed-host") {
    const target = url.searchParams.get("target");
    if (!target || !target.startsWith("http://127.0.0.1:3114/")) {
      writeHtml(response, 400, "Missing or invalid iframe target.");
      return;
    }
    writeHtml(
      response,
      200,
      `<iframe title="Referral Embed" src="${target.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></iframe>`,
    );
    return;
  }

  const entryPrefix = "/api/partner/entries/";
  if (request.method === "GET" && url.pathname.startsWith(entryPrefix)) {
    const entrySlug = decodeURIComponent(url.pathname.slice(entryPrefix.length));
    if (entrySlug === "missing-entry") {
      writeJson(response, 404, {
        error: {
          code: "PARTNER_ENTRY_NOT_FOUND",
          message: "The partner entry could not be found.",
          retryable: false,
        },
      });
      return;
    }

    if (entrySlug === "authority-down") {
      writeJson(response, 503, {
        error: {
          code: "EMBED_AUTHORITY_UNAVAILABLE",
          message: "The referral authority is temporarily unavailable.",
          retryable: true,
        },
      });
      return;
    }

    writeJson(response, 200, { data: buildEntry(entrySlug) });
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/partner/referral/passenger/bookings"
  ) {
    const body = await jsonBody(request);
    const orders = getPassengerOrders(request);
    const now = new Date().toISOString();
    const sequence = String(orderCounter++).padStart(4, "0");
    const order = {
      orderId: `ord_ref_${sequence}`,
      orderNo: `RF-${sequence}`,
      bookingId: `booking-ref-${sequence}`,
      status: "enroute",
      statusCode: "enroute",
      pickupAddress: body.pickupAddress,
      dropoffAddress: body.dropoffAddress,
      vehicleType: body.vehicleType || "comfort",
      passengerName: body.passengerName || "李采縈",
      passengerPhone: body.passengerPhone || "0912345820",
      createdAt: now,
      updatedAt: now,
    };
    orders.unshift(order);
    writeJson(response, 200, {
      data: {
        orderId: order.orderId,
        bookingId: order.bookingId,
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: order.vehicleType,
        dispatchSemantics: "reservation",
        status: order.status,
        replayed: false,
      },
    });
    return;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/partner/referral/passenger/active"
  ) {
    const active = getPassengerOrders(request)[0] ?? null;
    writeJson(response, 200, {
      data: active
        ? {
            active: true,
            trip: {
              orderId: active.orderId,
              orderNo: active.orderNo,
              status: active.status,
              statusCode: active.statusCode,
              etaMin: 6,
              cancelWindowMin: 2,
              pickupAddress: active.pickupAddress,
              dropoffAddress: active.dropoffAddress,
              driverName: "吳明翰",
              driverPhoneMasked: "0912-***-888",
              plateNumber: "BKR-2208",
              vehicleType: active.vehicleType,
              estimatedFare: 290,
              createdAt: active.createdAt,
              updatedAt: active.updatedAt,
              rated: false,
            },
          }
        : { active: false, trip: null },
    });
    return;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/partner/referral/passenger/history"
  ) {
    const items = getPassengerOrders(request).map((order) => ({
      orderId: order.orderId,
      orderNo: order.orderNo,
      status: order.status,
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress,
      fareTotal: 290,
      formattedFare: "NT$ 290",
      completedAt: order.createdAt,
      createdAt: order.createdAt,
    }));
    writeJson(response, 200, { data: { items } });
    return;
  }

  const receiptMatch = url.pathname.match(
    /^\/partner\/referral\/passenger\/orders\/([^/]+)\/receipt$/,
  );
  if (request.method === "GET" && receiptMatch) {
    const orderId = decodeURIComponent(receiptMatch[1]);
    const order = getPassengerOrders(request).find((item) => item.orderId === orderId);
    if (!order) {
      writeJson(response, 404, {
        error: {
          code: "ORDER_NOT_FOUND",
          message: "Order not found.",
        },
      });
      return;
    }
    writeJson(response, 200, { data: buildReceipt(order) });
    return;
  }

  writeJson(response, 404, {
    error: { code: "FIXTURE_ROUTE_NOT_FOUND", message: "Not found." },
  });
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
