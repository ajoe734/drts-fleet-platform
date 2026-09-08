import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext } from "@playwright/test";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`Missing ${name}; tenant API acceptance cannot run`);
  return value;
}

test("C027/C008/C009 passenger-address writes, readback and tenant isolation", async ({
  playwright,
}, testInfo) => {
  const baseURL = required("DRTS_TENANT_UAT_API_URL");
  const tenantA = required("DRTS_TENANT_UAT_TENANT_A");
  const tenantB = required("DRTS_TENANT_UAT_TENANT_B");
  expect(tenantA).not.toBe(tenantB);
  // Supply provisioned disposable tenants and real bearer credentials. No fake roles.
  const contexts: APIRequestContext[] = [];
  async function context(tenantId: string, tokenName: string) {
    const result = await playwright.request.newContext({
      baseURL: `${baseURL.replace(/\/$/, "")}/`,
      extraHTTPHeaders: {
        authorization: `Bearer ${required(tokenName)}`,
        "x-tenant-id": tenantId,
      },
    });
    contexts.push(result);
    return result;
  }
  const runId = randomUUID();
  const calls: { method: string; path: string; status: number }[] = [];
  const resources: { type: string; id: string }[] = [];
  async function post(client: APIRequestContext, path: string, data: object) {
    const response = await client.post(path, { data });
    calls.push({ method: "POST", path, status: response.status() });
    return response;
  }
  async function list(client: APIRequestContext, path: string) {
    const response = await client.get(path);
    calls.push({ method: "GET", path, status: response.status() });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data.items)).toBe(true);
    return body.data.items as Record<string, unknown>[];
  }
  try {
    const a = await context(tenantA, "DRTS_TENANT_UAT_TOKEN_A");
    const b = await context(tenantB, "DRTS_TENANT_UAT_TOKEN_B");
    const reader = await context(tenantA, "DRTS_TENANT_UAT_TOKEN_READONLY");
    const passenger = { fullName: `UAT ${runId}`, employeeNo: runId };
    const created = await post(a, "tenant/passengers", passenger);
    expect(created.status()).toBe(201);
    const { passengerId } = (await created.json()).data;
    expect(typeof passengerId).toBe("string");
    expect(passengerId.length).toBeGreaterThan(0);
    resources.push({ type: "passenger", id: passengerId });
    expect(await list(a, "tenant/passengers")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passengerId,
          tenantId: tenantA,
          ...passenger,
        }),
      ]),
    );
    const address = {
      ownerPassengerId: passengerId,
      addressName: `UAT ${runId}`,
      addressText: "台北市信義區市府路 1 號",
      geocodeSource: "manual",
      lat: 25.0375,
      lng: 121.5637,
    };
    const added = await post(a, "tenant/addresses", address);
    expect(added.status()).toBe(201);
    const { addressId } = (await added.json()).data;
    expect(typeof addressId).toBe("string");
    expect(addressId.length).toBeGreaterThan(0);
    resources.push({ type: "address", id: addressId });
    expect(await list(a, "tenant/addresses")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ addressId, tenantId: tenantA, ...address }),
      ]),
    );

    // Invalid foreign owner must not create a row in tenant B.
    const beforeB = await list(b, "tenant/addresses");
    expect((await post(b, "tenant/addresses", address)).status()).toBe(404);
    expect(await list(b, "tenant/addresses")).toEqual(beforeB);
    expect(await list(b, "tenant/passengers")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ passengerId })]),
    );
    expect(
      (
        await post(b, "tenant/passengers", { ...passenger, passengerId })
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(reader, "tenant/passengers", { ...passenger, passengerId })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(a, "tenant/passengers", { passengerId, fullName: " " })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(a, "tenant/addresses", {
          ...address,
          addressId,
          addressText: " ",
        })
      ).status(),
    ).toBe(400);
    expect(await list(a, "tenant/passengers")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ passengerId, ...passenger }),
      ]),
    );
    expect(await list(a, "tenant/addresses")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ addressId, ...address }),
      ]),
    );

    // Update the same IDs, then verify values and uniqueness through a fresh request.
    const updatedName = `Updated ${runId}`;
    expect(
      (
        await post(a, "tenant/passengers", {
          passengerId,
          fullName: updatedName,
        })
      ).status(),
    ).toBe(201);
    expect(
      (await list(a, "tenant/passengers")).filter(
        (row) => row.passengerId === passengerId,
      ),
    ).toEqual([
      expect.objectContaining({ passengerId, fullName: updatedName }),
    ]);
    expect(
      (
        await post(a, "tenant/addresses", {
          ...address,
          addressId,
          activeFlag: false,
        })
      ).status(),
    ).toBe(201);
    expect(
      (await list(a, "tenant/addresses")).filter(
        (row) => row.addressId === addressId,
      ),
    ).toEqual([
      expect.objectContaining({
        addressId,
        ownerPassengerId: passengerId,
        activeFlag: false,
      }),
    ]);
  } finally {
    await testInfo.attach("tenant-directory-evidence", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(
          {
            runId,
            baseSha: execFileSync("git", ["rev-parse", "origin/dev"], {
              encoding: "utf8",
            }).trim(),
            testedSha: execFileSync("git", ["rev-parse", "HEAD"], {
              encoding: "utf8",
            }).trim(),
            resources,
            calls,
            limitation:
              "API readback only; DB restart, browser login and mailbox delivery are separate pending gates. Dispose the provisioned test tenants after collecting evidence.",
          },
          null,
          2,
        ),
      ),
    });
    await Promise.all(contexts.map((client) => client.dispose()));
  }
});
