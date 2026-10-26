import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ApiClientError } from "../../packages/api-client/src";
import { createUiModuleLoader } from "./system-remediation/sr-wire-001/ui-module-loader";

const root = resolve("apps/fleet-partner-portal-web");
function loadExport(listFleetPortalStatements: () => Promise<unknown[]>) {
  const load = createUiModuleLoader(root, {
    "server-only": {},
    "@drts/api-client": { ApiClientError },
    "./api-client.server": { getServerFleetPartnerClient: async () => ({ client: { listFleetPortalStatements }, fleetPartnerId: "fleet-1" }) },
    "next/server": { NextRequest, NextResponse },
  });
  return load<{ GET: (request: NextRequest) => Promise<Response> }>(
    resolve(root, "app/statements/export/route.ts"),
  ).GET;
}
afterEach(() => vi.restoreAllMocks());

describe("statement CSV export uses the real loader and refuses design or unauthorized data", () => {
  it("fails closed on denied finance scope and transport fallback; labels genuine live empty data", async () => {
    const denied = loadExport(async () => { throw new ApiClientError({ statusCode: 403,
      code: "AUTH_SCOPE_DENIED", message: "No finance scope", retryable: false, rawBody: "denied" }); });
    const forbidden = await denied(new NextRequest("https://unit.invalid/statements/export"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).not.toContain("NT$ 642,000");
    const unavailable = loadExport(async () => { throw new Error("transport unavailable"); });
    const fallback = await unavailable(new NextRequest("https://unit.invalid/statements/export"));
    expect(fallback.status).toBe(503);
    expect(fallback.headers.get("x-drts-data-source")).toBe("fallback");
    const live = loadExport(async () => []);
    const empty = await live(new NextRequest("https://unit.invalid/statements/export"));
    expect(empty.status).toBe(200);
    expect(empty.headers.get("x-drts-data-source")).toBe("live");
    expect(await empty.text()).toContain("StatementID,Period");
  });
});
