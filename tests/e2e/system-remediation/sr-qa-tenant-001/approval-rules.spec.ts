import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type {
  TenantApprovalRuleRecord,
  UpsertTenantApprovalRuleCommand,
} from "@drts/contracts";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

// Requires actual sessions for two disposable, authorized tenants. No bootstrap
// identity headers, mocked responses, external messages, or production targets.
test("C028 approval rule writes, evaluation and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: process.env.BASE_SHA ?? "6f6f418fdd6c7fa0811765710f66a5608e0b8ad0",
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
      await read(tenantA, tokenA, "approval-rules");
      await read(tenantB, tokenB, "approval-rules");
      const command: UpsertTenantApprovalRuleCommand = {
        ruleName: run,
        priority: 100,
        action: "block",
        conditions: [{ field: "booking.passenger.id", op: "eq", value: run }],
      };
      const created = await call(tenantA, tokenA, "approval-rules", command);
      expect(created.status()).toBe(201);
      const record: TenantApprovalRuleRecord = (await created.json()).data;
      expect(record.ruleId).toBeTruthy();
      evidence.recordResourceId("tenant_approval_rule", record.ruleId);
      const path = `approval-rules/${encodeURIComponent(record.ruleId)}`;
      const getRecord = async () => {
        const response = await call(tenantA, tokenA, path);
        expect(response.status()).toBe(200);
        return (await response.json()).data;
      };
      expect(await getRecord()).toMatchObject({
        ...command,
        tenantId: tenantA,
        activeFlag: true,
      });
      const evaluate = async (passengerId: string) => {
        const response = await call(
          tenantA,
          tokenA,
          "approval-rules/evaluate",
          {
            sampleBooking: { passengerId },
          },
        );
        expect(response.status()).toBe(201);
        const result = (await response.json()).data;
        expect(Array.isArray(result.matchedRules)).toBe(true);
        return result.matchedRules.some(
          (rule: { ruleId: string }) => rule.ruleId === record.ruleId,
        );
      };
      // The dry-run input is explicit API input, not a provisioned passenger.
      // Check this rule's match without assuming the tenant has no other rules.
      expect(await evaluate(run)).toBe(true);
      expect(await evaluate(`${run}-different`)).toBe(false);
      const updated = {
        ...command,
        ruleId: record.ruleId,
        ruleName: `${run}-updated`,
      };
      expect(
        (await call(tenantA, tokenA, "approval-rules", updated)).status(),
      ).toBe(201);
      const beforeRejectedWrites = await getRecord();
      expect(beforeRejectedWrites).toMatchObject(updated);
      for (const suffix of ["", "/disable"]) {
        const response = await call(
          tenantB,
          tokenB,
          `${path}${suffix}`,
          suffix ? {} : undefined,
        );
        expect(response.status()).toBe(404);
        expect((await response.json()).error.code).toBe(
          "TENANT_APPROVAL_RULE_NOT_FOUND",
        );
      }
      expect(
        (
          await call(tenantA, tokenA, "approval-rules", {
            ...updated,
            ruleName: " ",
          })
        ).status(),
      ).toBe(400);
      expect(await getRecord()).toEqual(beforeRejectedWrites);
      expect(
        (
          await read<TenantApprovalRuleRecord>(
            tenantB,
            tokenB,
            "approval-rules",
          )
        ).some((rule) => rule.ruleId === record.ruleId),
      ).toBe(false);
      expect(
        (await call(tenantA, tokenA, `${path}/disable`, {})).status(),
      ).toBe(201);
      expect(await getRecord()).toMatchObject({
        ruleId: record.ruleId,
        activeFlag: false,
        disabledAt: expect.any(String),
      });
      expect(await evaluate(run)).toBe(false);
      expect(
        (
          await read<TenantApprovalRuleRecord>(
            tenantA,
            tokenA,
            "approval-rules?activeOnly=true",
          )
        ).some((rule) => rule.ruleId === record.ruleId),
      ).toBe(false);
    } finally {
      await client.dispose();
    }
    evidence.recordLiveLimitation(
      "Persistence and remaining capabilities",
      "Approval rule API readback and dry-run matching only. Real booking approval/rejection, approver permissions, audit/DB durability and mail delivery remain unverified. Failures retain resource IDs for cleanup.",
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
