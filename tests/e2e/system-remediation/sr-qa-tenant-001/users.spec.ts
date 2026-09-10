import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { TenantUserRoleRecord } from "@drts/contracts";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

// Requires actual sessions for two disposable, authorized tenants. No bootstrap
// identity headers or mocked responses. Creating a user issues an invitation;
// DRTS_UAT_USER_EMAIL must be a fresh mailbox in an authorized test receiver.
test("Tenant users create, role update and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: process.env.BASE_SHA ?? "408679a7041bce027209222a68fc95b1f5f93141",
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
    const email = required("DRTS_UAT_USER_EMAIL").toLowerCase();
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
      await read(tenantA, tokenA, "users");
      await read(tenantB, tokenB, "users");
      const command = { email, displayName: run, roleCode: "tenant_viewer" };
      const created = await call(tenantA, tokenA, "users", command);
      expect(created.status()).toBe(201);
      const record: TenantUserRoleRecord = (await created.json()).data;
      expect(record.userId).toBeTruthy();
      evidence.recordResourceId("tenant_user", record.userId);
      const path = `users/${encodeURIComponent(record.userId)}/role`;
      const getRecord = async () => {
        const users = await read<TenantUserRoleRecord>(
          tenantA,
          tokenA,
          "users",
        );
        return users.find((user) => user.userId === record.userId);
      };
      expect(await getRecord()).toMatchObject({
        tenantId: tenantA,
        email,
        displayName: run,
        roleCode: "tenant_viewer",
        status: "invited",
      });
      const duplicate = await call(tenantA, tokenA, "users", command);
      expect(duplicate.status()).toBe(409);
      expect((await duplicate.json()).error.code).toBe("TENANT_USER_EXISTS");
      const crossUpdate = await call(tenantB, tokenB, path, {
        roleCode: "tenant_requester",
      });
      expect(crossUpdate.status()).toBe(404);
      expect((await crossUpdate.json()).error.code).toBe(
        "TENANT_USER_NOT_FOUND",
      );
      expect(
        (await call(tenantA, tokenA, path, { roleCode: " " })).status(),
      ).toBe(400);
      expect(await getRecord()).toMatchObject({
        roleCode: "tenant_viewer",
        status: "invited",
      });
      expect(
        (await read<TenantUserRoleRecord>(tenantB, tokenB, "users")).some(
          (user) => user.userId === record.userId,
        ),
      ).toBe(false);
      expect(
        (
          await call(tenantA, tokenA, path, {
            roleCode: "tenant_requester",
          })
        ).status(),
      ).toBe(201);
      expect(await getRecord()).toMatchObject({
        roleCode: "tenant_requester",
        status: "invited",
      });
      // Revoke the unused invitation before suspending this disposable user.
      expect(
        (
          await call(
            tenantA,
            tokenA,
            `users/${encodeURIComponent(record.userId)}/invitation/revoke`,
            {},
          )
        ).status(),
      ).toBe(201);
      expect(
        (
          await call(tenantA, tokenA, path, {
            roleCode: "tenant_viewer",
            status: "suspended",
          })
        ).status(),
      ).toBe(201);
      expect(await getRecord()).toMatchObject({
        roleCode: "tenant_viewer",
        status: "suspended",
      });
    } finally {
      await client.dispose();
    }
    evidence.recordLiveLimitation(
      "Persistence and remaining capabilities",
      "User and role API readback only. Invitation acceptance, receiver-confirmed mail delivery, session revocation, audit/DB durability and real devices remain unverified. Failure retains IDs for cleanup; a create failure may require lookup by the supplied test mailbox.",
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
