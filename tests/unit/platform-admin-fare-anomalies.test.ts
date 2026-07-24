import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FARE_QUOTE_ANOMALIES,
  type FareQuoteAnomalyAdminView,
} from "@drts/contracts";

import {
  hasFareAnomalyReadScope,
  hasFareAnomalyWriteScope,
  parseFareAnomalyListReadModel,
  resolveFareAnomalyPageState,
  resolveRetryAction,
} from "../../apps/platform-admin-web/app/p5-fare-anomalies/fare-anomaly-model";
import { FARE_ANOMALY_TRANSLATIONS } from "../../apps/platform-admin-web/app/p5-fare-anomalies/translations";

function buildItem(): FareQuoteAnomalyAdminView {
  return {
    reason: "quote_provider_unavailable",
    snapshot: {
      routeSnapshotId: "route-001",
      quoteSnapshotId: "quote-001",
      orderId: "order-001",
      pickup: {
        address: "台北市信義區松仁路",
        lat: 25.033,
        lng: 121.568,
        coordinateSource: "provider_candidate",
        geocodeConfidence: "exact",
        resolvedAt: "2026-07-24T08:00:00.000Z",
      },
      dropoff: {
        address: "台北市南港區經貿二路",
        lat: 25.056,
        lng: 121.618,
        coordinateSource: "provider_candidate",
        geocodeConfidence: "exact",
        resolvedAt: "2026-07-24T08:01:00.000Z",
      },
      estimatedDistanceMeters: 8200,
      estimatedDurationSeconds: 1400,
      encodedPolyline: null,
      chargingMode: "fixed_quote",
      estimatedFareMinor: null,
      payableFareMinor: null,
      currency: "NTD",
      farePolicyId: "fare-policy-001",
      farePolicyVersion: "FARE-MTX-2026-07",
      fareChangeRuleId: "fare-change-001",
      fareChangeRuleVersion: "1",
      fareChangeRuleDisplayText: "Fare changes require passenger confirmation.",
      passengerConfirmedAt: null,
      generatedAt: "2026-07-24T08:02:00.000Z",
    },
    availableActions: [
      {
        action: "retry_quote",
        enabled: true,
        riskLevel: "medium",
      },
    ],
    recoveryPending: false,
    lastRecoveryRequestedAt: null,
  };
}

function buildListPayload(item = buildItem()) {
  return {
    items: [item],
    refresh: {
      generatedAt: "2026-07-24T09:00:00.000Z",
      staleAfterMs: 30_000,
      dataFreshness: "fresh",
      source: "live",
    },
  };
}

describe("Platform Admin fare anomaly states", () => {
  it.each([
    {
      expected: "permission_denied",
      input: { canRead: false, loading: true, error: null, itemCount: 1 },
    },
    {
      expected: "loading",
      input: { canRead: true, loading: true, error: null, itemCount: 0 },
    },
    {
      expected: "error",
      input: {
        canRead: true,
        loading: false,
        error: "unavailable",
        itemCount: 0,
      },
    },
    {
      expected: "empty",
      input: { canRead: true, loading: false, error: null, itemCount: 0 },
    },
    {
      expected: "ready",
      input: { canRead: true, loading: false, error: null, itemCount: 1 },
    },
  ])("resolves $expected without fallback data", ({ expected, input }) => {
    expect(resolveFareAnomalyPageState(input)).toBe(expected);
  });

  it("requires explicit read and write scopes", () => {
    expect(hasFareAnomalyReadScope([])).toBe(false);
    expect(hasFareAnomalyReadScope(["foundation:read"])).toBe(true);
    expect(hasFareAnomalyWriteScope(["foundation:read"])).toBe(false);
    expect(
      hasFareAnomalyWriteScope(["foundation:read", "foundation:write"]),
    ).toBe(true);
  });

  it("only enables retry from server availableActions and write authority", () => {
    const item = buildItem();
    expect(resolveRetryAction(item, true)).toMatchObject({
      action: "retry_quote",
      enabled: true,
    });
    expect(resolveRetryAction(item, false)).toMatchObject({
      enabled: false,
      disabledReasonCode: "PERMISSION_DENIED",
    });
    expect(
      resolveRetryAction({ ...item, availableActions: [] }, true),
    ).toBeNull();
  });

  it("covers exactly the five canonical anomaly reasons", () => {
    for (const locale of ["zh", "en"] as const) {
      expect(
        Object.keys(FARE_ANOMALY_TRANSLATIONS[locale].reasons).sort(),
      ).toEqual([...FARE_QUOTE_ANOMALIES].sort());
    }
  });
});

describe("Platform Admin fare anomaly response validation", () => {
  it("accepts a live, unconfirmed anomaly read model", () => {
    expect(
      parseFareAnomalyListReadModel(buildListPayload()).items,
    ).toHaveLength(1);
  });

  it("rejects malformed actions and passenger-confirmed anomalies", () => {
    const malformedAction = buildItem();
    malformedAction.availableActions = [
      { action: "retry_quote", enabled: true } as never,
    ];
    expect(() =>
      parseFareAnomalyListReadModel(buildListPayload(malformedAction)),
    ).toThrow("FARE_ANOMALY_ACTION_AUTHORITY_INVALID");

    const confirmed = buildItem();
    confirmed.snapshot.passengerConfirmedAt = "2026-07-24T09:00:00.000Z";
    expect(() =>
      parseFareAnomalyListReadModel(buildListPayload(confirmed)),
    ).toThrow("FARE_ANOMALY_CONFIRMED_SNAPSHOT_REJECTED");
  });

  it("keeps queue/detail production source free of manual fare inputs", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "apps/platform-admin-web/app/p5-fare-anomalies/fare-anomaly-screen.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('data-screen-id="P5-COM-UI-01"');
    expect(source).toContain('data-screen-variant="detail"');
    expect(source).toContain("resolveRetryAction");
    expect(source).not.toMatch(/type=["']number["']/);
    expect(source).not.toContain("manualFare");
    expect(source).not.toContain("fareOverride");
  });
});
