import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test("C028 SLA profile write/readback, partial update and authorization", async ({
  playwright,
}, testInfo) => {
  const contexts: APIRequestContext[] = [];
  const calls: { method: string; path: string; status: number }[] = [];
  const resources: {
    tenantId: string;
    resourceId: string;
    actionId: string;
  }[] = [];
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
    const path = "tenant/sla";
    const otherBefore = await request(b, "GET", path, 200);
    const initial = {
      waitThresholdMin: 17,
      arrivalThresholdMin: 23,
      completionThresholdMin: 61,
      reason: `SLA acceptance ${namespace}`,
    };
    const receipt = await request(a, "POST", path, 201, initial);
    expect(receipt).toMatchObject({
      resourceType: "tenant_sla",
      resourceId: tenantA,
      status: "completed",
    });
    expect(typeof receipt.actionId).toBe("string");
    expect(receipt.actionId.length).toBeGreaterThan(0);
    resources.push({
      tenantId: tenantA,
      resourceId: receipt.resourceId,
      actionId: receipt.actionId,
    });
    const created = await request(a, "GET", path, 200);
    expect(created).toMatchObject({
      tenantId: tenantA,
      waitThresholdMin: 17,
      arrivalThresholdMin: 23,
      completionThresholdMin: 61,
    });
    expect(Number.isFinite(Date.parse(created.updatedAt))).toBe(true);
    expect(await request(reader, "GET", path, 200)).toEqual(created);
    expect((await request(a, "GET", `${path}/view`, 200)).profile).toEqual(
      created,
    );

    await request(reader, "POST", path, 403, {
      waitThresholdMin: 99,
      reason: `Denied ${namespace}`,
    });
    await request(reader, "POST", `${path}/recalculate`, 403, {
      reason: `Denied ${namespace}`,
    });
    const beforeInvalid = await request(a, "GET", `${path}/view`, 200);
    await request(a, "POST", `${path}/recalculate`, 400, { reason: " " });
    expect(await request(a, "GET", path, 200)).toEqual(created);
    const afterInvalid = await request(a, "GET", `${path}/view`, 200);
    expect(afterInvalid.lastRecalculationAt).toBe(
      beforeInvalid.lastRecalculationAt,
    );

    const updatedReceipt = await request(a, "POST", path, 201, {
      waitThresholdMin: 19,
      reason: `Partial update ${namespace}`,
    });
    expect(updatedReceipt).toMatchObject({
      resourceType: "tenant_sla",
      resourceId: tenantA,
      status: "completed",
    });
    const updated = await request(a, "GET", path, 200);
    expect(updated).toMatchObject({
      tenantId: tenantA,
      waitThresholdMin: 19,
      arrivalThresholdMin: 23,
      completionThresholdMin: 61,
    });
    expect((await request(a, "GET", `${path}/view`, 200)).profile).toEqual(
      updated,
    );
    expect(await request(b, "GET", path, 200)).toEqual(otherBefore);
  } finally {
    await testInfo.attach("tenant-sla-evidence", {
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
              "SLA profile API readback only; invalid threshold ranges, booking recalculation effects, audit delivery and DB restart remain pending. Dispose provisioned tenants after evidence collection.",
          },
          null,
          2,
        ),
      ),
    });
    await Promise.all(contexts.map((client) => client.dispose()));
  }
});
