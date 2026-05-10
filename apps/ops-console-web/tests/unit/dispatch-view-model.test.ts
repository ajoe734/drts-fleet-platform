import { describe, expect, it } from "vitest";
import type { ForwardedOrderRecord } from "@drts/contracts";
import { managementSurfaceTone } from "@drts/ui-web";
import { getForwardedRowStyle } from "../../app/dispatch/dispatch-view-model";

function buildForwardedOrder(
  overrides: Partial<ForwardedOrderRecord> = {},
): ForwardedOrderRecord {
  return {
    mirrorOrderId: "mirror_001",
    platformCode: "uber",
    externalOrderId: "ext_001",
    orderDomain: "forwarded",
    dispatchSemantics: "forwarder_broadcast",
    status: "broadcasted",
    candidateDriverIds: [],
    acceptedDriverId: null,
    lastNativeStatus: null,
    payload: {},
    authoritativeSnapshot: {},
    financeContext: {
      fareAuthority: "external_platform",
      settlementAuthority: "external_platform",
      driverPayoutAuthority: "external_platform",
      localLedgerMode: "shadow_only",
    },
    lastSyncError: null,
    manualFallback: {
      required: false,
      reason: null,
      requestedAt: null,
      requestedBy: null,
      notes: null,
    },
    reconciliationJob: null,
    createdAt: "2026-05-10T17:00:00Z",
    updatedAt: "2026-05-10T17:05:00Z",
    ...overrides,
  };
}

describe("dispatch forwarded row tone", () => {
  it("keeps mirror rows on forwarded authority colors", () => {
    const forwardedTone = managementSurfaceTone("forwarded");
    const ownedTone = managementSurfaceTone("owned");
    const inactiveStyle = getForwardedRowStyle(buildForwardedOrder(), false);
    const activeStyle = getForwardedRowStyle(
      buildForwardedOrder({ status: "sync_failed" }),
      true,
    );

    expect(inactiveStyle).toMatchInlineSnapshot(`
      {
        "background": "#FEF3E2",
        "borderBottom": "1px solid #F4D9A6",
        "boxShadow": "inset 4px 0 0 #F4D9A6",
        "cursor": "pointer",
      }
    `);
    expect(activeStyle).toMatchInlineSnapshot(`
      {
        "background": "#FEF3E2",
        "borderBottom": "1px solid #F4D9A6",
        "boxShadow": "inset 4px 0 0 #B45309",
        "cursor": "pointer",
      }
    `);
    expect(inactiveStyle.background).toBe(forwardedTone.background);
    expect(activeStyle.background).toBe(forwardedTone.background);
    expect(inactiveStyle.background).not.toBe(ownedTone.background);
    expect(activeStyle.background).not.toBe(ownedTone.background);
  });
});
