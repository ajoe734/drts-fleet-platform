import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolveRouteAuthPolicy } from "../../../../apps/api/src/common/auth/auth.policy";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";
import { BANK_CONSOLE_SESSION_COOKIE, signSessionRole } from "@/lib/session";
import { GET as exportAll } from "../../../../apps/bank-console-web/app/api/statements/export/route";

vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Deliberately ordinary, failing acceptance tests: no skip, it.fails, or fixture
// success. These keep the task red until supervisor authorizes the shared fixes.
describe("BLOCKED: canonical IAM policy and bank-dev-read-models need supervisor integration", () => {
  for (const path of [
    "/api/tenant/settlement-statements",
    "/api/tenant/settlement-statements/2026-03",
  ]) {
    it(`${path} must require financial read permission beyond tenant:read`, () => {
      expect(resolveRouteAuthPolicy("GET", path)?.requiredScopes).toContain(
        "tenant:billing:read",
      );
    });
  }

  for (const [tenantId, role] of [
    ["tenant-demo-001", "bank_ops_viewer"],
    ["tenant-cathay-001", "bank_finance"],
  ] as const) {
    it(`${tenantId}/${role}: upstream denial must not return CTBC seed statements`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Forbidden", { status: 403 })),
      );
      const result = await loadBankStatementsData(tenantId, role);
      expect(result.data.statements).toEqual([]);
    });
  }

  it("Cathay CSV must not publish CTBC seed rows when its upstream is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unavailable", { status: 503 })),
    );
    const request = new NextRequest(
      "http://bank.test/api/statements/export?bank=cathay&role=bank_finance",
      {
        headers: {
          cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${signSessionRole("bank_finance", "cathay")}`,
        },
      },
    );
    const response = await exportAll(request);
    const body = await response.text();
    expect(body).not.toContain("STM-CTBC");
  });
});
