import { describe, expect, it } from "vitest";

import type { ForwarderReconciliationIssue } from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { settlementChannelKeyForTrip } from "../../src/modules/billing-settlement/settlement-matrix";

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
});
