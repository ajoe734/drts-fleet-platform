import { describe, expect, it } from "vitest";
import { ApiClientError } from "@drts/api-client";
import type { SupplyDispatchBlockReason } from "@drts/contracts";
import {
  describeActionFailure,
  dispatchFlagForAction,
  resolveCrossAppHref,
  resolveEmptyReason,
  vehicleDispatchAction,
  type GovernedVehicleRecord,
} from "../../app/fleet/fleet-governance";

function makeVehicle(
  dispatchableFlag: boolean,
  blockedReasons: SupplyDispatchBlockReason[],
): GovernedVehicleRecord {
  return {
    vehicleId: "veh-demo-003",
    plateNo: "ABC-1003",
    createdAt: "2026-08-27T04:59:40.000Z",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag,
    exclusivityApproved: false,
    insuranceStatus: "expired",
    updatedAt: "2026-08-27T04:59:40.000Z",
    supplyLifecycle: {
      contract: {
        contractId: null,
        lifecycleStatus: "missing",
        startAt: null,
        endAt: null,
        updatedAt: null,
      },
      insurance: {
        policyId: null,
        lifecycleStatus: "expired",
        startAt: null,
        endAt: "2026-03-31T23:59:59.000Z",
        updatedAt: null,
      },
      exclusivity: {
        lifecycleStatus: "missing",
        declarationStatus: "missing",
        declarationFileId: null,
        reviewStatus: "draft",
        providerName: null,
        effectiveStart: null,
        effectiveEnd: null,
        reviewedAt: null,
        updatedAt: null,
      },
      dispatch: {
        eligible: blockedReasons.length === 0,
        blockedReasons,
        evaluatedAt: "2026-09-02T01:05:50.000Z",
      },
      offboarding: {
        status: "none",
        reason: null,
        requestedAt: null,
        effectiveAt: null,
        completedAt: null,
        requestedBy: null,
        debrandingRequired: false,
        debrandingStatus: "not_required",
        debrandingDueAt: null,
        debrandingCompletedAt: null,
        debrandingTicketId: null,
        notes: null,
      },
      lastTrace: null,
    },
  };
}

describe("fleet tab empty state", () => {
  it("keeps the loaded table when an action was refused but the fetch succeeded", () => {
    // A 409 from one row action used to share the page's single `error` slot,
    // which turned the whole tab into "this tab failed to load" while five
    // vehicles sat loaded in state.
    expect(
      resolveEmptyReason({
        previewEmptyReason: null,
        envelopeEmptyReason: null,
        loadError: null,
        itemCount: 5,
      }),
    ).toBeNull();
  });

  it("reports fetch_failed only when the load itself failed", () => {
    expect(
      resolveEmptyReason({
        previewEmptyReason: null,
        envelopeEmptyReason: null,
        loadError: "network down",
        itemCount: 5,
      }),
    ).toBe("fetch_failed");
  });

  it("prefers the backend envelope reason over the row count", () => {
    expect(
      resolveEmptyReason({
        previewEmptyReason: null,
        envelopeEmptyReason: "not_provisioned",
        loadError: null,
        itemCount: 0,
      }),
    ).toBe("not_provisioned");
  });

  it("falls back to no_data for an empty tab", () => {
    expect(
      resolveEmptyReason({
        previewEmptyReason: null,
        envelopeEmptyReason: null,
        loadError: null,
        itemCount: 0,
      }),
    ).toBe("no_data");
  });
});

describe("vehicle dispatch action", () => {
  it("disables release while a compliance blocker stands, naming the blocker", () => {
    const action = vehicleDispatchAction(
      makeVehicle(false, [
        "contract_missing",
        "insurance_expired",
        "exclusivity_missing",
        "manual_hold",
      ]),
    );

    expect(action.action).toBe("release_vehicle_dispatch");
    expect(action.enabled).toBe(false);
    expect(action.disabledReasonCode).toBe("contract_missing");
  });

  it("enables release when only the manual hold remains", () => {
    const action = vehicleDispatchAction(makeVehicle(false, ["manual_hold"]));

    expect(action.action).toBe("release_vehicle_dispatch");
    expect(action.enabled).toBe(true);
    expect(action.disabledReasonCode).toBeUndefined();
  });

  it("offers a hold on a dispatchable vehicle", () => {
    const action = vehicleDispatchAction(makeVehicle(true, []));

    expect(action.action).toBe("hold_vehicle_dispatch");
    expect(action.enabled).toBe(true);
  });

  it("sends the flag the action names rather than toggling a stale row", () => {
    const staleRow = makeVehicle(true, []);

    expect(dispatchFlagForAction("release_vehicle_dispatch", staleRow)).toBe(
      true,
    );
    expect(dispatchFlagForAction("hold_vehicle_dispatch", staleRow)).toBe(
      false,
    );
  });
});

describe("ops console deep link", () => {
  const link = {
    targetApp: "ops-console" as const,
    route: "/vehicles/veh-demo-003",
    resourceType: "vehicle",
    resourceId: "veh-demo-003",
    openMode: "new_tab" as const,
    label: "ABC-1003",
  };

  it("returns null when the deployment has no ops console origin", () => {
    // A bare route would resolve against platform-admin, which has no
    // /vehicles page, so the caller disables the button instead.
    expect(resolveCrossAppHref(null, "/vehicles/veh-demo-003", "")).toBeNull();
  });

  it("prefixes the configured origin onto the fallback route", () => {
    expect(
      resolveCrossAppHref(
        null,
        "/vehicles/veh-demo-003",
        "https://ops.example",
      ),
    ).toBe("https://ops.example/vehicles/veh-demo-003");
  });

  it("prefixes the configured origin onto a relative backend route", () => {
    expect(resolveCrossAppHref(link, "/ignored", "https://ops.example")).toBe(
      "https://ops.example/vehicles/veh-demo-003",
    );
  });

  it("passes an absolute backend route through untouched", () => {
    expect(
      resolveCrossAppHref(
        { ...link, route: "https://ops.other/vehicles/veh-demo-003" },
        "/ignored",
        "https://ops.example",
      ),
    ).toBe("https://ops.other/vehicles/veh-demo-003");
  });
});

describe("action failure copy", () => {
  const conflict = new ApiClientError({
    statusCode: 409,
    code: "VEHICLE_NOT_DISPATCHABLE",
    message:
      "The vehicle cannot be marked dispatchable until contract, insurance, and exclusivity requirements are satisfied.",
    details: {
      vehicleId: "veh-demo-003",
      blockedReasons: [
        "contract_missing",
        "insurance_expired",
        "exclusivity_missing",
      ],
    },
    retryable: false,
    traceId: "9eddc6e7-a7b1-4c7e-ac96-c383e8de5582",
    rawBody: '{"error":{"code":"VEHICLE_NOT_DISPATCHABLE"}}',
  });

  it("replaces the raw error envelope with localized copy and reasons", () => {
    const failure = describeActionFailure("zh", "恢復派遣", conflict);

    expect(failure.title).toContain("恢復派遣");
    expect(failure.message).not.toContain("VEHICLE_NOT_DISPATCHABLE");
    expect(failure.message).not.toContain("{");
    expect(failure.reasons).toEqual(["無有效合約", "保單已過期", "無排他聲明"]);
    expect(failure.traceId).toBe("9eddc6e7-a7b1-4c7e-ac96-c383e8de5582");
  });

  it("localizes the same failure in English", () => {
    const failure = describeActionFailure("en", "Release dispatch", conflict);

    expect(failure.reasons).toEqual([
      "No Active Contract",
      "Policy Expired",
      "No Exclusivity File",
    ]);
  });

  it("falls back to the raw message for a non-API error", () => {
    const failure = describeActionFailure("en", "Refresh", new Error("boom"));

    expect(failure.message).toBe("boom");
    expect(failure.reasons).toEqual([]);
    expect(failure.traceId).toBeNull();
  });
});
