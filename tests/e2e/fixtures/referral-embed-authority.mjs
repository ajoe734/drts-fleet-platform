import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.REFERRAL_EMBED_FIXTURE_PORT ?? "3099");

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

const server = createServer((request, response) => {
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

  const prefix = "/api/partner/entries/";
  if (request.method !== "GET" || !url.pathname.startsWith(prefix)) {
    writeJson(response, 404, {
      error: { code: "FIXTURE_ROUTE_NOT_FOUND", message: "Not found." },
    });
    return;
  }

  const entrySlug = decodeURIComponent(url.pathname.slice(prefix.length));
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
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
