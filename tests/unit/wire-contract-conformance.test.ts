/**
 * W7-001D: Wire contract and async job conformance tests
 *
 * Verifies that:
 *   1. camelToSnakeCase / deepToSnakeCase correctly convert all key shapes
 *      used in Phase 1 API responses.
 *   2. The ApiSuccessEnvelope and ApiErrorEnvelope meta/error keys produce the
 *      canonical snake_case wire format expected by spec 03_api_examples.
 *   3. The async job accepted contracts (ReportJobAccepted, FilingPackageAccepted)
 *      return the correct queued shape.
 *   4. The webhook event payload conforms to the canonical wire contract.
 */
import { describe, expect, it } from "vitest";

import type {
  FilingPackageAccepted,
  ReportJobAccepted,
  WebhookEventPayload,
} from "@drts/contracts";

import {
  camelToSnakeCase,
  deepToSnakeCase,
} from "../../apps/api/src/common/snake-case.interceptor";
import {
  toApiSuccessEnvelope,
  toApiErrorEnvelope,
} from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// ---------------------------------------------------------------------------
// camelToSnakeCase unit tests
// ---------------------------------------------------------------------------

describe("camelToSnakeCase", () => {
  it("converts requestId to request_id", () => {
    expect(camelToSnakeCase("requestId")).toBe("request_id");
  });

  it("converts traceId to trace_id", () => {
    expect(camelToSnakeCase("traceId")).toBe("trace_id");
  });

  it("converts httpStatus to http_status", () => {
    expect(camelToSnakeCase("httpStatus")).toBe("http_status");
  });

  it("converts etaMinutes to eta_minutes", () => {
    expect(camelToSnakeCase("etaMinutes")).toBe("eta_minutes");
  });

  it("converts artifactZipUrl to artifact_zip_url", () => {
    expect(camelToSnakeCase("artifactZipUrl")).toBe("artifact_zip_url");
  });

  it("converts deliveryId to delivery_id", () => {
    expect(camelToSnakeCase("deliveryId")).toBe("delivery_id");
  });

  it("converts amountMinor to amount_minor", () => {
    expect(camelToSnakeCase("amountMinor")).toBe("amount_minor");
  });

  it("leaves already-snake_case keys unchanged (no uppercase)", () => {
    expect(camelToSnakeCase("order_id")).toBe("order_id");
    expect(camelToSnakeCase("status")).toBe("status");
    expect(camelToSnakeCase("created_at")).toBe("created_at");
  });

  it("converts webhookId to webhook_id", () => {
    expect(camelToSnakeCase("webhookId")).toBe("webhook_id");
  });

  it("converts caseNo to case_no", () => {
    expect(camelToSnakeCase("caseNo")).toBe("case_no");
  });

  it("converts slaDueAt to sla_due_at", () => {
    expect(camelToSnakeCase("slaDueAt")).toBe("sla_due_at");
  });

  it("converts dispatchJobId to dispatch_job_id", () => {
    expect(camelToSnakeCase("dispatchJobId")).toBe("dispatch_job_id");
  });
});

// ---------------------------------------------------------------------------
// deepToSnakeCase unit tests
// ---------------------------------------------------------------------------

describe("deepToSnakeCase", () => {
  it("converts top-level keys of a flat object", () => {
    const result = deepToSnakeCase({
      requestId: "req-1",
      timestamp: "2026-04-11T00:00:00Z",
    });
    expect(result).toEqual({
      request_id: "req-1",
      timestamp: "2026-04-11T00:00:00Z",
    });
  });

  it("converts nested object keys recursively", () => {
    const result = deepToSnakeCase({
      data: {
        orderId: "ORD-001",
        etaSnapshot: {
          etaMinutes: 8,
          calculatedAt: "2026-04-11T00:00:00Z",
        },
      },
      meta: {
        requestId: "req-1",
        timestamp: "2026-04-11T00:00:00Z",
      },
    });
    expect(result).toEqual({
      data: {
        order_id: "ORD-001",
        eta_snapshot: {
          eta_minutes: 8,
          calculated_at: "2026-04-11T00:00:00Z",
        },
      },
      meta: {
        request_id: "req-1",
        timestamp: "2026-04-11T00:00:00Z",
      },
    });
  });

  it("converts keys inside array elements", () => {
    const result = deepToSnakeCase([
      { orderId: "ORD-001", orderNo: "O-001" },
      { orderId: "ORD-002", orderNo: "O-002" },
    ]);
    expect(result).toEqual([
      { order_id: "ORD-001", order_no: "O-001" },
      { order_id: "ORD-002", order_no: "O-002" },
    ]);
  });

  it("leaves primitive values unchanged", () => {
    expect(deepToSnakeCase("some_string")).toBe("some_string");
    expect(deepToSnakeCase(42)).toBe(42);
    expect(deepToSnakeCase(true)).toBe(true);
    expect(deepToSnakeCase(null)).toBeNull();
  });

  it("does not modify string values that look like camelCase", () => {
    // String values are not field names — they must not be converted.
    const result = deepToSnakeCase({
      status: "ready_for_dispatch",
      orderDomain: "owned",
    });
    expect(result).toEqual({
      status: "ready_for_dispatch",
      order_domain: "owned",
    });
  });
});

// ---------------------------------------------------------------------------
// ApiSuccessEnvelope wire contract tests
// ---------------------------------------------------------------------------

describe("ApiSuccessEnvelope wire contract (deepToSnakeCase applied)", () => {
  it("produces canonical snake_case meta keys when serialised", () => {
    const envelope = toApiSuccessEnvelope(
      { orderId: "ORD-001" },
      "req-wire-001",
    );
    const wire = deepToSnakeCase(envelope) as Record<string, unknown>;

    const meta = wire["meta"] as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(meta["request_id"]).toBe("req-wire-001");
    expect(meta["timestamp"]).toBeTruthy();
    // Ensure camelCase keys are gone
    expect(meta["requestId"]).toBeUndefined();

    const data = wire["data"] as Record<string, unknown>;
    expect(data["order_id"]).toBe("ORD-001");
  });
});

// ---------------------------------------------------------------------------
// ApiErrorEnvelope wire contract tests
// ---------------------------------------------------------------------------

describe("ApiErrorEnvelope wire contract (deepToSnakeCase applied)", () => {
  it("produces canonical snake_case error keys when serialised", () => {
    const envelope = toApiErrorEnvelope(
      "ORDER_NOT_MODIFIABLE",
      "The order can no longer be modified.",
      { orderId: "ORD-001" },
      false,
    );
    const wire = deepToSnakeCase(envelope) as Record<string, unknown>;

    const error = wire["error"] as Record<string, unknown>;
    expect(error).toBeDefined();
    expect(error["code"]).toBe("ORDER_NOT_MODIFIABLE");
    expect(error["message"]).toBeTruthy();
    expect(error["retryable"]).toBe(false);
    // trace_id instead of traceId
    expect(error["trace_id"]).toBeTruthy();
    expect(error["traceId"]).toBeUndefined();

    // Details keys are also converted
    const details = error["details"] as Record<string, unknown>;
    expect(details["order_id"]).toBe("ORD-001");
    expect(details["orderId"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Async job accepted contracts
// ---------------------------------------------------------------------------

describe("ReportJobAccepted wire contract", () => {
  it("createReportJob returns queued accepted shape conforming to ReportJobAccepted", () => {
    const auditService = new AuditNotificationService();
    const reportingFilingService = new ReportingFilingService(auditService);

    const accepted: ReportJobAccepted = reportingFilingService.createReportJob({
      jobType: "monthly_trip_report",
      format: "xlsx",
      filters: { month: "2026-04" },
    });

    expect(accepted.jobId).toMatch(/^JOB-/);
    expect(accepted.status).toBe("queued");

    // Simulate SnakeCaseInterceptor serialisation
    const wire = deepToSnakeCase(accepted) as Record<string, unknown>;
    expect(wire["job_id"]).toMatch(/^JOB-/);
    expect(wire["status"]).toBe("queued");
    // camelCase key must not appear on wire
    expect(wire["jobId"]).toBeUndefined();
  });
});

describe("FilingPackageAccepted wire contract", () => {
  it("generateFilingPackage returns queued accepted shape conforming to FilingPackageAccepted", () => {
    const auditService = new AuditNotificationService();
    const reportingFilingService = new ReportingFilingService(auditService);

    const accepted: FilingPackageAccepted =
      reportingFilingService.generateFilingPackage({
        packageType: "monthly_report",
        scope: { month: "2026-04" },
      });

    expect(accepted.packageId).toMatch(/^PKG-/);
    expect(accepted.status).toBe("queued");

    // Simulate SnakeCaseInterceptor serialisation
    const wire = deepToSnakeCase(accepted) as Record<string, unknown>;
    expect(wire["package_id"]).toMatch(/^PKG-/);
    expect(wire["status"]).toBe("queued");
    expect(wire["packageId"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Webhook event payload wire contract
// ---------------------------------------------------------------------------

describe("WebhookEventPayload wire contract", () => {
  it("conforms to canonical wire format with snake_case keys", () => {
    // Build a typed payload matching the canonical Phase 1 spec (section 3.15)
    const payload: WebhookEventPayload<{
      orderId: string;
      orderNo: string;
      vehicleId: string;
      etaMinutes: number;
    }> = {
      event: "order.assigned",
      deliveryId: "WD-20260411-0001",
      occurredAt: "2026-04-11T09:04:00Z",
      tenantId: "tenant-demo-001",
      data: {
        orderId: "ORD-001",
        orderNo: "O-20260411-000001",
        vehicleId: "VEH-001",
        etaMinutes: 6,
      },
    };

    // The webhook runtime sends this directly; the SnakeCaseInterceptor covers
    // API responses. For webhook payloads published via the runtime we confirm
    // that deepToSnakeCase produces the canonical wire shape.
    const wire = deepToSnakeCase(payload) as Record<string, unknown>;

    expect(wire["event"]).toBe("order.assigned");
    expect(wire["delivery_id"]).toBe("WD-20260411-0001");
    expect(wire["occurred_at"]).toBe("2026-04-11T09:04:00Z");
    expect(wire["tenant_id"]).toBe("tenant-demo-001");
    expect(wire["deliveryId"]).toBeUndefined();
    expect(wire["occurredAt"]).toBeUndefined();
    expect(wire["tenantId"]).toBeUndefined();

    const data = wire["data"] as Record<string, unknown>;
    expect(data["order_id"]).toBe("ORD-001");
    expect(data["order_no"]).toBe("O-20260411-000001");
    expect(data["vehicle_id"]).toBe("VEH-001");
    expect(data["eta_minutes"]).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Representative Phase 1 record shapes — coverage for non-trivial field names
// ---------------------------------------------------------------------------

describe("Phase 1 record wire shapes via deepToSnakeCase", () => {
  it("converts OwnedOrderRecord shape correctly", () => {
    const record = {
      orderId: "ORD-001",
      orderNo: "O-20260411-000001",
      orderSource: "app",
      orderDomain: "owned",
      serviceBucket: "standard_taxi",
      dispatchSemantics: "realtime",
      businessDispatchSubtype: null,
      status: "ready_for_dispatch",
      etaSnapshot: {
        etaMinutes: 8,
        calculatedAt: "2026-04-11T09:00:00Z",
      },
      proofRequirements: {
        minPhotoCount: 1,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      complianceFlags: [] as string[],
      fixedPrice: false,
      quotedFare: null,
      createdAt: "2026-04-11T09:00:00Z",
      updatedAt: "2026-04-11T09:00:00Z",
    };

    const wire = deepToSnakeCase(record) as Record<string, unknown>;
    expect(wire["order_id"]).toBe("ORD-001");
    expect(wire["order_no"]).toBe("O-20260411-000001");
    expect(wire["order_source"]).toBe("app");
    expect(wire["order_domain"]).toBe("owned");
    expect(wire["service_bucket"]).toBe("standard_taxi");
    expect(wire["dispatch_semantics"]).toBe("realtime");
    expect(wire["business_dispatch_subtype"]).toBeNull();
    expect(wire["fixed_price"]).toBe(false);

    const eta = wire["eta_snapshot"] as Record<string, unknown>;
    expect(eta["eta_minutes"]).toBe(8);
    expect(eta["calculated_at"]).toBeTruthy();

    const proof = wire["proof_requirements"] as Record<string, unknown>;
    expect(proof["min_photo_count"]).toBe(1);
    expect(proof["signoff_required"]).toBe(false);
    expect(proof["expense_proof_required"]).toBe(false);
  });

  it("converts ComplaintCaseRecord shape correctly", () => {
    const record = {
      caseNo: "C-20260411-000001",
      caseSource: "phone",
      relatedOrderId: "ORD-001",
      relatedCallId: "CALL-001",
      category: "fare_dispute",
      severity: "normal",
      description: "乘客認為費用不正確",
      status: "new",
      slaDueAt: "2026-04-13T09:00:00Z",
      slaBreach: false,
      resolutionCode: null,
      closingNote: null,
      createdAt: "2026-04-11T09:00:00Z",
      updatedAt: "2026-04-11T09:00:00Z",
    };

    const wire = deepToSnakeCase(record) as Record<string, unknown>;
    expect(wire["case_no"]).toBe("C-20260411-000001");
    expect(wire["case_source"]).toBe("phone");
    expect(wire["related_order_id"]).toBe("ORD-001");
    expect(wire["related_call_id"]).toBe("CALL-001");
    expect(wire["sla_due_at"]).toBe("2026-04-13T09:00:00Z");
    expect(wire["sla_breach"]).toBe(false);
    expect(wire["resolution_code"]).toBeNull();
    expect(wire["closing_note"]).toBeNull();
  });

  it("converts DriverStatementRecord money amounts correctly", () => {
    const record = {
      statementId: "STMT-001",
      driverId: "DRV-001",
      periodMonth: "2026-04",
      receiptNo: "DRV-REC-00001",
      payoutStatus: "pending",
      grossEarning: { currency: "NTD", amountMinor: 158000 },
      serviceFee: { currency: "NTD", amountMinor: 18000 },
      subsidy: { currency: "NTD", amountMinor: 2500 },
      netAmount: { currency: "NTD", amountMinor: 142500 },
      feePlanVersion: "v1.0",
      lines: [],
      createdAt: "2026-04-11T00:00:00Z",
      updatedAt: "2026-04-11T00:00:00Z",
    };

    const wire = deepToSnakeCase(record) as Record<string, unknown>;
    expect(wire["statement_id"]).toBe("STMT-001");
    expect(wire["driver_id"]).toBe("DRV-001");
    expect(wire["period_month"]).toBe("2026-04");
    expect(wire["payout_status"]).toBe("pending");

    const gross = wire["gross_earning"] as Record<string, unknown>;
    expect(gross["currency"]).toBe("NTD");
    expect(gross["amount_minor"]).toBe(158000);

    const net = wire["net_amount"] as Record<string, unknown>;
    expect(net["amount_minor"]).toBe(142500);

    expect(wire["fee_plan_version"]).toBe("v1.0");
  });
});
