import { describe, expect, it } from "vitest";

import {
  canReceiveOrders,
  deriveBlockingReasons,
  getMechanismActionLabel,
  getPlatformReauthMechanism,
  resolveEmptyReason,
  type PlatformPresenceViewSummary,
} from "../../lib/platform-presence-view";

const baseRecord = {
  driverId: "driver-001",
  platformCode: "uber" as const,
  accountId: "acct-001",
  status: "online" as const,
  eligibility: "eligible" as const,
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  reauthRequired: false,
  lastOnlineAt: "2026-05-27T00:00:00.000Z",
  lastOfflineAt: null,
  updatedAt: "2026-05-27T00:00:00.000Z",
};

describe("platform-presence-view helpers", () => {
  it("maps fallback reauth mechanisms per platform", () => {
    expect(getPlatformReauthMechanism(baseRecord)).toBe(
      "external_browser_oauth",
    );
    expect(
      getPlatformReauthMechanism({ ...baseRecord, platformCode: "grab" }),
    ).toBe("native_app_deeplink");
    expect(
      getPlatformReauthMechanism({ ...baseRecord, platformCode: "line-taxi" }),
    ).toBe("manual_credential");
    expect(
      getPlatformReauthMechanism({
        ...baseRecord,
        platformCode: "grab_taiwan",
      }),
    ).toBe("ops_managed");
    expect(getMechanismActionLabel("ops_managed")).toBe("聯絡派車台");
  });

  it("derives blocking reasons from legacy presence fields", () => {
    expect(
      deriveBlockingReasons(
        {
          ...baseRecord,
          accountId: null,
          status: "offline",
          reauthRequired: true,
          eligibility: "ineligible",
          ineligibleReasons: ["缺少營業證件"],
        },
        {
          platformCode: "uber",
          status: "degraded",
          blockingReason: "平台同步延遲",
          lastSyncAt: null,
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        "尚未綁定平台帳號",
        "平台目前為離線",
        "需要重新授權",
        "目前不符合派單資格",
        "缺少營業證件",
        "平台同步延遲",
      ]),
    );
  });

  it("prefers explicit canReceiveOrders and otherwise infers from presence status", () => {
    expect(
      canReceiveOrders(
        { ...baseRecord, canReceiveOrders: true },
        {
          platformCode: "uber",
          status: "down",
          blockingReason: "ignored because explicit override",
          lastSyncAt: null,
        },
      ),
    ).toBe(true);

    expect(
      canReceiveOrders(baseRecord, {
        platformCode: "uber",
        status: "healthy",
        blockingReason: null,
        lastSyncAt: null,
      }),
    ).toBe(true);

    expect(
      canReceiveOrders(
        { ...baseRecord, eligibility: "ineligible" },
        {
          platformCode: "uber",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: null,
        },
      ),
    ).toBe(false);
  });

  it("resolves empty states distinctly", () => {
    const summary: PlatformPresenceViewSummary = {
      driverId: "driver-001",
      presences: [{ ...baseRecord, eligibility: "ineligible" }],
      adapterStatuses: [
        {
          platformCode: "uber",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: null,
        },
      ],
    };

    expect(
      resolveEmptyReason({
        isProvisioned: false,
        summary: null,
        filteredCount: 0,
      }),
    ).toBe("not_provisioned");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary: null,
        filteredCount: 0,
        permissionDenied: true,
      }),
    ).toBe("permission_denied");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary,
        filteredCount: 0,
      }),
    ).toBe("filtered_empty");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary: {
          ...summary,
          presences: [
            { ...baseRecord, platformCode: "grab", eligibility: "eligible" },
          ],
          adapterStatuses: [
            {
              platformCode: "grab",
              status: "down",
              blockingReason: "平台轉接中斷",
              lastSyncAt: null,
            },
          ],
        },
        filteredCount: 1,
      }),
    ).toBe("external_unavailable");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary,
        filteredCount: 1,
      }),
    ).toBe("driver_not_eligible");
  });
});
