import type {
  BroadcastForwardedOrderCommand,
  CompleteForwarderReconciliationCommand,
  IngestExternalOrderCommand,
  PlatformCode,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import type {
  ForwarderAdapterAcceptInput,
  ForwarderAdapterCompleteInput,
  ForwarderAdapterRejectInput,
} from "./forwarder-adapter.interface";

const DEFAULT_SETTLEMENT_COMPLETED_AT = "2026-05-19T00:30:00.000Z";
const DEFAULT_SETTLEMENT_GENERATED_AT = "2026-05-19T00:45:00.000Z";

export const FORWARDER_SANDBOX_SUPPORTED_WEBHOOK_EVENTS = [
  "forwarder.order.received",
  "forwarder.order.confirmed_by_platform",
  "forwarder.order.lost_race",
  "forwarder.order.cancelled_by_platform",
  "forwarder.order.completed",
  "forwarder.settlement.sample_ready",
] as const;

export interface ForwarderSandboxSettlementRow {
  externalOrderId: string;
  platformCode: PlatformCode;
  driverId: string;
  status: "completed";
  completedAt: string;
  currency: string;
  totalAmount: number;
  payoutReference: string;
}

export interface ForwarderSandboxSettlementSample {
  currency: string;
  totalAmount: number;
  generatedAt: string;
  rows: ForwarderSandboxSettlementRow[];
  csv: string;
}

export interface ForwarderSandboxFixtures {
  providerKey: string;
  providerDisplayName: string;
  platformCode: PlatformCode;
  signatureHeaderName: string;
  expectedSignature: string;
  webhookHeaders: Record<string, string>;
  inboundWebhookPayload: Record<string, unknown>;
  inboundOrderCommand: IngestExternalOrderCommand;
  broadcastCommand: BroadcastForwardedOrderCommand;
  relayAcceptCommand: RelayDriverAcceptCommand;
  adapterAcceptInput: ForwarderAdapterAcceptInput;
  adapterRejectInput: ForwarderAdapterRejectInput;
  adapterCompleteInput: ForwarderAdapterCompleteInput;
  confirmedStatusCommand: SyncForwardedOrderStatusCommand;
  lostRaceStatusCommand: SyncForwardedOrderStatusCommand;
  cancelledStatusCommand: SyncForwardedOrderStatusCommand;
  completeReconciliationCommand: CompleteForwarderReconciliationCommand;
  settlementSample: ForwarderSandboxSettlementSample;
}

export interface BuildForwarderSandboxFixtureOptions {
  platformCode: PlatformCode;
  providerKey: string;
  providerDisplayName: string;
  signatureHeaderName?: string;
  externalOrderId?: string;
  driverId?: string;
  serviceBucket?: "standard_taxi" | "business_dispatch";
  currency?: string;
}

export function buildForwarderSandboxFixtures(
  options: BuildForwarderSandboxFixtureOptions,
): ForwarderSandboxFixtures {
  const signatureHeaderName =
    options.signatureHeaderName ?? "x-forwarder-sandbox-signature";
  const providerKey = options.providerKey.trim();
  const providerDisplayName = options.providerDisplayName.trim();
  const externalOrderId =
    options.externalOrderId ??
    `SBX-${options.platformCode.replace(/_/g, "-").toUpperCase()}-0001`;
  const driverId = options.driverId ?? "drv-demo-001";
  const serviceBucket = options.serviceBucket ?? "standard_taxi";
  const currency = options.currency ?? "TWD";
  const expectedSignature = `sandbox:${providerKey}`;

  const inboundOrderCommand: IngestExternalOrderCommand = {
    platformCode: options.platformCode,
    externalOrderId,
    payload: {
      sandboxProviderKey: providerKey,
      sandboxProviderDisplayName: providerDisplayName,
      scenario: "inbound_order",
      serviceBucket,
      pickupAddress: "台中市梧棲區中二路一段9號",
      dropoffAddress: "台中市清水區臨港路五段658號",
      passengerName: "Sandbox Rider",
      passengerPhone: "0900000000",
      quotedFareAmount: 420,
      quotedFareCurrency: currency,
    },
  };

  const inboundWebhookPayload = {
    platformCode: options.platformCode,
    sandboxProviderKey: providerKey,
    sandboxProviderDisplayName: providerDisplayName,
    externalOrderId,
    orderId: externalOrderId,
    scenario: "inbound_order",
    serviceBucket,
    pickupAddress: "台中市梧棲區中二路一段9號",
    dropoffAddress: "台中市清水區臨港路五段658號",
    passengerName: "Sandbox Rider",
    passengerPhone: "0900000000",
    quotedFareAmount: 420,
    quotedFareCurrency: currency,
  } satisfies Record<string, unknown>;

  const settlementRows: ForwarderSandboxSettlementRow[] = [
    {
      externalOrderId,
      platformCode: options.platformCode,
      driverId,
      status: "completed",
      completedAt: DEFAULT_SETTLEMENT_COMPLETED_AT,
      currency,
      totalAmount: 420,
      payoutReference: `${providerKey}-settlement-0001`,
    },
  ];

  const settlementSample: ForwarderSandboxSettlementSample = {
    currency,
    totalAmount: settlementRows.reduce((sum, row) => sum + row.totalAmount, 0),
    generatedAt: DEFAULT_SETTLEMENT_GENERATED_AT,
    rows: settlementRows,
    csv: [
      [
        "external_order_id",
        "platform_code",
        "driver_id",
        "status",
        "completed_at",
        "currency",
        "total_amount",
        "payout_reference",
      ].join(","),
      ...settlementRows.map((row) =>
        [
          row.externalOrderId,
          row.platformCode,
          row.driverId,
          row.status,
          row.completedAt,
          row.currency,
          String(row.totalAmount),
          row.payoutReference,
        ].join(","),
      ),
    ].join("\n"),
  };

  return {
    providerKey,
    providerDisplayName,
    platformCode: options.platformCode,
    signatureHeaderName,
    expectedSignature,
    webhookHeaders: {
      [signatureHeaderName]: expectedSignature,
      "x-forwarder-sandbox-provider": providerKey,
    },
    inboundWebhookPayload,
    inboundOrderCommand,
    broadcastCommand: {
      candidateDriverIds: [driverId],
    },
    relayAcceptCommand: {
      driverId,
    },
    adapterAcceptInput: {
      externalOrderId,
      driverId,
      payload: {
        scenario: "accept",
        sandboxProviderKey: providerKey,
      },
    },
    adapterRejectInput: {
      externalOrderId,
      reason: "sandbox_driver_declined",
      payload: {
        scenario: "reject",
        sandboxProviderKey: providerKey,
      },
    },
    adapterCompleteInput: {
      externalOrderId,
      payload: {
        scenario: "complete",
        sandboxProviderKey: providerKey,
        settlementGeneratedAt: settlementSample.generatedAt,
      },
    },
    confirmedStatusCommand: {
      nativeStatus: "confirmed_by_platform",
      payload: {
        scenario: "confirmed_by_platform",
        sandboxProviderKey: providerKey,
        confirmationCode: `${providerKey}-confirm-0001`,
      },
    },
    lostRaceStatusCommand: {
      nativeStatus: "lost_race",
      payload: {
        scenario: "lost_race",
        sandboxProviderKey: providerKey,
        externalWinner: "other-fleet",
      },
    },
    cancelledStatusCommand: {
      nativeStatus: "cancelled_by_platform",
      payload: {
        scenario: "cancelled_by_platform",
        sandboxProviderKey: providerKey,
        cancelReason: "sandbox_customer_cancelled",
      },
    },
    completeReconciliationCommand: {
      nativeStatus: "confirmed_by_platform",
      mismatchCount: 0,
      notes: "Sandbox completion fixture resolved without mismatch.",
      payload: {
        scenario: "complete",
        sandboxProviderKey: providerKey,
        settlementGeneratedAt: settlementSample.generatedAt,
      },
    },
    settlementSample,
  };
}
