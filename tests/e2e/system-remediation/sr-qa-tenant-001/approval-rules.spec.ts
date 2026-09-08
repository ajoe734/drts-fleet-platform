import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test("C028 approval-rule write/readback, isolation and disable", async ({
  playwright,
}, testInfo) => {
  const contexts: APIRequestContext[] = [];
  const calls: { method: string; path: string; status: number }[] = [];
  const resources: { tenantId: string; ruleId: string }[] = [];
  const namespace = `UAT-${randomUUID()}`.toUpperCase();
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
    method: "GET" | "POST" | "PUT",
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
    const path = "tenant/approval-rules";
    const initial = {
      ruleName: `Rule ${namespace}`,
      priority: 9000,
      activeFlag: false,
      conditions: [],
      action: "block",
    };
    // Start inactive so creation does not affect another test's bookings.
    const created = await request(a, "POST", path, 201, initial);
    expect(typeof created.ruleId).toBe("string");
    expect(created.ruleId.length).toBeGreaterThan(0);
    resources.push({ tenantId: tenantA, ruleId: created.ruleId });
    expect(created).toMatchObject({ ...initial, tenantId: tenantA });
    const detail = `${path}/${encodeURIComponent(created.ruleId)}`;
    const readback = await request(a, "GET", detail, 200);
    expect(readback).toEqual(created);
    await request(b, "GET", detail, 404);
    await request(b, "POST", `${detail}/disable`, 404);
    await request(reader, "PUT", detail, 403, initial);
    await request(reader, "POST", `${detail}/disable`, 403);
    await request(a, "PUT", detail, 400, { ...initial, ruleName: " " });
    expect(await request(a, "GET", detail, 200)).toEqual(readback);

    const updated = await request(a, "PUT", detail, 200, {
      ...initial,
      ruleName: `Updated ${namespace}`,
      priority: 9010,
    });
    expect(updated).toMatchObject({
      ruleId: created.ruleId,
      tenantId: tenantA,
      ruleName: `Updated ${namespace}`,
      priority: 9010,
      activeFlag: false,
    });
    expect(await request(a, "GET", detail, 200)).toEqual(updated);
    const listed = await request(a, "GET", path, 200);
    expect(
      listed.items.filter(
        (row: { ruleId: string }) => row.ruleId === created.ruleId,
      ),
    ).toEqual([updated]);
    const otherTenant = await request(b, "GET", path, 200);
    expect(
      otherTenant.items.some(
        (row: { ruleId: string }) => row.ruleId === created.ruleId,
      ),
    ).toBe(false);
    const disabled = await request(a, "POST", `${detail}/disable`, 201);
    expect(disabled).toMatchObject({
      ruleId: created.ruleId,
      activeFlag: false,
    });
    expect(Number.isFinite(Date.parse(disabled.disabledAt))).toBe(true);
    expect(await request(a, "GET", detail, 200)).toEqual(disabled);
    const active = await request(a, "GET", `${path}?activeOnly=true`, 200);
    expect(
      active.items.some(
        (row: { ruleId: string }) => row.ruleId === created.ruleId,
      ),
    ).toBe(false);
  } finally {
    await testInfo.attach("tenant-approval-rule-evidence", {
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
              "Inactive rule API readback only; activation, evaluation/order/approver relations, quota effects and DB restart remain pending. Dispose provisioned tenants after evidence collection.",
          },
          null,
          2,
        ),
      ),
    });
    await Promise.all(contexts.map((client) => client.dispose()));
  }
});
