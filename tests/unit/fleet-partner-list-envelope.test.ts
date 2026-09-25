import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../packages/api-client/src";
import {
  listFleetPartners,
  listFleetPartnerDrivers,
  listRevenueShareRules,
  listFleetStatements,
} from "../../apps/platform-admin-web/app/fleet-partners/fleet-partner-shared";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * The admin fleet-partner routes all return `toApiSuccessEnvelope(toApiListData(...))`,
 * so the unwrapped `data` payload is `{ items, pageInfo }` — never a bare array.
 * Reading it as an array produced "((intermediate value) ?? []).map is not a
 * function" on the 車隊夥伴 console and blanked every fleet-partner surface.
 */
function listEnvelope(items: unknown[]) {
  return {
    data: {
      items,
      pageInfo: {
        page: 1,
        pageSize: items.length || 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    },
  };
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => body,
        text: async () => "",
      }) as Response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function client() {
  return new ApiClient({ baseUrl: "http://api.test" });
}

describe("fleet-partner admin list parsing against the API list envelope", () => {
  it("reads fleet partners out of the { items, pageInfo } payload", async () => {
    stubFetch(
      listEnvelope([
        {
          fleetPartnerId: "fp-001",
          legalName: "示範車隊有限公司",
          displayName: "示範車隊",
          businessRegistrationNo: "12345678",
          contactName: "王小明",
          contactPhone: "0912345678",
          active: true,
          partnershipType: "fleet_management",
        },
      ]),
    );

    const partners = await listFleetPartners(client());

    expect(partners).toHaveLength(1);
    expect(partners[0]?.fleetPartnerId).toBe("fp-001");
    expect(partners[0]?.displayName).toBe("示範車隊");
  });

  it("reads driver affiliations out of the list payload", async () => {
    stubFetch(
      listEnvelope([
        {
          affiliationId: "aff-001",
          driverId: "drv-001",
          fleetPartnerId: "fp-001",
          affiliationType: "managed_by",
          effectiveFrom: "2026-01-01",
          effectiveUntil: null,
        },
      ]),
    );

    const affiliations = await listFleetPartnerDrivers(client(), "fp-001");

    expect(affiliations).toHaveLength(1);
    expect(affiliations[0]?.driverId).toBe("drv-001");
  });

  it("reads revenue share rules out of the list payload", async () => {
    stubFetch(
      listEnvelope([
        {
          ruleId: "rule-001",
          fleetPartnerId: "fp-001",
          appliesTo: "all_trips",
          formula: "percent_of_gross",
          rateBps: 1500,
          effectiveFrom: "2026-01-01",
        },
      ]),
    );

    const rules = await listRevenueShareRules(client(), "fp-001");

    expect(rules).toHaveLength(1);
    expect(rules[0]?.ruleId).toBe("rule-001");
  });

  it("reads statements out of the list payload", async () => {
    stubFetch(
      listEnvelope([
        {
          statementId: "stmt-001",
          fleetPartnerId: "fp-001",
          periodMonth: "2026-08",
        },
      ]),
    );

    const statements = await listFleetStatements(client(), "fp-001");

    expect(statements).toHaveLength(1);
    expect(statements[0]?.statementId).toBe("stmt-001");
  });

  it("returns an empty list instead of throwing when the payload is empty", async () => {
    stubFetch(listEnvelope([]));
    await expect(listFleetPartners(client())).resolves.toEqual([]);

    stubFetch({ data: null });
    await expect(listFleetPartners(client())).resolves.toEqual([]);
  });

  it("still accepts a bare array payload from unwrapped list routes", async () => {
    stubFetch({
      data: [
        {
          fleetPartnerId: "fp-002",
          legalName: "Legacy Fleet",
          displayName: "Legacy",
          businessRegistrationNo: "87654321",
          contactName: "Contact",
          contactPhone: "0900000000",
          active: false,
          partnershipType: "driver_recruitment",
        },
      ],
    });

    const partners = await listFleetPartners(client());

    expect(partners).toHaveLength(1);
    expect(partners[0]?.fleetPartnerId).toBe("fp-002");
  });
});
