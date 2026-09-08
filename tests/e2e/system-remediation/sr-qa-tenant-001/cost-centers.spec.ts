import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test("C027 cost-center write/readback, isolation and disable", async ({
  playwright,
}, testInfo) => {
  const contexts: APIRequestContext[] = [];
  const calls: { method: string; path: string; status: number }[] = [];
  const resources: { tenantId: string; code: string }[] = [];
  const code = `UAT-${randomUUID()}`.toUpperCase();
  function required(name: string) {
    const value = process.env[name]?.trim();
    if (!value)
      throw new Error(`Missing ${name}; tenant API acceptance cannot run`);
    return value;
  }
  async function context(tenantId: string, token: string) {
    const client = await playwright.request.newContext({
      baseURL: `${required("DRTS_TENANT_UAT_API_URL").replace(/\/$/, "")}/`,
      extraHTTPHeaders: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });
    contexts.push(client);
    return client;
  }
  async function request(
    client: APIRequestContext,
    method: "GET" | "POST",
    path: string,
    status: number,
    data?: object,
  ) {
    const response = await client.fetch(path, { method, data });
    calls.push({ method, path, status: response.status() });
    expect(response.status()).toBe(status);
    return (await response.json()).data;
  }
  try {
    // Validate all credentials before any write to provisioned disposable tenants.
    required("DRTS_TENANT_UAT_API_URL");
    const tenantA = required("DRTS_TENANT_UAT_TENANT_A");
    const tenantB = required("DRTS_TENANT_UAT_TENANT_B");
    expect(tenantA).not.toBe(tenantB);
    const tokenA = required("DRTS_TENANT_UAT_TOKEN_A");
    const tokenB = required("DRTS_TENANT_UAT_TOKEN_B");
    const tokenReader = required("DRTS_TENANT_UAT_TOKEN_READONLY");
    const a = await context(tenantA, tokenA);
    const b = await context(tenantB, tokenB);
    const reader = await context(tenantA, tokenReader);
    const path = "tenant/cost-centers";
    const detail = `${path}/${encodeURIComponent(code)}`;
    const initial = {
      code,
      name: `Cost center ${code}`,
      description: "Disposable UAT",
    };
    const created = await request(a, "POST", path, 201, initial);
    resources.push({ tenantId: tenantA, code: created.code });
    expect(created).toMatchObject({
      ...initial,
      tenantId: tenantA,
      activeFlag: true,
    });
    const readback = await request(a, "GET", detail, 200);
    expect(readback).toEqual(created);
    await request(b, "GET", detail, 404);
    await request(b, "POST", `${path}/disable`, 404, { code });
    await request(reader, "POST", path, 403, { ...initial, name: "Forbidden" });
    await request(reader, "POST", `${path}/disable`, 403, { code });
    await request(a, "POST", path, 400, { code, name: " " });
    expect(await request(a, "GET", detail, 200)).toEqual(readback);

    const updated = await request(a, "POST", path, 201, {
      ...initial,
      name: `Updated ${code}`,
    });
    expect(updated).toMatchObject({
      code,
      name: `Updated ${code}`,
      tenantId: tenantA,
    });
    expect(await request(a, "GET", detail, 200)).toEqual(updated);
    const listed = await request(a, "GET", path, 200);
    expect(
      listed.items.filter((row: { code: string }) => row.code === code),
    ).toEqual([updated]);
    const disabled = await request(a, "POST", `${path}/disable`, 201, {
      code,
      reason: "UAT complete",
    });
    expect(disabled).toMatchObject({
      code,
      activeFlag: false,
      disabledReason: "UAT complete",
    });
    expect(Number.isFinite(Date.parse(disabled.disabledAt))).toBe(true);
    expect(await request(a, "GET", detail, 200)).toEqual(disabled);
    const active = await request(a, "GET", `${path}?activeOnly=true`, 200);
    expect(
      active.items.some((row: { code: string }) => row.code === code),
    ).toBe(false);
  } finally {
    await testInfo.attach("tenant-cost-center-evidence", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(
          {
            baseSha: execFileSync("git", ["rev-parse", "origin/dev"], {
              encoding: "utf8",
            }).trim(),
            testedSha: execFileSync("git", ["rev-parse", "HEAD"], {
              encoding: "utf8",
            }).trim(),
            resources,
            calls,
            limitation:
              "API readback only; owner/order references, quota effects and DB restart remain pending. Dispose provisioned tenants after evidence collection.",
          },
          null,
          2,
        ),
      ),
    });
    await Promise.all(contexts.map((client) => client.dispose()));
  }
});
