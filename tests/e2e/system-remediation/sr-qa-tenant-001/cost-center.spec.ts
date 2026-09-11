import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { TenantCostCenterRecord } from "@drts/contracts";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

// Requires actual sessions for two disposable, authorized tenants. No bootstrap
// identity headers, mocked responses, external messages, or production targets.
test("C027 cost center writes, disable and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: process.env.BASE_SHA ?? "a44ea852eabe0c88e54d8124802eccf86ebc1dc6",
  });
  try {
    const required = (name: string) => {
      const value = process.env[name]?.trim();
      if (!value)
        throw new Error(
          `Missing required ${name}; HTTP acceptance did not run`,
        );
      return value;
    };
    expect(required("DRTS_UAT_ENV")).toMatch(/^(local|sandbox)$/);
    const baseURL = new URL(required("DRTS_UAT_API_URL"));
    expect(baseURL.username + baseURL.password).toBe("");
    expect(["http:", "https:"]).toContain(baseURL.protocol);
    const tenantA = required("DRTS_UAT_TENANT_A");
    const tenantB = required("DRTS_UAT_TENANT_B");
    expect(tenantA).not.toBe(tenantB);
    const tokenA = required("DRTS_UAT_TOKEN_A");
    const tokenB = required("DRTS_UAT_TOKEN_B");
    expect(tokenA).not.toBe(tokenB);
    const client = await playwright.request.newContext();
    const run = `sr-qa-tenant-${randomUUID()}`;
    evidence.recordRole("tenant_admin:A");
    evidence.recordRole("tenant_admin:B");
    const call = async (
      tenant: string,
      token: string,
      path: string,
      data?: unknown,
    ) => {
      const start = Date.now();
      const url = new URL(`api/tenant/${path}`, `${baseURL.origin}/`).href;
      const response = await client.fetch(url, {
        method: data === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenant },
        data,
        maxRedirects: 0,
      });
      evidence.recordHttpCall({
        method: data === undefined ? "GET" : "POST",
        url,
        statusCode: response.status(),
        durationMs: Date.now() - start,
        actorRole: tenant === tenantA ? "tenant_admin:A" : "tenant_admin:B",
      });
      return response;
    };
    const read = async <T>(
      tenant: string,
      token: string,
      path: string,
    ): Promise<T[]> => {
      const response = await call(tenant, token, path);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data.items)).toBe(true);
      return body.data.items;
    };
    try {
      await read(tenantA, tokenA, "cost-centers");
      await read(tenantB, tokenB, "cost-centers");
      const command = { code: run, name: run };
      const created = await call(tenantA, tokenA, "cost-centers", command);
      expect(created.status()).toBe(201);
      const record: TenantCostCenterRecord = (await created.json()).data;
      expect(record.code).toBeTruthy();
      evidence.recordResourceId("cost_center", `${tenantA}:${record.code}`);
      const path = `cost-centers/${encodeURIComponent(record.code)}`;
      const getRecord = async () => {
        const response = await call(tenantA, tokenA, path);
        expect(response.status()).toBe(200);
        return (await response.json()).data;
      };
      expect(await getRecord()).toMatchObject({
        tenantId: tenantA,
        code: record.code,
        name: run,
        activeFlag: true,
      });
      const updatedName = `${run}-updated`;
      expect(
        (
          await call(tenantA, tokenA, "cost-centers", {
            ...command,
            name: updatedName,
          })
        ).status(),
      ).toBe(201);
      expect(await getRecord()).toMatchObject({ name: updatedName });

      const crossRead = await call(tenantB, tokenB, path);
      expect(crossRead.status()).toBe(404);
      expect((await crossRead.json()).error.code).toBe("COST_CENTER_NOT_FOUND");
      const crossDisable = await call(tenantB, tokenB, "cost-centers/disable", {
        code: record.code,
        reason: run,
      });
      expect(crossDisable.status()).toBe(404);
      expect((await crossDisable.json()).error.code).toBe(
        "COST_CENTER_NOT_FOUND",
      );
      expect(
        (
          await call(tenantA, tokenA, "cost-centers", {
            ...command,
            name: " ",
          })
        ).status(),
      ).toBe(400);
      expect(await getRecord()).toMatchObject({
        name: updatedName,
        activeFlag: true,
      });
      expect(
        (
          await read<TenantCostCenterRecord>(tenantB, tokenB, "cost-centers")
        ).some((item) => item.code === record.code),
      ).toBe(false);

      expect(
        (
          await call(tenantA, tokenA, "cost-centers/disable", {
            code: record.code,
            reason: run,
          })
        ).status(),
      ).toBe(201);
      expect(await getRecord()).toMatchObject({
        code: record.code,
        name: updatedName,
        activeFlag: false,
        disabledReason: run,
        disabledAt: expect.any(String),
      });
      expect(
        (
          await read<TenantCostCenterRecord>(
            tenantA,
            tokenA,
            "cost-centers?activeOnly=true",
          )
        ).some((item) => item.code === record.code),
      ).toBe(false);
    } finally {
      await client.dispose();
    }
    evidence.recordLiveLimitation(
      "Persistence and remaining capabilities",
      "Cost center CRUD/read isolation only. Owner-user and booking references, disabled booking rejection, quota interactions and restart/DB durability remain unverified. No external mail or real devices tested.",
    );
    evidence.finalize("passed");
  } catch (error) {
    evidence.recordError(error instanceof Error ? error : String(error));
    evidence.finalize("failed");
    throw error;
  } finally {
    const output = evidence.saveToFile(
      testInfo.outputPath("tenant-evidence.json"),
    );
    await testInfo.attach("tenant-evidence", {
      path: output,
      contentType: "application/json",
    });
  }
});
