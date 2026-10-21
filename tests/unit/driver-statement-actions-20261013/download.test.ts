import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClient,
  createDriverBearerClient,
} from "../../../packages/api-client/src/index";
import type { ControlledDownloadRecord } from "@drts/contracts";
import {
  getDriverEarningsStatement,
  listDriverEarningsStatements,
  resolveDriverStatementDownload,
} from "../../../apps/driver-app/lib/driver-statement-actions";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";

afterEach(() => vi.unstubAllGlobals());
const now = Date.parse("2026-10-13T00:00:00Z");
function metadata(
  overrides: Partial<ControlledDownloadRecord> = {},
): ControlledDownloadRecord {
  return {
    kind: "report",
    subjectId: "statement /1",
    manifestHash: "hash",
    host: "example.invalid",
    keyId: "key",
    signedAt: "2026-10-13T00:00:00Z",
    expiresAt: "2026-10-14T00:00:00Z",
    ttlMinutes: 60,
    signatureVersion: 1,
    signature: "signature",
    downloadUrl: "https://example.invalid/current.pdf?signature=a%2Fb",
    immutable: true,
    ...overrides,
  };
}
describe("Driver statement reader contract and current download selection", () => {
  it("retains the existing operational SDK route and its caller headers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: { statementId: "statement /1" }, meta: {} }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient({
      baseUrl: "https://example.invalid",
      defaultHeaders: {
        "x-driver-id": "driver-1",
        "x-realm": "ops",
        "x-scopes": "billing:read",
      },
    });
    expect(await client.getDriverStatement("statement /1")).toMatchObject({
      statementId: "statement /1",
    });
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://example.invalid/api/driver-statements/statement%20%2F1",
    );
    const options = fetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(options.headers).get("x-driver-id")).toBe("driver-1");
  });

  it("demonstrates why legacy SDK statement routes cannot serve standard driver session scopes", async () => {
    const driverScopes = ["driver:read", "driver:write", "dispatch:read"];
    const fetch = vi.fn(async (url: string) => {
      const policy = resolveRouteAuthPolicy("GET", new URL(url).pathname)!;
      expect(policy.requiredScopes).toEqual(["billing:read"]);
      expect(
        policy.requiredScopes.every((scope) => driverScopes.includes(scope)),
      ).toBe(false);
      return new Response(
        JSON.stringify({
          error: {
            code: "AUTH_SCOPE_DENIED",
            message: "Missing billing read scope",
            retryable: false,
          },
        }),
        { status: 403 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const client = createDriverBearerClient(
      "https://example.invalid",
      "driver-session-fixture",
    );
    await expect(client.listDriverStatements()).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      client.getDriverStatement("statement /1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lists earnings statements through the exact read alias, preserving bearer context and list envelopes", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                statement_id: "statement /1",
                driver_id: "driver-1",
                period_month: "2026-10",
                receipt_no: "receipt-1",
                fee_plan_version: "plan-1",
                net_amount: { currency: "TWD", amount_minor: 14000 },
              },
            ],
            page_info: { total_items: 1 },
          },
          meta: {},
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createDriverBearerClient(
      "https://example.invalid",
      "driver-session-fixture",
    );
    expect(await listDriverEarningsStatements(client, "2026-10")).toEqual([
      {
        statementId: "statement /1",
        driverId: "driver-1",
        periodMonth: "2026-10",
        receiptNo: "receipt-1",
        feePlanVersion: "plan-1",
        netAmount: { currency: "TWD", amountMinor: 14000 },
      },
    ]);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://example.invalid/api/driver/profile/statements?periodMonth=2026-10",
    );
    const headers = new Headers(
      (fetch.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(headers.get("Authorization")).toBe("Bearer driver-session-fixture");
    expect(headers.has("x-scopes")).toBe(false);
    expect(
      resolveRouteAuthPolicy("GET", "/api/driver/profile/statements")
        ?.requiredScopes,
    ).toEqual(["driver:read"]);
  });

  it("reads encoded statement detail through the earnings alias and unwraps current artifact metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            statement_id: "statement /1",
            receipt_no: "receipt-1",
            artifact_download_metadata: {
              download_url:
                "https://example.invalid/current.pdf?signature=a%2Fb",
              expires_at: "2026-10-14T00:00:00Z",
            },
          },
          meta: {},
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createDriverBearerClient(
      "https://example.invalid",
      "driver-session-fixture",
    );
    const statement = await getDriverEarningsStatement(client, "statement /1");
    expect(statement.statementId).toBe("statement /1");
    expect(statement.receiptNo).toBe("receipt-1");
    expect(resolveDriverStatementDownload(statement, now)).toEqual({
      state: "ready",
      url: "https://example.invalid/current.pdf?signature=a%2Fb",
    });
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://example.invalid/api/driver/profile/statements/statement%20%2F1",
    );
    expect(
      new Headers((fetch.mock.calls[0]![1] as RequestInit).headers).get(
        "Authorization",
      ),
    ).toBe("Bearer driver-session-fixture");
  });

  it("propagates an unavailable read alias without falling back to the legacy route", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "Statement unavailable",
            retryable: false,
          },
        }),
        { status: 404 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createDriverBearerClient(
      "https://example.invalid",
      "driver-session-fixture",
    );
    await expect(
      getDriverEarningsStatement(client, "statement /1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://example.invalid/api/driver/profile/statements/statement%20%2F1",
    );
  });
  it("prefers intact current controlled metadata over an older URL", () => {
    expect(
      resolveDriverStatementDownload(
        {
          artifactUrl: "https://example.invalid/old.pdf",
          artifactDownloadMetadata: metadata(),
        },
        now,
      ),
    ).toEqual({ state: "ready", url: metadata().downloadUrl });
  });
  it("supports metadata-only and existing legacy artifact URLs", () => {
    expect(
      resolveDriverStatementDownload(
        { artifactDownloadMetadata: metadata() },
        now,
      ).state,
    ).toBe("ready");
    expect(
      resolveDriverStatementDownload(
        { artifactUrl: "https://example.invalid/legacy.pdf" },
        now,
      ),
    ).toEqual({ state: "ready", url: "https://example.invalid/legacy.pdf" });
  });
  it("reports no artifact without inventing one", () => {
    expect(resolveDriverStatementDownload({}, now)).toEqual({
      state: "missing",
      url: null,
    });
  });
  it("does not use a link at or after its declared expiry", () => {
    expect(
      resolveDriverStatementDownload(
        {
          artifactDownloadMetadata: metadata({
            expiresAt: "2026-10-13T00:00:00Z",
          }),
        },
        now,
      ),
    ).toEqual({ state: "expired", url: null });
  });
  it("does not claim availability for an unreadable declared expiry", () => {
    expect(
      resolveDriverStatementDownload(
        { artifactDownloadMetadata: metadata({ expiresAt: "invalid" }) },
        now,
      ),
    ).toEqual({ state: "unavailable", url: null });
  });
});
