import { describe, expect, it } from "vitest";

import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
  type ForwarderReconciliationIssue,
} from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { ReferralSettlementScaffoldService } from "../../src/modules/billing-settlement/referral-settlement.scaffold.service";
import { settlementChannelKeyForTrip } from "../../src/modules/billing-settlement/settlement-matrix";
import type { OwnedMobilityTripCompletedEvent } from "../../src/modules/owned-mobility/owned-mobility-events";

function createService(forwarderIssues: ForwarderReconciliationIssue[] = []) {
  const auditNotificationService = new AuditNotificationService();
  return new BillingSettlementService(auditNotificationService, undefined, {
    listReconciliationIssues: () => forwarderIssues,
  } as any);
}

describe("BillingSettlementService settlement matrix", () => {
  it("returns the canonical channel-aware settlement matrix", () => {
    const service = createService();

    expect(service.listSettlementMatrix()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
          orderDomain: "owned",
          localLedgerMode: "full_service",
          sponsorType: expect.stringContaining("tenant"),
          invoiceOwner: expect.stringContaining("platform finance"),
          driverPayoutAuthority: expect.stringContaining("platform"),
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
          receiptOwner: expect.stringContaining("partner"),
          reimbursementRule: expect.stringContaining("reimbursement"),
        }),
        expect.objectContaining({
          channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
          payerType: "DRTS platform",
          reimbursementRule: expect.stringContaining(
            REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
          ),
          reconciliationPath:
            "referral settlement statement + attribution audit",
        }),
        expect.objectContaining({
          channelKey: "phone_dispatch",
          orderSources: expect.arrayContaining(["phone"]),
          discountFundingSource: expect.stringContaining("manual"),
        }),
        expect.objectContaining({
          channelKey: "forwarded_shadow",
          orderDomain: "forwarded",
          localLedgerMode: "shadow_only",
          driverPayoutAuthority: expect.stringContaining("external platform"),
        }),
      ]),
    );
  });

  it("keeps partner referral matrix semantics consistent with referral settlement contracts", () => {
    const service = createService();
    const scaffold = new ReferralSettlementScaffoldService();
    const row = service
      .listSettlementMatrix()
      .find((entry) => entry.channelKey === PARTNER_REFERRAL_CHANNEL_KEY);

    expect(row).toMatchObject({
      channelKey: scaffold.getReferralSettlementScaffold().channelKey,
      payerType: "DRTS platform",
      invoicePath: "referral settlement statement",
      reconciliationPath: "referral settlement statement + attribution audit",
    });
    expect(row?.reimbursementRule).toContain(
      scaffold.getReferralSettlementScaffold().direction,
    );
  });

  it("maps trip context to the correct settlement channel key", () => {
    expect(
      settlementChannelKeyForTrip({
        orderSource: "portal",
        businessDispatchSubtype: "enterprise_dispatch",
        partnerId: null,
      }),
    ).toBe("tenant_enterprise");

    expect(
      settlementChannelKeyForTrip({
        orderSource: "api",
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerId: "partner-bank-demo-001",
      }),
    ).toBe("partner_airport");

    expect(
      settlementChannelKeyForTrip({
        orderSource: "phone",
        businessDispatchSubtype: "enterprise_dispatch",
        partnerId: null,
      }),
    ).toBe("phone_dispatch");

    expect(
      settlementChannelKeyForTrip({
        orderSource: "external_platform",
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerId: "partner-bank-demo-001",
      }),
    ).toBe("forwarded_shadow");
  });

  it("carries channel context into generated invoices, statements, and reimbursements", async () => {
    const service = createService();

    const invoice = await service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.000Z",
      },
      "req-invoice-001",
    );

    expect(invoice.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
          orderSource: "portal",
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
          orderSource: "api",
        }),
      ]),
    );

    service.publishDriverFeePlan({
      planName: "Phase 1 demo plan",
      version: "2026-03",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    const generated = await service.generateDriverStatements({
      periodMonth: "2026-03",
    });

    const generatedLines = generated.items.flatMap(
      (statement) => statement.lines,
    );
    expect(generatedLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
        }),
      ]),
    );

    const reimbursementBatches = service.listReimbursementBatches();
    expect(reimbursementBatches[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "partner_airport",
          reason: "platform_funded_discount",
        }),
      ]),
    );
  });

  it("derives forwarder reconciliation issues into the finance queue", () => {
    const service = createService([
      {
        reconciliationJob: {
          reconciliationJobId: "recon-job-forwarder-001",
          mirrorOrderId: "mirror-order-001",
          status: "queued",
          reason: "sync_failed",
          mismatchCount: 1,
          notes: "Mirror status diverged from upstream platform.",
          createdAt: "2026-04-30T12:00:00.000Z",
          completedAt: null,
        },
        mirrorOrderId: "mirror-order-001",
        platformCode: "grab_taiwan",
        externalOrderId: "grab-ext-001",
        status: "sync_failed",
        acceptedDriverId: "driver-forwarder-001",
        lastSyncError: {
          code: "FORWARDER_ACCEPT_RELAY_FAILED",
          message: "Upstream accept relay failed.",
          retryable: true,
          occurredAt: "2026-04-30T12:05:00.000Z",
        },
        financeContext: {
          fareAuthority: "external_platform",
          settlementAuthority: "external_platform",
          localLedgerMode: "shadow_only",
          receiptOwner: "external_platform",
        },
        manualFallback: {
          required: true,
          reason: "sync_failed",
          instructions: [
            "Coordinate with forwarder support and finance before closing shadow ledger exceptions.",
          ],
        },
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:05:00.000Z",
      },
    ]);

    const issues = service.listReconciliationIssues({
      issueType: "forwarder_status_mismatch",
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueType: "forwarder_status_mismatch",
      source: "forwarder_auto",
      channelKey: "forwarded_shadow",
      mirrorOrderId: "mirror-order-001",
      externalOrderId: "grab-ext-001",
      linkedReconciliationJobId: "recon-job-forwarder-001",
      forwardedFinanceContext: {
        platformCode: "grab_taiwan",
        reconciliationReason: "sync_failed",
        fareAuthority: "external_platform",
        settlementAuthority: "external_platform",
        driverPayoutAuthority: "external_platform",
        localLedgerMode: "shadow_only",
        note: "Mirror status diverged from upstream platform.",
      },
    });
  });

  it("supports create assign comment resolve and reopen reconciliation issue workflow", () => {
    const service = createService();

    const created = service.createReconciliationIssue({
      issueType: "partner_sponsor_mismatch",
      summary: "Partner sponsor amount does not match issuer export.",
      openedBy: "finance.agent.001",
      assigneeId: "fin-partner-ops",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      sponsorReference: "benefit-bank-demo-032",
      orderId: "order-demo-032",
      comment: "Initial discrepancy found during month-end close.",
      artifactIds: ["artifact-benefit-ledger-202603"],
    });

    expect(created.status).toBe("assigned");
    expect(created.comments).toHaveLength(1);
    expect(created.evidenceArtifactIds).toEqual([
      "artifact-benefit-ledger-202603",
    ]);

    const assigned = service.assignReconciliationIssue(created.issueId, {
      assigneeId: "fin-escalations",
      actorId: "finance.lead.001",
      note: "Escalating to settlement lead.",
    });
    expect(assigned.ownerId).toBe("fin-escalations");
    expect(assigned.comments.at(-1)?.message).toBe(
      "Escalating to settlement lead.",
    );

    const commented = service.addReconciliationIssueComment(created.issueId, {
      actorId: "fin-escalations",
      message: "Attached sponsor-side workbook and issuer screenshot.",
      artifactIds: ["artifact-issuer-032"],
    });
    expect(commented.comments.at(-1)?.artifactIds).toEqual([
      "artifact-issuer-032",
    ]);
    expect(commented.evidenceArtifactIds).toEqual(
      expect.arrayContaining([
        "artifact-benefit-ledger-202603",
        "artifact-issuer-032",
      ]),
    );

    const resolved = service.resolveReconciliationIssue(created.issueId, {
      actorId: "fin-escalations",
      resolutionCode: "sponsor_corrected",
      resolutionSummary:
        "Sponsor export corrected and cross-check now matches.",
      artifactIds: ["artifact-sponsor-export-202603-fixed"],
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolutionCode).toBe("sponsor_corrected");
    expect(resolved.comments.at(-1)?.message).toContain("cross-check");

    const reopened = service.reopenReconciliationIssue(created.issueId, {
      actorId: "finance.lead.001",
      reason: "Issuer reran the export and mismatch reappeared.",
      artifactIds: ["artifact-issuer-rerun-202603"],
    });
    expect(reopened.status).toBe("reopened");
    expect(reopened.reopenCount).toBe(1);
    expect(reopened.resolutionCode).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.comments.at(-1)?.message).toBe(
      "Issuer reran the export and mismatch reappeared.",
    );
  });

  it("builds tenant payable summaries, line items, and tenant-visible statements", async () => {
    const service = createService();

    service.publishDriverFeePlan({
      planName: "Phase 1 demo plan",
      version: "2026-03",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    await service.generateDriverStatements({
      periodMonth: "2026-03",
    });

    const summary = await service.getTenantPayableSummary(
      "tenant-demo-001",
      "2026-03",
    );
    expect(summary).toMatchObject({
      tenantId: "tenant-demo-001",
      periodMonth: "2026-03",
      totalTrips: 3,
      completedTrips: 3,
      grossAmountMinor: 350000,
      adjustmentAmountMinor: -5000,
      payableAmountMinor: 345000,
      invoiceStatus: "draft",
    });

    const partnerLineItems = await service.listTenantPayableLineItems(
      "tenant-demo-001",
      {
        periodMonth: "2026-03",
        serviceProduct: "credit_card_airport_transfer",
        costCenterCode: "cc-travel",
        riderId: "rider-demo-002",
        tenantServiceProgramId: "program-airport-alpha",
      },
    );
    expect(partnerLineItems).toEqual([
      expect.objectContaining({
        orderId: "order-demo-032",
        serviceProduct: "credit_card_airport_transfer",
        costCenterCode: "CC-TRAVEL",
        riderId: "rider-demo-002",
        tenantServiceProgramId: "program-airport-alpha",
        discountAmountMinor: 20000,
        payableAmountMinor: 60000,
      }),
    ]);

    const tenantStatements = await service.listTenantStatements(
      "tenant-demo-001",
      "2026-03",
    );
    expect(tenantStatements).toHaveLength(2);
    expect(
      tenantStatements.flatMap((statement) =>
        statement.lines.map((line) => line.orderId),
      ),
    ).toEqual(
      expect.arrayContaining([
        "order-demo-031",
        "order-demo-032",
        "order-demo-033",
      ]),
    );
  });

  it("generates tenant invoices from in-memory completed enterprise dispatch trips", async () => {
    const service = createService();
    const tenantId = "tenant-live-enterprise-001";
    const completedTrip = {
      tenantId,
      driverId: "drv-live-enterprise-001",
      orderId: "order-live-enterprise-001",
      completedAt: "2026-05-12T09:30:00Z",
      grossEarning: { currency: "NTD", amountMinor: 98000 },
      orderSource: "portal",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
      costCenterCode: "CC-FINANCE",
      riderId: "rider-enterprise-001",
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      benefitReference: null,
      serviceProduct: "enterprise_dispatch",
      tenantServiceProgramId: null,
      sourcePlatform: "portal",
    } satisfies OwnedMobilityTripCompletedEvent;

    service.handleOwnedMobilityTripCompleted(completedTrip);

    const invoice = await service.generateTenantInvoice(tenantId, {
      tenantId,
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-31T23:59:59.000Z",
    });

    expect(invoice.lines).toHaveLength(1);
    expect(invoice.amount.amountMinor).toBe(98000);
    expect(invoice.lines[0]).toMatchObject({
      orderId: "order-live-enterprise-001",
      channelKey: "tenant_enterprise",
      orderSource: "portal",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
      partnerId: null,
      benefitReference: null,
    });

    const payableLines = await service.listTenantPayableLineItems(tenantId);
    expect(payableLines).toEqual([
      expect.objectContaining({
        orderId: "order-live-enterprise-001",
        serviceProduct: "enterprise_dispatch",
        costCenterCode: "CC-FINANCE",
        riderId: "rider-enterprise-001",
        payableAmountMinor: 98000,
      }),
    ]);
  });

  it("reconciles live card-benefit settlement statements and discovers live-only periods", async () => {
    const liveTenantId = "tenant-issuer-live-001";
    const liveCardBenefitTrip = {
      tenantId: liveTenantId,
      driverId: "drv-live-001",
      orderId: "order-live-501",
      completedAt: "2026-05-12T09:30:00Z",
      grossEarning: { currency: "NTD", amountMinor: 120000 },
      orderSource: "api",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "credit_card_airport_transfer",
      costCenterCode: null,
      riderId: "rider-live-501",
      partnerId: "partner-bank-live-001",
      partnerProgramId: "program-airport-live",
      partnerEntrySlug: "bank-live-airport",
      eligibilityVerificationId: "elig-live-501",
      issuerAuthorizationRef: "issuer-auth-live-501",
      benefitReference: "benefit-live-501",
      serviceProduct: "credit_card_airport_transfer",
      tenantServiceProgramId: null,
      sourcePlatform: "api",
    };
    // A non-card-benefit live trip must stay subsidy-free and out of the statement.
    const liveEnterpriseTrip = {
      ...liveCardBenefitTrip,
      orderId: "order-live-502",
      businessDispatchSubtype: "enterprise_dispatch",
      partnerId: null,
      issuerAuthorizationRef: null,
      benefitReference: null,
      serviceProduct: "enterprise_dispatch",
    };

    const repository = {
      isEnabled: () => true,
      reportPersistenceFailure: () => {},
      listLiveCardBenefitSettlementPeriods: async (tenantId: string) =>
        tenantId === liveTenantId ? ["2026-05"] : [],
      listLiveCompletedTenantTrips: async (
        tenantId: string,
        periodStart: string,
      ) =>
        tenantId === liveTenantId && periodStart.startsWith("2026-05")
          ? [liveCardBenefitTrip, liveEnterpriseTrip]
          : [],
    };

    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as any,
      { listReconciliationIssues: () => [] } as any,
    );

    // Finding #2: a period present only in live data is discovered, not omitted.
    const statements =
      await service.listTenantSettlementStatements(liveTenantId);
    expect(statements.map((statement) => statement.period)).toContain(
      "2026-05",
    );

    // Finding #1: the issuer-funded portion is reconciled, not collapsed to 0.
    const statement = await service.getTenantSettlementStatement(
      liveTenantId,
      "2026-05",
    );
    const line = statement.lines.find(
      (entry) => entry.tripId === "order-live-501",
    );
    expect(line).toBeDefined();
    expect(line?.fare.amountMinor).toBe(120000);
    expect(line?.subsidisedAmount.amountMinor).toBe(120000);
    expect(line?.paidAmount.amountMinor).toBe(0);
    expect(line?.benefitReference).toBe("benefit-live-501");
    expect(line?.issuerAuthorizationRef).toBe("issuer-auth-live-501");

    // The non-card-benefit live trip is excluded from the settlement statement.
    expect(
      statement.lines.some((entry) => entry.tripId === "order-live-502"),
    ).toBe(false);

    expect(statement.totals.tripCount).toBe(1);
    expect(statement.totals.fareTotal.amountMinor).toBe(120000);
    expect(statement.totals.subsidisedTotal.amountMinor).toBe(120000);
    expect(statement.totals.paidTotal.amountMinor).toBe(0);
    expect(statement.totals.issuerPayable.amountMinor).toBe(120000);
    expect(statement.direction).toBe("issuer_pays_drts");
  });
});

describe("BillingSettlementService referral settlement (drts_pays_partner)", () => {
  it("builds a referral statement with per-trip share, GMV, and active riders", () => {
    const service = createService();
    const statement = service.getReferralStatement(
      "referral-demo-community",
      "2026-06",
    );
    expect(statement.channelKey).toBe(PARTNER_REFERRAL_CHANNEL_KEY);
    expect(statement.direction).toBe(
      REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
    );
    // 2 seeded referral trips in 2026-06: fares 60000 + 90000 = 150000 GMV.
    expect(statement.totals.tripCount).toBe(2);
    expect(statement.totals.activeRiderCount).toBe(2);
    expect(statement.totals.gmv.amountMinor).toBe(150000);
    // 15% percent rule → 9000 + 13500 = 22500 payable to the partner.
    expect(statement.totals.shareTotal.amountMinor).toBe(22500);
    expect(statement.lines).toHaveLength(2);
    expect(statement.lines[0].rateType).toBe("percent");
  });

  it("resolves the active referral revenue-share rule for an attributed trip", () => {
    const service = createService();
    const rule = service.resolveReferralRevenueShareRule(
      "referral-demo-community",
      "2026-06-10T00:00:00Z",
    );
    expect(rule).not.toBeNull();
    expect(rule?.rateType).toBe("percent");
    expect(rule?.value).toBe(15);
    expect(
      service.resolveReferralRevenueShareRule("unknown-channel", "2026-06-10T00:00:00Z"),
    ).toBeNull();
  });

  it("lists referral statements only for periods with attributed rides", async () => {
    const service = createService();
    const statements = await service.listReferralStatements(
      "referral-demo-community",
    );
    expect(statements.length).toBeGreaterThanOrEqual(1);
    expect(statements.every((s) => s.partnerEntrySlug === "referral-demo-community")).toBe(
      true,
    );
  });
});
