/**
 * Snapshot Schema & Canonical Data Model
 * 
 * Defines snapshot representation across Trips (行程), Billing (帳務), and Audit (稽核).
 * Acceptance criteria: "同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB。"
 */

import crypto from "node:crypto";

// --- Trips Domain (行程) ---
export interface OpsOrderRecord {
  order_id: string;
  order_no: string;
  tenant_id: string;
  service_bucket: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  scheduled_at?: string;
  current_status: "created" | "assigned" | "trip_in_progress" | "completed" | "canceled";
  created_at: string;
}

export interface OpsBookingRecord {
  booking_id: string;
  order_id: string;
  booking_type: "oneway" | "roundtrip" | "recurring";
  reservation_window_start?: string;
  reservation_window_end?: string;
  created_at: string;
}

export interface OpsDispatchJobRecord {
  dispatch_job_id: string;
  order_id: string;
  dispatch_mode: "auto" | "manual" | "broadcast";
  status: "pending" | "assigned" | "completed" | "failed";
  priority_score: number;
  created_at: string;
}

export interface OpsDispatchAssignmentRecord {
  assignment_id: string;
  dispatch_job_id: string;
  vehicle_id: string;
  driver_id: string;
  status: "assigned" | "accepted" | "completed" | "canceled";
  assigned_at: string;
  completed_at?: string;
  version_no: number;
}

export interface OpsTripRecord {
  trip_id: string;
  order_id: string;
  assignment_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_status: "created" | "in_progress" | "completed" | "canceled";
  actual_distance_km: number;
  actual_duration_sec: number;
  proof_required: boolean;
  proof_status: "not_required" | "submitted" | "verified";
  created_at: string;
  completed_at?: string;
}

export interface OpsProofBundleRecord {
  proof_bundle_id: string;
  trip_id: string;
  signoff_name?: string;
  signoff_at?: string;
  photo_count: number;
  expense_total: number;
  created_at: string;
}

// --- Billing Domain (帳務) ---
export interface BillingFeePlanRecord {
  plan_id: string;
  plan_name: string;
  version_no: string;
  calculation_method: string;
  effective_from: string;
  status: "active" | "draft" | "archived";
}

export interface BillingDriverStatementRecord {
  statement_id: string;
  driver_id: string;
  period_month: string; // YYYY-MM-01
  fee_plan_id?: string;
  gross_earning: number;
  service_fee: number;
  subsidy_amount: number;
  net_amount: number; // Must equal gross_earning - service_fee + subsidy_amount
  payout_status: "draft" | "approved" | "paid";
  generated_at: string;
}

export interface BillingStatementLineRecord {
  line_id: string;
  statement_id: string;
  line_type: "trip_fare" | "platform_fee" | "bonus" | "deduction";
  ref_id?: string; // trip_id or adjustment_id
  description: string;
  amount: number;
}

export interface BillingTenantInvoiceRecord {
  invoice_id: string;
  tenant_id: string;
  invoice_no: string;
  period_from: string;
  period_to: string;
  total_amount: number; // Must equal sum(invoice_lines.line_total)
  currency_code: string; // "TWD"
  status: "draft" | "issued" | "paid" | "void";
  issued_at?: string;
}

export interface BillingInvoiceLineRecord {
  invoice_line_id: string;
  invoice_id: string;
  order_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number; // quantity * unit_price
}

// --- Audit Domain (稽核) ---
export interface AdminAuditLogRecord {
  audit_id: string;
  actor_id: string;
  actor_type: "system" | "driver" | "tenant_admin" | "platform_admin";
  tenant_id?: string;
  module_name: string;
  action_name: string;
  resource_type: string;
  resource_id: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  created_at: string;
  hash_value: string; // SHA-256 integrity hash
}

export interface OpsDispatchTraceLogRecord {
  trace_id: string;
  order_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  event_type: string;
  event_time: string;
  source_channel: string;
  payload_hash: string;
}

// --- Snapshot Manifest & Envelope ---
export interface SnapshotDomainCounts {
  orders: number;
  bookings: number;
  dispatchJobs: number;
  dispatchAssignments: number;
  trips: number;
  proofBundles: number;
  driverFeePlans: number;
  driverStatements: number;
  driverStatementLines: number;
  tenantInvoices: number;
  invoiceLines: number;
  auditLogs: number;
  dispatchTraceLogs: number;
}

export interface SnapshotMetadata {
  snapshotId: string;
  capturedAt: string;
  schemaVersion: string;
  baseSha: string;
  resourceId: string;
  checksumSha256: string;
  domainCounts: SnapshotDomainCounts;
}

export interface OpsSnapshot {
  metadata: SnapshotMetadata;
  trips: {
    orders: OpsOrderRecord[];
    bookings: OpsBookingRecord[];
    dispatchJobs: OpsDispatchJobRecord[];
    dispatchAssignments: OpsDispatchAssignmentRecord[];
    trips: OpsTripRecord[];
    proofBundles: OpsProofBundleRecord[];
  };
  billing: {
    driverFeePlans: BillingFeePlanRecord[];
    driverStatements: BillingDriverStatementRecord[];
    driverStatementLines: BillingStatementLineRecord[];
    tenantInvoices: BillingTenantInvoiceRecord[];
    invoiceLines: BillingInvoiceLineRecord[];
  };
  audit: {
    auditLogs: AdminAuditLogRecord[];
    dispatchTraceLogs: OpsDispatchTraceLogRecord[];
  };
}

/**
 * Calculates deterministic SHA-256 checksum for the snapshot payload.
 */
export function calculateSnapshotChecksum(
  trips: OpsSnapshot["trips"],
  billing: OpsSnapshot["billing"],
  audit: OpsSnapshot["audit"],
): string {
  const payloadString = JSON.stringify({
    trips,
    billing,
    audit,
  });
  return crypto.createHash("sha256").update(payloadString).digest("hex");
}

/**
 * Calculates SHA-256 tamper-evident integrity hash for an audit log record.
 */
export function calculateAuditLogHash(
  actor_id: string,
  module_name: string,
  action_name: string,
  resource_id: string,
  created_at: string,
): string {
  const content = `${actor_id}:${module_name}:${action_name}:${resource_id}:${created_at}`;
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Generates a valid canonical reference snapshot with consistent Trip, Billing, and Audit records.
 */
export function generateCanonicalReferenceSnapshot(options?: {
  snapshotId?: string;
  baseSha?: string;
  resourceId?: string;
  capturedAt?: string;
}): OpsSnapshot {
  const snapshotId = options?.snapshotId ?? "snap-ops-proof-ref-001";
  const capturedAt = options?.capturedAt ?? new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const baseSha = options?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
  const resourceId = options?.resourceId ?? "iso-db-res-001";

  // Fixed deterministic IDs
  const tenantId = "tenant-001";
  const orderId1 = "ord-001";
  const orderId2 = "ord-002";
  const driverId1 = "drv-001";
  const vehicleId1 = "veh-001";
  const jobId1 = "job-001";
  const jobId2 = "job-002";
  const assignmentId1 = "asg-001";
  const assignmentId2 = "asg-002";
  const tripId1 = "trp-001";
  const tripId2 = "trp-002";
  const statementId1 = "stm-001";
  const invoiceId1 = "inv-001";

  // Trips Domain
  const orders: OpsOrderRecord[] = [
    {
      order_id: orderId1,
      order_no: "ORD-20260906-001",
      tenant_id: tenantId,
      service_bucket: "enterprise_dispatch",
      pickup_address: "Taipei City Hall, No. 1, City Hall Rd",
      pickup_lat: 25.035699,
      pickup_lng: 121.566212,
      dropoff_address: "Taipei Main Station",
      dropoff_lat: 25.047761,
      dropoff_lng: 121.517042,
      scheduled_at: "2026-09-06T10:00:00.000Z",
      current_status: "completed",
      created_at: "2026-09-06T09:30:00.000Z",
    },
    {
      order_id: orderId2,
      order_no: "ORD-20260906-002",
      tenant_id: tenantId,
      service_bucket: "taxi_reservation",
      pickup_address: "Taipei Songshan Airport",
      pickup_lat: 25.069722,
      pickup_lng: 121.5525,
      dropoff_address: "Nangang Exhibition Center",
      dropoff_lat: 25.056667,
      dropoff_lng: 121.618611,
      scheduled_at: "2026-09-06T11:00:00.000Z",
      current_status: "completed",
      created_at: "2026-09-06T10:15:00.000Z",
    },
  ];

  const bookings: OpsBookingRecord[] = [
    {
      booking_id: "bk-001",
      order_id: orderId1,
      booking_type: "oneway",
      reservation_window_start: "2026-09-06T09:50:00.000Z",
      reservation_window_end: "2026-09-06T10:10:00.000Z",
      created_at: "2026-09-06T09:30:00.000Z",
    },
    {
      booking_id: "bk-002",
      order_id: orderId2,
      booking_type: "oneway",
      reservation_window_start: "2026-09-06T10:50:00.000Z",
      reservation_window_end: "2026-09-06T11:10:00.000Z",
      created_at: "2026-09-06T10:15:00.000Z",
    },
  ];

  const dispatchJobs: OpsDispatchJobRecord[] = [
    {
      dispatch_job_id: jobId1,
      order_id: orderId1,
      dispatch_mode: "auto",
      status: "completed",
      priority_score: 100,
      created_at: "2026-09-06T09:35:00.000Z",
    },
    {
      dispatch_job_id: jobId2,
      order_id: orderId2,
      dispatch_mode: "auto",
      status: "completed",
      priority_score: 90,
      created_at: "2026-09-06T10:20:00.000Z",
    },
  ];

  const dispatchAssignments: OpsDispatchAssignmentRecord[] = [
    {
      assignment_id: assignmentId1,
      dispatch_job_id: jobId1,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      status: "completed",
      assigned_at: "2026-09-06T09:36:00.000Z",
      completed_at: "2026-09-06T10:30:00.000Z",
      version_no: 1,
    },
    {
      assignment_id: assignmentId2,
      dispatch_job_id: jobId2,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      status: "completed",
      assigned_at: "2026-09-06T10:21:00.000Z",
      completed_at: "2026-09-06T11:45:00.000Z",
      version_no: 1,
    },
  ];

  const trips: OpsTripRecord[] = [
    {
      trip_id: tripId1,
      order_id: orderId1,
      assignment_id: assignmentId1,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      trip_status: "completed",
      actual_distance_km: 7.2,
      actual_duration_sec: 1440,
      proof_required: true,
      proof_status: "verified",
      created_at: "2026-09-06T09:40:00.000Z",
      completed_at: "2026-09-06T10:30:00.000Z",
    },
    {
      trip_id: tripId2,
      order_id: orderId2,
      assignment_id: assignmentId2,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      trip_status: "completed",
      actual_distance_km: 11.5,
      actual_duration_sec: 2100,
      proof_required: false,
      proof_status: "not_required",
      created_at: "2026-09-06T10:30:00.000Z",
      completed_at: "2026-09-06T11:45:00.000Z",
    },
  ];

  const proofBundles: OpsProofBundleRecord[] = [
    {
      proof_bundle_id: "pb-001",
      trip_id: tripId1,
      signoff_name: "Wang Hsiao-Ming",
      signoff_at: "2026-09-06T10:30:00.000Z",
      photo_count: 2,
      expense_total: 0,
      created_at: "2026-09-06T10:31:00.000Z",
    },
  ];

  // Billing Domain
  const driverFeePlans: BillingFeePlanRecord[] = [
    {
      plan_id: "plan-001",
      plan_name: "Standard Tier 1 Driver Revenue Share",
      version_no: "v1.0",
      calculation_method: "percentage_split_85_15",
      effective_from: "2026-01-01T00:00:00.000Z",
      status: "active",
    },
  ];

  // Trip 1: Fare 350, Driver gross 350, Fee 52.5 (15%), Net 297.5
  // Trip 2: Fare 550, Driver gross 550, Fee 82.5 (15%), Net 467.5
  // Driver Total: Gross 900, Fee 135, Subsidy 50, Net = 900 - 135 + 50 = 815.00
  const driverStatements: BillingDriverStatementRecord[] = [
    {
      statement_id: statementId1,
      driver_id: driverId1,
      period_month: "2026-09-01",
      fee_plan_id: "plan-001",
      gross_earning: 900.0,
      service_fee: 135.0,
      subsidy_amount: 50.0,
      net_amount: 815.0,
      payout_status: "approved",
      generated_at: "2026-09-06T11:50:00.000Z",
    },
  ];

  const driverStatementLines: BillingStatementLineRecord[] = [
    {
      line_id: "stl-001",
      statement_id: statementId1,
      line_type: "trip_fare",
      ref_id: tripId1,
      description: "Trip 1 Gross Earning",
      amount: 350.0,
    },
    {
      line_id: "stl-002",
      statement_id: statementId1,
      line_type: "trip_fare",
      ref_id: tripId2,
      description: "Trip 2 Gross Earning",
      amount: 550.0,
    },
    {
      line_id: "stl-003",
      statement_id: statementId1,
      line_type: "platform_fee",
      description: "Platform Service Fee (15%)",
      amount: -135.0,
    },
    {
      line_id: "stl-004",
      statement_id: statementId1,
      line_type: "bonus",
      description: "Peak Hour Completion Subsidy",
      amount: 50.0,
    },
  ];

  // Tenant Invoice: 2 orders -> Order 1 (350), Order 2 (550). Total = 900.00 TWD
  const tenantInvoices: BillingTenantInvoiceRecord[] = [
    {
      invoice_id: invoiceId1,
      tenant_id: tenantId,
      invoice_no: "INV-20260906-001",
      period_from: "2026-09-01",
      period_to: "2026-09-06",
      total_amount: 900.0,
      currency_code: "TWD",
      status: "issued",
      issued_at: "2026-09-06T11:55:00.000Z",
    },
  ];

  const invoiceLines: BillingInvoiceLineRecord[] = [
    {
      invoice_line_id: "inl-001",
      invoice_id: invoiceId1,
      order_id: orderId1,
      description: "Enterprise Trip - Taipei City Hall to Main Station",
      quantity: 1,
      unit_price: 350.0,
      line_total: 350.0,
    },
    {
      invoice_line_id: "inl-002",
      invoice_id: invoiceId1,
      order_id: orderId2,
      description: "Airport Transfer - Songshan to Nangang",
      quantity: 1,
      unit_price: 550.0,
      line_total: 550.0,
    },
  ];

  // Audit Domain
  const auditLogs: AdminAuditLogRecord[] = [
    {
      audit_id: "aud-001",
      actor_id: "usr-admin-01",
      actor_type: "platform_admin",
      tenant_id: tenantId,
      module_name: "ops.orders",
      action_name: "order.created",
      resource_type: "order",
      resource_id: orderId1,
      created_at: "2026-09-06T09:30:00.000Z",
      hash_value: calculateAuditLogHash("usr-admin-01", "ops.orders", "order.created", orderId1, "2026-09-06T09:30:00.000Z"),
    },
    {
      audit_id: "aud-002",
      actor_id: "usr-admin-01",
      actor_type: "platform_admin",
      tenant_id: tenantId,
      module_name: "ops.orders",
      action_name: "order.created",
      resource_type: "order",
      resource_id: orderId2,
      created_at: "2026-09-06T10:15:00.000Z",
      hash_value: calculateAuditLogHash("usr-admin-01", "ops.orders", "order.created", orderId2, "2026-09-06T10:15:00.000Z"),
    },
    {
      audit_id: "aud-003",
      actor_id: "system-billing",
      actor_type: "system",
      tenant_id: tenantId,
      module_name: "billing.invoices",
      action_name: "invoice.issued",
      resource_type: "invoice",
      resource_id: invoiceId1,
      created_at: "2026-09-06T11:55:00.000Z",
      hash_value: calculateAuditLogHash("system-billing", "billing.invoices", "invoice.issued", invoiceId1, "2026-09-06T11:55:00.000Z"),
    },
  ];

  const dispatchTraceLogs: OpsDispatchTraceLogRecord[] = [
    {
      trace_id: "trc-001",
      order_id: orderId1,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      event_type: "assignment_offered",
      event_time: "2026-09-06T09:36:00.000Z",
      source_channel: "auto_dispatcher",
      payload_hash: crypto.createHash("sha256").update("asg-001:offered").digest("hex"),
    },
    {
      trace_id: "trc-002",
      order_id: orderId1,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      event_type: "trip_completed",
      event_time: "2026-09-06T10:30:00.000Z",
      source_channel: "driver_app_api",
      payload_hash: crypto.createHash("sha256").update("trp-001:completed").digest("hex"),
    },
    {
      trace_id: "trc-003",
      order_id: orderId2,
      vehicle_id: vehicleId1,
      driver_id: driverId1,
      event_type: "trip_completed",
      event_time: "2026-09-06T11:45:00.000Z",
      source_channel: "driver_app_api",
      payload_hash: crypto.createHash("sha256").update("trp-002:completed").digest("hex"),
    },
  ];

  const tripsData = {
    orders,
    bookings,
    dispatchJobs,
    dispatchAssignments,
    trips,
    proofBundles,
  };

  const billingData = {
    driverFeePlans,
    driverStatements,
    driverStatementLines,
    tenantInvoices,
    invoiceLines,
  };

  const auditData = {
    auditLogs,
    dispatchTraceLogs,
  };

  const checksumSha256 = calculateSnapshotChecksum(tripsData, billingData, auditData);

  return {
    metadata: {
      snapshotId,
      capturedAt,
      schemaVersion: "1.0.0",
      baseSha,
      resourceId,
      checksumSha256,
      domainCounts: {
        orders: orders.length,
        bookings: bookings.length,
        dispatchJobs: dispatchJobs.length,
        dispatchAssignments: dispatchAssignments.length,
        trips: trips.length,
        proofBundles: proofBundles.length,
        driverFeePlans: driverFeePlans.length,
        driverStatements: driverStatements.length,
        driverStatementLines: driverStatementLines.length,
        tenantInvoices: tenantInvoices.length,
        invoiceLines: invoiceLines.length,
        auditLogs: auditLogs.length,
        dispatchTraceLogs: dispatchTraceLogs.length,
      },
    },
    trips: tripsData,
    billing: billingData,
    audit: auditData,
  };
}
