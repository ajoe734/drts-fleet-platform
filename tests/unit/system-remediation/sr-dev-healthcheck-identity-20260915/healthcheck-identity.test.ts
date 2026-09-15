import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GET as tenantHealthz } from "../../../../apps/tenant-console-web/app/healthz/route";
import { GET as enterpriseHealthz } from "../../../../apps/enterprise-dispatch-web/app/healthz/route";
import { GET as bankHealthz } from "../../../../apps/bank-console-web/app/healthz/route";
import { PUBLIC_AUTH_PATHS, HEALTHCHECK_PATH } from "../../../../apps/tenant-console-web/lib/auth/constants";

const repoRoot = path.resolve(__dirname, "../../../..");

describe("SR-DEV-HEALTHCHECK-IDENTITY-20260915: dev deployment health check identity verification", () => {
  const workflowContent = readFileSync(
    path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
    "utf8",
  );

  it("probes private Cloud Run services with identity token authorization", () => {
    // Assert curl_ready_auth helper exists and passes Authorization header
    expect(workflowContent).toContain("curl_ready_auth()");
    expect(workflowContent).toContain('Authorization: Bearer ${id_token}');
    expect(workflowContent).toContain("--location-trusted");
    expect(workflowContent).toContain("--retry-all-errors");
    expect(workflowContent).toContain("--retry 10");
    expect(workflowContent).toContain("--fail");

    // Assert private services use curl_ready_auth with minted identity tokens
    expect(workflowContent).toContain('curl_ready_auth "${{ steps.urls.outputs.tenant_console }}" "${TENANT_CONSOLE_ID_TOKEN}"');
    expect(workflowContent).toContain('curl_ready_auth "${{ steps.urls.outputs.bank_console }}" "${BANK_CONSOLE_ID_TOKEN}"');
    expect(workflowContent).toContain('curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}" "${ENTERPRISE_DISPATCH_ID_TOKEN}"');
    expect(workflowContent).toContain('curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/bookings/new" "${ENTERPRISE_DISPATCH_ID_TOKEN}"');
    expect(workflowContent).toContain('curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/embed/unsupported-host" "${ENTERPRISE_DISPATCH_ID_TOKEN}"');

    // Assert Cloud Run infrastructure-reserved path /healthz is not probed over public GFE
    expect(workflowContent).not.toContain('curl_ready_auth "${{ steps.urls.outputs.tenant_console }}/healthz"');
    expect(workflowContent).not.toContain('curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/healthz"');
  });

  it("maintains anonymous probes for public services", () => {
    expect(workflowContent).toContain('curl_ready "${{ steps.urls.outputs.api }}/health"');
    expect(workflowContent).toContain('curl_ready "${{ steps.urls.outputs.platform_admin }}"');
    expect(workflowContent).toContain('curl_ready "${{ steps.urls.outputs.ops_console }}"');
    expect(workflowContent).toContain('curl_ready "${{ steps.urls.outputs.fleet_partner_portal }}"');
    expect(workflowContent).toContain('curl_ready "${{ steps.urls.outputs.channel_partner_portal }}"');
  });

  it("preserves strict --no-allow-unauthenticated defaults for private services", () => {
    // Services must not be exposed unauthenticated
    expect(workflowContent).toContain('tenant_console_exposure_flag="$(exposure_flag "${DEV_TENANT_CONSOLE_ALLOW_UNAUTHENTICATED:-}" false)"');
    expect(workflowContent).toContain('bank_console_exposure_flag="$(exposure_flag "${DEV_BANK_CONSOLE_ALLOW_UNAUTHENTICATED:-}" false)"');
    expect(workflowContent).toContain('enterprise_dispatch_exposure_flag="$(exposure_flag "${DEV_ENTERPRISE_DISPATCH_ALLOW_UNAUTHENTICATED:-}" false)"');
  });

  it("implements tenant-console-web /healthz route handler and includes it in PUBLIC_AUTH_PATHS", async () => {
    expect(HEALTHCHECK_PATH).toBe("/healthz");
    expect(PUBLIC_AUTH_PATHS).toContain("/healthz");

    const response = tenantHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "tenant-console-web",
    });
  });

  it("implements enterprise-dispatch-web /healthz route handler", async () => {
    const response = enterpriseHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "enterprise-dispatch-web",
    });
  });

  it("implements bank-console-web /healthz route handler", async () => {
    const response = bankHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "bank-console-web",
    });
  });
});
