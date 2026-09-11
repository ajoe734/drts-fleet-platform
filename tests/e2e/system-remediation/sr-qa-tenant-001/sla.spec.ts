import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type {
  TenantSlaProfile,
  UpdateTenantSlaProfileCommand,
} from "@drts/contracts";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

test("C028 SLA settings readback, invalid input and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: process.env.BASE_SHA,
  });
  evidence.recordLiveLimitation(
    "SLA scope",
    "HTTP settings and isolation only; booking breach calculation, escalation, DB durability and real devices remain unverified. Use dedicated tenants with no concurrent SLA writer.",
  );
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
    const tokenA = required("DRTS_UAT_TOKEN_A");
    const tokenB = required("DRTS_UAT_TOKEN_B");
    // Provision a real A session with tenant:sla:read, without tenant:sla:write.
    const readOnlyToken = required("DRTS_UAT_TOKEN_READONLY_A");
    expect(tenantA).not.toBe(tenantB);
    expect(tokenA).not.toBe(tokenB);
    expect(readOnlyToken).not.toBe(tokenA);
    expect(readOnlyToken).not.toBe(tokenB);
    const client = await playwright.request.newContext();
    const run = `sr-qa-tenant-${randomUUID()}`;
    const call = async (
      tenant: string,
      token: string,
      data?: UpdateTenantSlaProfileCommand,
    ) => {
      const url = new URL("/api/tenant/sla", baseURL.origin).href;
      const method = data === undefined ? "GET" : "POST";
      const started = Date.now();
      const response = await client.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenant },
        data,
        maxRedirects: 0,
      });
      evidence.recordHttpCall({
        method,
        url,
        statusCode: response.status(),
        durationMs: Date.now() - started,
      });
      return response;
    };
    const read = async (
      tenant: string,
      token: string,
    ): Promise<TenantSlaProfile> => {
      const response = await call(tenant, token);
      expect(response.status()).toBe(200);
      const profile: TenantSlaProfile = (await response.json()).data;
      expect(profile.tenantId).toBe(tenant);
      return profile;
    };
    const thresholds = (
      profile: TenantSlaProfile,
    ): UpdateTenantSlaProfileCommand => ({
      waitThresholdMin: profile.waitThresholdMin,
      arrivalThresholdMin: profile.arrivalThresholdMin,
      completionThresholdMin: profile.completionThresholdMin,
    });
    let originalA: TenantSlaProfile | undefined;
    let originalB: TenantSlaProfile | undefined;
    let attemptedWrite = false;
    try {
      evidence.recordRole("tenant_admin:A");
      evidence.recordRole("tenant_admin:B");
      originalA = await read(tenantA, tokenA);
      originalB = await read(tenantB, tokenB);
      evidence.recordRole("tenant_sla_readonly:A");
      expect(await read(tenantA, readOnlyToken)).toEqual(originalA);
      evidence.recordResourceId("tenant_sla", originalA.tenantId);
      evidence.recordResourceId("tenant_sla", originalB.tenantId);
      const updated = {
        waitThresholdMin: originalA.waitThresholdMin === 11 ? 12 : 11,
        arrivalThresholdMin: originalA.arrivalThresholdMin === 21 ? 22 : 21,
        completionThresholdMin:
          originalA.completionThresholdMin === 61 ? 62 : 61,
        reason: run,
      };
      attemptedWrite = true;
      const written = await call(tenantA, tokenA, updated);
      expect(written.status()).toBe(201);
      expect((await written.json()).data).toMatchObject({
        resourceType: "tenant_sla",
        resourceId: tenantA,
        status: "completed",
      });
      const persisted = await read(tenantA, tokenA);
      expect(thresholds(persisted)).toEqual({
        waitThresholdMin: updated.waitThresholdMin,
        arrivalThresholdMin: updated.arrivalThresholdMin,
        completionThresholdMin: updated.completionThresholdMin,
      });
      expect(await read(tenantB, tokenB)).toEqual(originalB);
      // A valid read session must fail authorization, not authentication, on write.
      expect(
        (await call(tenantA, readOnlyToken, { ...updated, waitThresholdMin: 31 }))
          .status(),
      ).toBe(403);
      expect(await read(tenantA, tokenA)).toEqual(persisted);
      // A's session must not acquire B's authority by changing a tenant header.
      expect((await call(tenantB, tokenA, updated)).status()).toBe(403);
      expect(await read(tenantB, tokenB)).toEqual(originalB);
      expect((await call(tenantA, "", updated)).status()).toBe(401);
      expect(await read(tenantA, tokenA)).toEqual(persisted);
      for (const field of [
        "waitThresholdMin",
        "arrivalThresholdMin",
        "completionThresholdMin",
      ] as const) {
        expect(
          (await call(tenantA, tokenA, { [field]: -1, reason: run })).status(),
        ).toBe(400);
        expect(await read(tenantA, tokenA)).toEqual(persisted);
      }
    } finally {
      try {
        if (attemptedWrite && originalA && originalB) {
          // Restore both dedicated tenants even if a cross-tenant rejection fails.
          for (const [tenant, token, original] of [
            [tenantA, tokenA, originalA],
            [tenantB, tokenB, originalB],
          ] as const) {
            expect(
              (
                await call(tenant, token, {
                  ...thresholds(original),
                  reason: `${run}-restore`,
                })
              ).status(),
            ).toBe(201);
            expect(thresholds(await read(tenant, token))).toEqual(
              thresholds(original),
            );
          }
        }
      } finally {
        await client.dispose();
      }
    }
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
