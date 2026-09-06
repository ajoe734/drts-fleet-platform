import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { GET as proxyGet } from "../../../../apps/channel-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { t } from "../../../../apps/channel-partner-portal-web/lib/translations";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { IdentityContext } from "@drts/contracts";

function proxyContext(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

function proxyRequest(path: string[], init?: RequestInit) {
  return new NextRequest(
    new Request(`http://channel.example/control-plane-proxy/${path.join("/")}`, {
      ...init,
      method: "GET",
    }),
  );
}

const canonicalIdentity: IdentityContext = {
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

describe("SR-CHANNEL-001: settlement regression (2 trips / 1500 / 225) and service failure handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_API_URL;
    delete process.env.DRTS_PARTNER_ENTRY_SLUG;
  });

  it("preserves authoritative 2-trip, 1500 GMV, 225 share case on backend services without regression", async () => {
    const auditService = new AuditNotificationService();
    const billingSettlementService = new BillingSettlementService(auditService);
    const tenantPartnerService = new TenantPartnerService(auditService);

    // 1. Check statement directly from BillingSettlementService
    const statement = billingSettlementService.getReferralStatement(
      "referral-demo-community",
      "2026-06",
    );

    expect(statement.partnerEntrySlug).toBe("referral-demo-community");
    expect(statement.period).toBe("2026-06");
    expect(statement.totals.tripCount).toBe(2);
    expect(statement.totals.activeRiderCount).toBe(2);
    expect(statement.totals.gmv.amountMinor).toBe(150000); // 1,500 TWD
    expect(statement.totals.shareTotal.amountMinor).toBe(22500); // 225 TWD
    expect(statement.lines).toHaveLength(2);

    const [trip1, trip2] = statement.lines;
    expect(trip1?.tripId).toBe("order-referral-001");
    expect(trip1?.fare.amountMinor).toBe(60000); // 600 TWD
    expect(trip1?.shareAmount.amountMinor).toBe(9000); // 15% -> 90 TWD

    expect(trip2?.tripId).toBe("order-referral-002");
    expect(trip2?.fare.amountMinor).toBe(90000); // 900 TWD
    expect(trip2?.shareAmount.amountMinor).toBe(13500); // 15% -> 135 TWD

    // 2. Check partner referral dashboard from TenantPartnerService
    const dashboard = await tenantPartnerService.getPartnerReferralDashboard(
      canonicalIdentity,
      billingSettlementService,
      "2026-06",
    );

    expect(dashboard.tripCount).toBe(2);
    expect(dashboard.activeUserCount).toBe(2);
    expect(dashboard.gmv.amountMinor).toBe(150000);
    expect(dashboard.estimatedShareAmount.amountMinor).toBe(22500);
    expect(dashboard.period).toBe("2026-06");
    expect(dashboard.statementStatus).toBe("due");
  });

  it("control-plane proxy forwards statement artifact download request and streams CSV", async () => {
    process.env.DRTS_PARTNER_ENTRY_SLUG = "referral-demo-community";

    const mockCsv = [
      "Statement ID,Period,Trip ID,Completed at,Partner entry,Fare,Share rate type,Share rate value,Share amount,Manifest SHA-256",
      "referral-statement-referral-demo-community-2026-06,2026-06,trip-ref-001,2026-06-15T08:30:00.000Z,referral-demo-community,TWD 600.00,percent,15,TWD 90.00,a838df2941",
      "referral-statement-referral-demo-community-2026-06,2026-06,trip-ref-002,2026-06-20T14:15:00.000Z,referral-demo-community,TWD 900.00,percent,15,TWD 135.00,a838df2941",
    ].join("\n");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(mockCsv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="referral-statement-referral-demo-community-2026-06.csv"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const path = ["partner", "referral", "statements", "2026-06", "artifact"];
    const response = await proxyGet(proxyRequest(path), proxyContext(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "referral-statement-referral-demo-community-2026-06.csv",
    );

    const bodyText = await response.text();
    expect(bodyText).toContain("trip-ref-001");
    expect(bodyText).toContain("trip-ref-002");
    expect(bodyText).toContain("TWD 90.00");
    expect(bodyText).toContain("TWD 135.00");

    // Verify upstream URL was correctly formatted
    const [targetUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(targetUrl.pathname).toBe(
      "/api/partner/referral/statements/2026-06/artifact",
    );
  });

  it("handles service failure explicitly with HTTP 503 instead of silent hang", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3001"));
    vi.stubGlobal("fetch", fetchMock);

    const path = ["partner", "referral", "statements", "2026-06", "artifact"];
    const response = await proxyGet(proxyRequest(path), proxyContext(path));

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.status).toBe("down");
    expect(json.error).toContain("ECONNREFUSED");
  });

  it("explicitly handles empty periods with zero totals and headers-only lines", () => {
    const auditService = new AuditNotificationService();
    const billingSettlementService = new BillingSettlementService(auditService);

    // Period with no trips
    const emptyStatement = billingSettlementService.getReferralStatement(
      "referral-demo-community",
      "2026-07",
    );

    expect(emptyStatement.totals.tripCount).toBe(0);
    expect(emptyStatement.totals.activeRiderCount).toBe(0);
    expect(emptyStatement.totals.gmv.amountMinor).toBe(0);
    expect(emptyStatement.totals.shareTotal.amountMinor).toBe(0);
    expect(emptyStatement.lines).toHaveLength(0);
  });

  it("declutters engineering artifact labels in user-facing copy", () => {
    // Chinese translations
    expect(t("referral.statements.downloadArtifact", "zh")).toBe(
      "下載對帳明細 (CSV)",
    );
    expect(t("referral.statements.downloadArtifact", "zh")).not.toContain(
      "artifact",
    );
    expect(t("referral.statements.detailSubtitle", "zh")).toBe(
      "對帳單明細與期別總計",
    );
    expect(t("referral.statements.detailSubtitle", "zh")).not.toContain(
      "artifact",
    );
    expect(t("referral.statements.artifact", "zh")).toBe("存證與開立資訊");
    expect(t("referral.statements.technicalDetails", "zh")).toBe(
      "技術與稽核詳情",
    );

    // English translations
    expect(t("referral.statements.downloadArtifact", "en")).toBe(
      "Download statement (CSV)",
    );
    expect(t("referral.statements.downloadArtifact", "en")).not.toContain(
      "artifact",
    );
    expect(t("referral.statements.detailSubtitle", "en")).toBe(
      "Statement lines and period totals",
    );
    expect(t("referral.statements.artifact", "en")).toBe(
      "Verification & Issuance",
    );
    expect(t("referral.statements.technicalDetails", "en")).toBe(
      "Technical & Audit Details",
    );
  });
});
