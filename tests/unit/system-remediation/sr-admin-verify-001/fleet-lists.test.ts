import { afterEach, describe, expect, it, vi } from "vitest";

import {
  toApiErrorEnvelope,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../../../apps/api/src/common/api-envelope";
import {
  listFleetPartnerDrivers,
  listFleetPartners,
  listFleetStatements,
  listRevenueShareRules,
} from "../../../../apps/platform-admin-web/app/fleet-partners/fleet-partner-shared";
import { ApiClient } from "../../../../packages/api-client/src";

// Test-only resource IDs and transport. The envelope builders and consumers
// are production code; this suite does not claim a deployed API/DB round trip.
const partnerId = "sr-admin/fleet test";
const partnerPath = `/api/admin/fleet-partners/${encodeURIComponent(partnerId)}`;
const listCases = [
  {
    name: "partners",
    path: "/api/admin/fleet-partners",
    load: listFleetPartners,
    row: {
      fleet_partner_id: partnerId,
      display_name: "Regression Fleet",
      active: true,
    },
    expected: {
      fleetPartnerId: partnerId,
      displayName: "Regression Fleet",
      active: true,
    },
  },
  {
    name: "driver affiliations",
    path: `${partnerPath}/drivers`,
    load: (client: ApiClient) => listFleetPartnerDrivers(client, partnerId),
    row: {
      affiliation_id: "sr-admin-affiliation",
      driver_id: "sr-admin-driver",
      fleet_partner_id: partnerId,
    },
    expected: {
      affiliationId: "sr-admin-affiliation",
      driverId: "sr-admin-driver",
      fleetPartnerId: partnerId,
    },
  },
  {
    name: "revenue share rules",
    path: `${partnerPath}/revenue-share-rules`,
    load: (client: ApiClient) => listRevenueShareRules(client, partnerId),
    row: {
      rule_id: "sr-admin-rule",
      fleet_partner_id: partnerId,
      rate_bps: 1500,
    },
    expected: {
      ruleId: "sr-admin-rule",
      fleetPartnerId: partnerId,
      rateBps: 1500,
    },
  },
  {
    name: "statements",
    path: `${partnerPath}/statements`,
    load: (client: ApiClient) => listFleetStatements(client, partnerId),
    row: {
      statement_id: "sr-admin-statement",
      fleet_partner_id: partnerId,
      period_month: "2026-09",
    },
    expected: {
      statementId: "sr-admin-statement",
      fleetPartnerId: partnerId,
      periodMonth: "2026-09",
    },
  },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(listCases)(
  "SR-ADMIN-VERIFY-001 fleet $name",
  ({ path, load, row, expected }) => {
    const client = () =>
      new ApiClient({ baseUrl: "http://fleet-regression.test" });

    it("loads the canonical list envelope and preserves encoded resource IDs", async () => {
      const fetchMock = vi.fn(async () =>
        Response.json(
          toApiSuccessEnvelope(toApiListData([row]), "sr-admin-list-request"),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await load(client());
      expect(result).toEqual([expect.objectContaining(expected)]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `http://fleet-regression.test${path}`,
      );
    });

    it("handles a successful zero-row API envelope without a map crash", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            toApiSuccessEnvelope(toApiListData([]), "sr-admin-empty-request"),
          ),
        ),
      );

      await expect(load(client())).resolves.toEqual([]);
    });

    it.each([403, 503])(
      "preserves HTTP %s as failure rather than a successful empty list",
      async (status) => {
        const fetchMock = vi.fn(async () =>
          Response.json(
            toApiErrorEnvelope(
              "FLEET_READ_FAILED",
              "Fleet authority rejected this request.",
            ),
            { status },
          ),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(load(client())).rejects.toMatchObject({
          statusCode: status,
          code: "FLEET_READ_FAILED",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
  },
);
