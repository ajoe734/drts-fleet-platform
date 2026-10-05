import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { loadReferralDashboard } from "../../../../apps/channel-partner-portal-web/lib/channel-portal-data.server";
import type { IdentityContext } from "@drts/contracts";

const partnerIdentity: IdentityContext = {
  actorType: "partner_api_key",
  actorId: "partner-referral-demo-001",
  realm: "partner",
  authMode: "bootstrap_headers",
  roleFamilies: ["partner"],
  roles: ["partner"],
  scopes: ["billing:read"],
  tenantId: "tenant-demo-001",
  partnerId: "partner-referral-demo-001",
  partnerProgramId: "program-referral-community",
  partnerEntrySlug: "referral-demo-community",
  supportedExecutionModes: ["discussion_planning"],
};

describe("SR-CHANNEL-001: overview export and reconciliation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the authoritative 2-trip / 1500 / 225 statement for the selected period", async () => {
    const auditNotifications = new AuditNotificationService();
    const settlements = new BillingSettlementService(auditNotifications);
    const partners = new TenantPartnerService(auditNotifications);

    const statement = settlements.getReferralStatement(
      "referral-demo-community",
      "2026-06",
    );
    const dashboard = await partners.getPartnerReferralDashboard(
      partnerIdentity,
      settlements,
      "2026-06",
    );

    expect(statement.lines).toHaveLength(2);
    expect(statement.totals.gmv.amountMinor).toBe(150000);
    expect(statement.totals.shareTotal.amountMinor).toBe(22500);
    expect(dashboard.period).toBe("2026-06");
    expect(dashboard.tripCount).toBe(statement.totals.tripCount);
    expect(dashboard.gmv).toEqual(statement.totals.gmv);
    expect(dashboard.estimatedShareAmount).toEqual(statement.totals.shareTotal);
  });

  it("passes the dashboard period to the authoritative API and reports an empty fallback honestly", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      if (url.toString().includes("/dashboard")) {
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
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { items: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const live = await loadReferralDashboard("2026-06");
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      "periodMonth=2026-06",
    );
    expect(live.summary).toMatchObject({
      period: "2026-06",
      trips: "2",
      gmv: "NT$ 1,500",
      estimatedShare: "NT$ 225",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const empty = await loadReferralDashboard("2026-09");
    expect(empty.source).toBe("fallback");
    expect(empty.summary).toMatchObject({
      period: "2026-09",
      trips: "0",
      gmv: "NT$ 0",
      estimatedShare: "NT$ 0",
    });
  });

  it("wires the visible overview action to the selected statement CSV without exposing artifact IDs in the list", async () => {
    const [dashboard, tables] = await Promise.all([
      readFile(
        "apps/channel-partner-portal-web/app/dashboard/page.tsx",
        "utf8",
      ),
      readFile(
        "apps/channel-partner-portal-web/components/referral-tables.tsx",
        "utf8",
      ),
    ]);

    expect(dashboard).toContain('data-drt-operation="channel-overview-export"');
    expect(dashboard).toContain(
      "statements/${encodeURIComponent(currentPeriod)}/artifact",
    );
    expect(dashboard).toContain("download={`referral-statement-${currentPeriod}.csv`}");
    expect(dashboard).toContain("<DashboardPeriodFilter");
    expect(tables).toContain('data-drt-filter="period"');
    expect(tables).not.toContain("{r.artifactId}");
  });
});
