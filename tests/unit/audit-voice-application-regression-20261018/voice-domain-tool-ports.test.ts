import { describe, expect, it, vi } from "vitest";
import type { VoiceCapabilityTokenClaims, VoiceDispatchProjectionView } from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { VoiceDomainToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-domain-tool-ports";
import { VoiceHandoffOnlyToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-handoff-tool-ports";
import type { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceHandoffService } from "../../../apps/api/src/modules/voice-booking/voice-handoff.service";
import type { GeoService } from "../../../apps/api/src/modules/geo/geo.service";
import type { VoiceDispatchProjectionService } from "../../../apps/api/src/modules/voice-booking/voice-dispatch-projection.service";

/**
 * AUDIT-VOICE-APPLICATION-REGRESSION-20261018: `VoiceDomainToolPorts` is the
 * real domain backing for `resolve_location`/`get_bound_booking_status`
 * this task adds (see that class's own doc for exactly what remains
 * unimplemented and why: `check_booking_eligibility`/
 * `prepare_booking_readback` still delegate to the pre-existing
 * `VoiceHandoffOnlyToolPorts` 501). Only `GeoService`/
 * `VoiceDispatchProjectionService` are doubled -- the fallback port and the
 * context shape mirror apps/api's real `VoiceToolGatewayService.execute`
 * call site exactly (see `voice-capability-composition.test.ts`'s own
 * fixture for the same context shape).
 */

function claims(
  overrides: Partial<VoiceCapabilityTokenClaims> = {},
): VoiceCapabilityTokenClaims {
  return {
    iss: "drts_voice_capability_issuer",
    aud: "voice-tool-gateway",
    exp: Math.floor(Date.now() / 1000) + 60,
    servicePrincipalId: "svc-voice-media-worker",
    voiceSessionId: "22222222-2222-2222-2222-222222222222",
    resourceScopeId: "33333333-3333-3333-3333-333333333333",
    routeProfileVersion: 1,
    leaseEpoch: 1,
    scopes: ["session_execute", "address_resolve", "order_read_bound"],
    ...overrides,
  };
}

function context(
  overrides: Partial<{
    boundOrderId: string | null;
    inputEpoch: number;
    signal: AbortSignal;
  }> = {},
) {
  return {
    claims: claims(),
    inputEpoch: 1,
    boundOrderId: null,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function buildFallback(): VoiceHandoffOnlyToolPorts {
  const repository = {
    findSessionById: vi.fn(async () => null),
  } as unknown as VoiceBookingRepository;
  const handoffService = {
    initiateHandoff: vi.fn(),
  } as unknown as VoiceHandoffService;
  return new VoiceHandoffOnlyToolPorts(repository, handoffService);
}

describe("VoiceDomainToolPorts.execute resolve_location", () => {
  it("lists up to three real GeoService candidates, mapped to the tool result contract", async () => {
    const search = vi.fn(async () => ({
      candidates: [
        {
          candidateId: "cand-1",
          provider: "google",
          placeId: "place-1",
          displayName: "台北車站",
          address: "台北市中正區北平西路3號",
          district: "中正區",
          confidence: "high" as const,
        },
        {
          candidateId: "cand-2",
          provider: "google",
          placeId: null,
          providerCandidateId: "provider-cand-2",
          displayName: "台北車站(東側)",
          address: "台北市中正區忠孝西路一段",
          locality: "台北市",
          confidence: "medium" as const,
        },
      ],
      provider: "google",
      generatedAt: "2026-10-18T00:00:00.000Z",
    }));
    const geo = {
      health: vi.fn(() => ({ status: "healthy", failClosed: false, mode: "external" })),
      search,
    } as unknown as GeoService;
    const ports = new VoiceDomainToolPorts(buildFallback(), geo, undefined);

    const result = await ports.execute(
      { name: "resolve_location", args: { query: "台北車站" } },
      context(),
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ q: "台北車站", limit: 3, surface: "callcenter" }),
    );
    expect(result).toEqual({
      candidates: [
        { placeId: "place-1", label: "台北車站", region: "中正區" },
        { placeId: "provider-cand-2", label: "台北車站(東側)", region: "台北市" },
      ],
    });
  });

  it("falls back to candidateId when neither placeId nor providerCandidateId is present, never an empty placeId", async () => {
    const geo = {
      health: vi.fn(() => ({ status: "healthy", failClosed: false, mode: "external" })),
      search: vi.fn(async () => ({
        candidates: [
          {
            candidateId: "cand-only",
            provider: "mock",
            displayName: "測試地點",
            address: "測試地址",
            confidence: "low" as const,
          },
        ],
        provider: "mock",
        generatedAt: "2026-10-18T00:00:00.000Z",
      })),
    } as unknown as GeoService;
    const ports = new VoiceDomainToolPorts(buildFallback(), geo, undefined);

    const result = (await ports.execute(
      { name: "resolve_location", args: { query: "測試" } },
      context(),
    )) as { candidates: Array<{ placeId: string }> };

    expect(result.candidates[0]!.placeId).toBe("cand-only");
  });

  it("fails closed with VOICE_ADDRESS_PROVIDER_UNAVAILABLE instead of fabricating candidates when the provider is degraded/fixture", async () => {
    const geo = {
      health: vi.fn(() => ({ status: "healthy", failClosed: false, mode: "fixture" })),
      search: vi.fn(),
    } as unknown as GeoService;
    const ports = new VoiceDomainToolPorts(buildFallback(), geo, undefined);

    await expect(
      ports.execute({ name: "resolve_location", args: { query: "台北車站" } }, context()),
    ).rejects.toMatchObject({ code: "VOICE_ADDRESS_PROVIDER_UNAVAILABLE" });
    expect(geo.search).not.toHaveBeenCalled();
  });

  it("fails closed with VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE when no GeoService is wired, instead of silently 501ing it like an unimplemented tool", async () => {
    const ports = new VoiceDomainToolPorts(buildFallback(), undefined, undefined);

    await expect(
      ports.execute({ name: "resolve_location", args: { query: "台北車站" } }, context()),
    ).rejects.toMatchObject({ code: "VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE" });
  });
});

describe("VoiceDomainToolPorts.execute get_bound_booking_status", () => {
  function dispatchView(
    overrides: Partial<VoiceDispatchProjectionView> = {},
  ): VoiceDispatchProjectionView {
    return {
      projection: "matching",
      announcement: "已受理，正在找車",
      orderId: "order-1",
      orderStatus: "created",
      orderVersion: 1,
      assignmentId: null,
      assignmentVersion: null,
      driverTaskId: null,
      driverTaskStatus: null,
      observedAt: "2026-10-18T00:00:00.000Z",
      acceptedAt: null,
      etaMinutes: null,
      etaSource: null,
      driverId: null,
      vehicleId: null,
      reasonCode: null,
      reasonNote: null,
      ...overrides,
    };
  }

  it("projects the real dispatch status, using the real announcement as the honest human-readable status", async () => {
    const projectDispatch = vi.fn(async () => dispatchView({ projection: "accepted", announcement: "司機已接單" }));
    const dispatchProjection = {
      projectDispatch,
    } as unknown as VoiceDispatchProjectionService;
    const ports = new VoiceDomainToolPorts(buildFallback(), undefined, dispatchProjection);

    const result = await ports.execute(
      { name: "get_bound_booking_status", args: {} },
      context({ boundOrderId: "order-1" }),
    );

    expect(projectDispatch).toHaveBeenCalledWith("order-1");
    expect(result).toEqual({ orderId: "order-1", status: "司機已接單" });
  });

  it("never calls the dispatch projection and answers null when no order is bound (defense in depth; the gateway already short-circuits this case itself)", async () => {
    const projectDispatch = vi.fn();
    const dispatchProjection = {
      projectDispatch,
    } as unknown as VoiceDispatchProjectionService;
    const ports = new VoiceDomainToolPorts(buildFallback(), undefined, dispatchProjection);

    const result = await ports.execute(
      { name: "get_bound_booking_status", args: {} },
      context({ boundOrderId: null }),
    );

    expect(result).toBeNull();
    expect(projectDispatch).not.toHaveBeenCalled();
  });

  it("fails closed with VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE when no VoiceDispatchProjectionService is wired", async () => {
    const ports = new VoiceDomainToolPorts(buildFallback(), undefined, undefined);

    await expect(
      ports.execute(
        { name: "get_bound_booking_status", args: {} },
        context({ boundOrderId: "order-1" }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE" });
  });
});

describe("VoiceDomainToolPorts.execute delegates everything else to the existing honest fallback", () => {
  it("fails closed when the configured booking continuation dependencies are absent", async () => {
    const ports = new VoiceDomainToolPorts(buildFallback(), undefined, undefined);

    await expect(
      ports.execute({ name: "check_booking_eligibility", args: {} }, context()),
    ).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      ports.execute({ name: "check_booking_eligibility", args: {} }, context()),
    ).rejects.toMatchObject({ code: "VOICE_BOOKING_CONTINUATION_UNAVAILABLE" });
    await expect(
      ports.execute({ name: "prepare_booking_readback", args: {} }, context()),
    ).rejects.toMatchObject({ code: "VOICE_BOOKING_CONTINUATION_UNAVAILABLE" });
  });

  it("delegates request_handoff to the real VoiceHandoffOnlyToolPorts instead of reimplementing it", async () => {
    const repository = {
      findSessionById: vi.fn(async () => ({
        voiceSessionId: claims().voiceSessionId,
        sessionVersion: 5,
        inputEpoch: 1,
      })),
    } as unknown as VoiceBookingRepository;
    const initiateHandoff = vi.fn(async () => ({
      queueItem: { status: "queued" },
      handoffId: "handoff-1",
    }));
    const handoffService = {
      initiateHandoff,
    } as unknown as VoiceHandoffService;
    const fallback = new VoiceHandoffOnlyToolPorts(repository, handoffService);
    const ports = new VoiceDomainToolPorts(fallback, undefined, undefined);

    const result = await ports.execute(
      { name: "request_handoff", args: { reason: "customer_requested" } },
      context({ inputEpoch: 1 }),
    );

    expect(initiateHandoff).toHaveBeenCalled();
    expect(result).toEqual({ status: "queued", handoffId: "handoff-1" });
  });
});
