import { describe, expect, it } from "vitest";

import { PLATFORM_CODE_GRAB_TAIWAN } from "@drts/contracts";

import { GrabTaiwanAdapter } from "../../src/modules/forwarder/grab-taiwan.adapter";
import { ForwarderSandboxAdapter } from "../../src/modules/forwarder/sandbox.adapter";
import { buildForwarderSandboxFixtures } from "../../src/modules/forwarder/sandbox.fixtures";

describe("ForwarderSandboxAdapter", () => {
  it("builds deterministic sandbox fixtures for inbound, status sync, and settlement evidence", () => {
    const fixtures = buildForwarderSandboxFixtures({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      providerKey: "generic-forwarder-sandbox",
      providerDisplayName: "Generic Forwarder Sandbox",
    });

    expect(fixtures.inboundOrderCommand).toMatchObject({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "SBX-GRAB-TAIWAN-0001",
      payload: expect.objectContaining({
        scenario: "inbound_order",
        sandboxProviderKey: "generic-forwarder-sandbox",
      }),
    });
    expect(fixtures.broadcastCommand).toEqual({
      candidateDriverIds: ["drv-demo-001"],
    });
    expect(fixtures.lostRaceStatusCommand).toMatchObject({
      nativeStatus: "lost_race",
      payload: expect.objectContaining({
        externalWinner: "other-fleet",
      }),
    });
    expect(fixtures.settlementSample.csv).toContain(
      "external_order_id,platform_code,driver_id,status,completed_at,currency,total_amount,payout_reference",
    );
    expect(fixtures.settlementSample.totalAmount).toBe(420);
  });

  it("marks sandbox providers as non-production while still accepting fixture webhooks", async () => {
    const fixtures = buildForwarderSandboxFixtures({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      providerKey: "generic-forwarder-sandbox",
      providerDisplayName: "Generic Forwarder Sandbox",
      signatureHeaderName: "x-sandbox-signature",
    });
    const adapter = new ForwarderSandboxAdapter(fixtures);

    expect(adapter.capabilitySummary).toMatchObject({
      mode: "hybrid",
      productionStatus: "stub",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
    });
    expect(adapter.capabilitySummary.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("non-production"),
        expect.stringContaining("sandbox fixtures"),
      ]),
    );

    await expect(
      adapter.verifyWebhook({
        headers: fixtures.webhookHeaders,
        payload: fixtures.inboundWebhookPayload,
      }),
    ).resolves.toMatchObject({
      accepted: true,
      webhookStatus: "stub",
    });

    await expect(
      adapter.verifyWebhook({
        headers: {},
        payload: fixtures.inboundWebhookPayload,
      }),
    ).resolves.toMatchObject({
      accepted: false,
      webhookStatus: "failing",
    });
  });

  it("keeps Grab Taiwan bound to the shared sandbox harness and settlement sample", async () => {
    const adapter = new GrabTaiwanAdapter();

    expect(adapter.capabilitySummary).toMatchObject({
      mode: "hybrid",
      productionStatus: "stub",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
    });

    await expect(
      adapter.fetchEarnings({
        driverId: "drv-demo-001",
      }),
    ).resolves.toMatchObject({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      currency: "TWD",
      totalAmount: 420,
      asOf: "2026-05-19T00:45:00.000Z",
    });

    await expect(adapter.getHealthSnapshot!()).resolves.toMatchObject({
      reason: "stub",
      message: expect.stringContaining("non-production"),
    });
  });
});
