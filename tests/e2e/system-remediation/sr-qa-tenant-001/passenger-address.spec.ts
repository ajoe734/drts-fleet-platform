import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type {
  TenantAddressRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

// Requires actual sessions for two disposable, authorized tenants. No bootstrap
// identity headers, mocked responses, external messages, or production targets.
test("C027 passenger/address writes, relation readback and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const evidence = new UatEvidenceRecorder({
    taskId: "SR-QA-TENANT-001",
    baseSha: process.env.BASE_SHA ?? "fa0fd8257950764526a522d091be9d97effa82b9",
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
      // Check both sessions before creating any resources.
      await read(tenantA, tokenA, "passengers");
      await read(tenantB, tokenB, "passengers");
      const created = await call(tenantA, tokenA, "passengers", {
        fullName: run,
      });
      expect(created.status()).toBe(201);
      const passenger: TenantPassengerRecord = (await created.json()).data;
      expect(passenger.passengerId).toBeTruthy();
      evidence.recordResourceId("passenger", passenger.passengerId);
      expect(await read(tenantA, tokenA, "passengers")).toContainEqual(
        expect.objectContaining({
          passengerId: passenger.passengerId,
          fullName: run,
          tenantId: tenantA,
        }),
      );
      const addressCommand = {
        addressName: run,
        addressText: "UAT controlled address",
        ownerPassengerId: passenger.passengerId,
      };
      const addressResponse = await call(
        tenantA,
        tokenA,
        "addresses",
        addressCommand,
      );
      expect(addressResponse.status()).toBe(201);
      const address: TenantAddressRecord = (await addressResponse.json()).data;
      expect(address.addressId).toBeTruthy();
      evidence.recordResourceId("address", address.addressId);
      expect(await read(tenantA, tokenA, "addresses")).toContainEqual(
        expect.objectContaining({
          addressId: address.addressId,
          ownerPassengerId: passenger.passengerId,
          tenantId: tenantA,
        }),
      );

      const crossPassenger = await call(tenantB, tokenB, "passengers", {
        passengerId: passenger.passengerId,
        fullName: `${run}-forbidden`,
      });
      expect(crossPassenger.status()).toBe(404);
      expect((await crossPassenger.json()).error.code).toBe(
        "PASSENGER_NOT_FOUND",
      );
      const crossAddress = await call(tenantB, tokenB, "addresses", {
        ...addressCommand,
        addressId: address.addressId,
      });
      expect(crossAddress.status()).toBe(404);
      expect((await crossAddress.json()).error.code).toBe("ADDRESS_NOT_FOUND");
      const crossOwner = await call(
        tenantB,
        tokenB,
        "addresses",
        addressCommand,
      );
      expect(crossOwner.status()).toBe(404);
      expect((await crossOwner.json()).error.code).toBe("PASSENGER_NOT_FOUND");
      const invalid = await call(tenantA, tokenA, "passengers", {
        passengerId: passenger.passengerId,
        fullName: " ",
      });
      expect(invalid.status()).toBe(400);
      expect(await read(tenantA, tokenA, "passengers")).toContainEqual(
        expect.objectContaining({
          passengerId: passenger.passengerId,
          fullName: run,
        }),
      );
      expect(await read(tenantA, tokenA, "addresses")).toContainEqual(
        expect.objectContaining({
          addressId: address.addressId,
          ownerPassengerId: passenger.passengerId,
          addressName: run,
        }),
      );
      expect(
        (await read<TenantPassengerRecord>(tenantB, tokenB, "passengers")).some(
          (p) => p.passengerId === passenger.passengerId,
        ),
      ).toBe(false);
      expect(
        (await read<TenantAddressRecord>(tenantB, tokenB, "addresses")).some(
          (a) => a.addressId === address.addressId || a.addressName === run,
        ),
      ).toBe(false);

      // Retire exactly this run's records through the same authoritative API.
      expect(
        (
          await call(tenantA, tokenA, "addresses", {
            ...addressCommand,
            addressId: address.addressId,
            activeFlag: false,
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await call(tenantA, tokenA, "passengers", {
            passengerId: passenger.passengerId,
            fullName: run,
            activeFlag: false,
          })
        ).status(),
      ).toBe(201);
      expect(await read(tenantA, tokenA, "addresses")).toContainEqual(
        expect.objectContaining({
          addressId: address.addressId,
          activeFlag: false,
        }),
      );
      expect(await read(tenantA, tokenA, "passengers")).toContainEqual(
        expect.objectContaining({
          passengerId: passenger.passengerId,
          activeFlag: false,
        }),
      );
    } finally {
      await client.dispose();
    }
    evidence.recordLiveLimitation(
      "Persistence and remaining capabilities",
      "HTTP readback does not prove restart durability. Users, cost centers, quota, rules, SLA, invites, approvals, flags and tenant lifecycle still require HTTP/DB acceptance; no external mail or real devices tested.",
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
