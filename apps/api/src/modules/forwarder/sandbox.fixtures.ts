import {
  type BroadcastForwardedOrderCommand,
  PLATFORM_CODE_FORWARDER_SANDBOX,
  type CompleteForwarderReconciliationCommand,
  type ForwarderAdapterCapabilitySummary,
  type IngestExternalOrderCommand,
  type PlatformCode,
  type RelayDriverAcceptCommand,
  type SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import type { ForwarderAdapterEarningsResult } from "./forwarder-adapter.interface";

export const FORWARDER_SANDBOX_PLATFORM_CODE: PlatformCode =
  PLATFORM_CODE_FORWARDER_SANDBOX;

export const FORWARDER_SANDBOX_CAPABILITY_SUMMARY: ForwarderAdapterCapabilitySummary =
  {
    mode: "stub",
    productionStatus: "stub",
    supportsInboundWebhook: true,
    supportsOutboundActions: true,
    supportedWebhookEvents: [
      "forwarder.order.received",
      "forwarder.order.broadcasted",
      "forwarder.order.accept_pending",
      "forwarder.order.confirmed_by_platform",
      "forwarder.order.completed_synced",
      "forwarder.order.lost_race",
      "forwarder.order.cancelled_by_platform",
      "forwarder.settlement.sample_ready",
    ],
    notes: [
      "Generic forwarder sandbox provider for local and CI harnesses.",
      "Non-production only. Do not use for partner credential, auth, or webhook signature validation.",
    ],
  };

export const FORWARDER_SANDBOX_FIXTURES = {
  inboundOrder: {
    platformCode: FORWARDER_SANDBOX_PLATFORM_CODE,
    externalOrderId: "SBX-ORDER-001",
    payload: {
      serviceBucket: "standard_taxi",
      pickup: {
        address: "台中市梧棲區中二路一段9號",
        lat: 24.264,
        lng: 120.525,
      },
      dropoff: {
        address: "台中市大安區興安路378號",
        lat: 24.347,
        lng: 120.586,
      },
      passengerName: "Sandbox Rider",
      acceptTimeoutSec: 15,
      sandbox: true,
    },
  } satisfies IngestExternalOrderCommand,
  broadcast: {
    candidateDriverIds: ["driver-sbx-001", "driver-sbx-002"],
  } satisfies BroadcastForwardedOrderCommand,
  accept: {
    driverId: "driver-sbx-001",
  } satisfies RelayDriverAcceptCommand,
  confirmedSync: {
    nativeStatus: "confirmed_by_platform",
    payload: {
      sandbox: true,
      result: "confirmed",
      driverEtaMinutes: 6,
    },
  } satisfies SyncForwardedOrderStatusCommand,
  lostRaceSync: {
    nativeStatus: "lost_race",
    payload: {
      sandbox: true,
      result: "lost_race",
    },
  } satisfies SyncForwardedOrderStatusCommand,
  cancelledSync: {
    nativeStatus: "cancelled_by_platform",
    payload: {
      sandbox: true,
      result: "cancelled_by_platform",
      reason: "partner_cancelled",
    },
  } satisfies SyncForwardedOrderStatusCommand,
  completedSync: {
    nativeStatus: "completed",
    payload: {
      sandbox: true,
      result: "completed",
      completedAt: "2026-05-19T05:00:00.000Z",
      settlementReference: "SBX-STL-001",
    },
  } satisfies SyncForwardedOrderStatusCommand,
  settlementSample: {
    platformCode: FORWARDER_SANDBOX_PLATFORM_CODE,
    currency: "TWD",
    totalAmount: 315,
    asOf: "2026-05-19T05:00:00.000Z",
  } satisfies ForwarderAdapterEarningsResult,
  reconciliationComplete: {
    nativeStatus: "completed",
    mismatchCount: 0,
    notes: "Sandbox reconciliation completed with no mismatches.",
    payload: {
      sandbox: true,
      result: "completed",
      settlementReference: "SBX-STL-001",
    },
  } satisfies CompleteForwarderReconciliationCommand,
};
