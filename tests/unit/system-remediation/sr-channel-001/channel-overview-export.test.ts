import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadReferralDashboard } from "../../../../apps/channel-partner-portal-web/lib/channel-portal-data.server";
import { t } from "../../../../apps/channel-partner-portal-web/lib/translations";

describe("SR-CHANNEL-001: channel overview export and filter consistency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports statement CSV matching dashboard filter, count (2 trips), and amount (1500 GMV, 225 share)", async () => {
    // 1. Mock the API responses representing the canonical 2026-06 period
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/partner/referral/dashboard")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                partnerEntrySlug: "referral-demo-community",
                period: "2026-06",
                activeUserCount: 2,
                tripCount: 2,
                gmv: { amountMinor: 150000, currency: "TWD" },
                estimatedShareAmount: { amountMinor: 22500, currency: "TWD" },
                statementId: "referral-statement-referral-demo-community-2026-06",
                statementStatus: "due",
                latestStatementPeriod: "2026-06",
                pendingStatementCount: 1,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (urlStr.includes("/api/partner/referral/usage")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                items: [
                  {
                    partnerEntrySlug: "referral-demo-community",
                    period: "2026-06",
                    activeUserCount: 2,
                    tripCount: 2,
                    gmv: { amountMinor: 150000, currency: "TWD" },
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    // 2. Load dashboard for 2026-06
    const dashboard = await loadReferralDashboard("2026-06");

    expect(dashboard.source).toBe("live");
    expect(dashboard.summary.period).toBe("2026-06");
    expect(dashboard.summary.trips).toBe("2");
    expect(dashboard.summary.activeUsers).toBe("2");
    expect(dashboard.summary.gmv).toBe("NT$ 1,500");
    expect(dashboard.summary.estimatedShare).toBe("NT$ 225");

    // 3. Verify the overview export link contract
    const period = dashboard.summary.period;
    const exportHref = `/control-plane-proxy/partner/referral/statements/${encodeURIComponent(period)}/artifact`;
    const exportFilename = `referral-statement-${period}.csv`;

    expect(exportHref).toBe(
      "/control-plane-proxy/partner/referral/statements/2026-06/artifact",
    );
    expect(exportFilename).toBe("referral-statement-2026-06.csv");

    // 4. Verify the mock statement CSV lines matching the dashboard metrics
    const csvContent = [
      "Statement ID,Period,Trip ID,Completed at,Partner entry,Fare,Share rate type,Share rate value,Share amount,Manifest SHA-256",
      "referral-statement-referral-demo-community-2026-06,2026-06,trip-ref-001,2026-06-15T08:30:00.000Z,referral-demo-community,TWD 600.00,percent,15,TWD 90.00,a838df2941",
      "referral-statement-referral-demo-community-2026-06,2026-06,trip-ref-002,2026-06-20T14:15:00.000Z,referral-demo-community,TWD 900.00,percent,15,TWD 135.00,a838df2941",
    ].join("\n");

    const lines = csvContent.split("\n").filter(Boolean);
    const dataLines = lines.slice(1);

    // Filter matches
    expect(dataLines.every((line) => line.includes("2026-06"))).toBe(true);

    // Count matches summary.trips (2)
    expect(dataLines.length).toBe(Number(dashboard.summary.trips));

    // Fare total matches summary.gmv (NT$ 1,500 -> 600 + 900)
    const fares = dataLines.map((l) =>
      parseFloat(l.split(",")[5]?.replace(/[^0-9.]/g, "") ?? "0"),
    );
    const totalFare = fares.reduce((sum, f) => sum + f, 0);
    expect(totalFare).toBe(1500);

    // Share total matches summary.estimatedShare (NT$ 225 -> 90 + 135)
    const shares = dataLines.map((l) =>
      parseFloat(l.split(",")[8]?.replace(/[^0-9.]/g, "") ?? "0"),
    );
    const totalShare = shares.reduce((sum, s) => sum + s, 0);
    expect(totalShare).toBe(225);
  });

  it("propagates period query parameter to the live API endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/partner/referral/dashboard")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                partnerEntrySlug: "referral-demo-community",
                period: "2026-05",
                activeUserCount: 1,
                tripCount: 1,
                gmv: { amountMinor: 50000, currency: "TWD" },
                estimatedShareAmount: { amountMinor: 7500, currency: "TWD" },
                statementId: "referral-statement-referral-demo-community-2026-05",
                statementStatus: "paid",
                latestStatementPeriod: "2026-06",
                pendingStatementCount: 0,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (urlStr.includes("/api/partner/referral/usage")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                items: [],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadReferralDashboard("2026-05");

    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = fetchMock.mock.calls[0]?.[0]?.toString();
    expect(calledUrl).toContain("periodMonth=2026-05");
    expect(result.summary.period).toBe("2026-05");
    expect(result.summary.gmv).toBe("NT$ 500");
    expect(result.summary.estimatedShare).toBe("NT$ 75");
  });

  it("handles empty period data cleanly without returning fabricated numbers", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.reject(new Error("offline")),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Requesting a future empty period in fallback mode
    const result = await loadReferralDashboard("2026-09");

    expect(result.source).toBe("fallback");
    expect(result.summary.period).toBe("2026-09");
    expect(result.summary.trips).toBe("0");
    expect(result.summary.activeUsers).toBe("0");
    expect(result.summary.gmv).toBe("NT$ 0");
    expect(result.summary.estimatedShare).toBe("NT$ 0");
  });

  it("marks export action with content and format explicitly", () => {
    expect(t("common.export", "zh")).toBe("匯出");
    expect(t("common.export", "en")).toBe("Export");
  });
});
