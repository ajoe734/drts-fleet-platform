import { describe, expect, it, vi } from "vitest";

import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import {
  aggregateFrequentPlaces,
  rankByFrequentPlaces,
  taiwanPhoneVariants,
  type FrequentPickupPlace,
} from "../../../apps/api/src/modules/callcenter-assist/frequent-places";
import { CallcenterFrequentPlacesService } from "../../../apps/api/src/modules/callcenter-assist/frequent-places.service";
import type { VoiceSessionRecord } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceDomainToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-domain-tool-ports";
import {
  handOffOnKeypress,
  isHumanHandoffKeypress,
  shouldHandOffOnKeypress,
} from "../../../apps/api/src/modules/voice-booking/voice-dtmf-handoff";

const pickup = (
  lat: number,
  lng: number,
  extra: Record<string, unknown> = {},
) => ({
  address: `台北市中山區某路${Math.round(lat * 1e4)}號`,
  lat,
  lng,
  geocodeProvider: "mock-geo",
  coordinateSource: "provider_candidate",
  ...extra,
});

describe("taiwanPhoneVariants", () => {
  it.each([
    ["0912345678", ["0912345678", "+886912345678", "886912345678"]],
    ["+886 912-345-678", ["0912345678", "+886912345678", "886912345678"]],
    ["+886-2-2345-6789", ["0223456789", "+886223456789", "886223456789"]],
  ])("covers the stored spellings of %s", (phone, expected) => {
    expect(taiwanPhoneVariants(phone)).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it.each([null, "", "anonymous", "unknown", "110", "+1 415 555 0100"])(
    "never looks up %s",
    (phone) => {
      expect(taiwanPhoneVariants(phone)).toEqual([]);
    },
  );
});

describe("aggregateFrequentPlaces", () => {
  it("groups nearby pickups, counts trips and ranks by use then recency", () => {
    const places = aggregateFrequentPlaces([
      { pickup: pickup(25.05, 121.52), createdAt: "2026-11-01T00:00:00Z" },
      // ~20 m away: the same entrance with GPS jitter.
      {
        pickup: pickup(25.0502, 121.5201, { addressName: "家" }),
        createdAt: "2026-11-05T00:00:00Z",
      },
      { pickup: pickup(25.033, 121.565), createdAt: "2026-11-09T00:00:00Z" },
      { pickup: pickup(25.05, 121.52), createdAt: "2026-10-01T00:00:00Z" },
      { pickup: pickup(24.99, 121.3), createdAt: "2026-10-20T00:00:00Z" },
      { pickup: pickup(24.8, 121.0), createdAt: "2026-09-20T00:00:00Z" },
    ]);
    expect(places).toHaveLength(3);
    expect(places[0]).toMatchObject({
      tripCount: 3,
      label: "家",
      lastUsedAt: "2026-11-05T00:00:00.000Z",
    });
    expect(places.map((place) => place.tripCount)).toEqual([3, 1, 1]);
    // Same count: the more recent place first.
    expect(places[1]!.address.lat).toBe(25.033);
  });

  it("skips sensitive, pinless and malformed pickups", () => {
    expect(
      aggregateFrequentPlaces([
        {
          pickup: pickup(25.05, 121.52, { sensitive: true }),
          createdAt: "2026-11-01T00:00:00Z",
        },
        { pickup: { address: "沒有座標" }, createdAt: "2026-11-01T00:00:00Z" },
        { pickup: null, createdAt: "2026-11-01T00:00:00Z" },
        { pickup: pickup(25.05, 121.52), createdAt: "not a date" },
      ]),
    ).toEqual([]);
  });
});

describe("rankByFrequentPlaces", () => {
  const places = aggregateFrequentPlaces([
    {
      pickup: pickup(25.05, 121.52, { placeId: "home" }),
      createdAt: "2026-11-01T00:00:00Z",
    },
  ]);

  it("moves a provider candidate at a frequent place to the front, adding nothing", () => {
    const candidates = [
      { candidateId: "a", location: { lat: 25.1, lng: 121.6 } },
      { candidateId: "b", location: { lat: 25.0501, lng: 121.5201 } },
      { candidateId: "c", placeId: "home" },
    ];
    expect(
      rankByFrequentPlaces(candidates, places).map((c) => c.candidateId),
    ).toEqual(["b", "c", "a"]);
    expect(
      rankByFrequentPlaces(candidates, []).map((c) => c.candidateId),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("CallcenterFrequentPlacesService", () => {
  it("queries every spelling of the number over the last year", async () => {
    const repository = {
      findRecentPickupsByPhone: vi.fn(async () => [
        { pickup: pickup(25.05, 121.52), createdAt: "2026-11-01T00:00:00Z" },
      ]),
    };
    const service = new CallcenterFrequentPlacesService(repository as never);
    const places = await service.forPhone(
      "+886912345678",
      new Date("2026-11-11T00:00:00Z"),
    );
    expect(places).toHaveLength(1);
    const [variants, statuses, since] = repository.findRecentPickupsByPhone.mock
      .calls[0] as unknown as [string[], string[], Date];
    expect(variants).toEqual(
      expect.arrayContaining(["0912345678", "+886912345678"]),
    );
    expect(statuses).toContain("completed");
    expect(statuses).not.toContain("cancelled");
    expect(since.toISOString()).toBe("2025-11-11T00:00:00.000Z");
  });

  it("does not look up hidden numbers and degrades to no suggestions", async () => {
    const repository = {
      findRecentPickupsByPhone: vi.fn(async () => {
        throw new Error("db down");
      }),
    };
    const service = new CallcenterFrequentPlacesService(repository as never);
    expect(await service.forPhone("anonymous")).toEqual([]);
    expect(repository.findRecentPickupsByPhone).not.toHaveBeenCalled();
    expect(await service.forPhoneBestEffort("0912345678")).toEqual([]);
  });
});

describe("frequent places route", () => {
  it("uses the call's caller ID after the call's read authorization", async () => {
    const callcenterService = {
      getCallSessionForRead: vi.fn(async () => ({ callerPhone: "0912345678" })),
    };
    const frequentPlaces = {
      forPhoneBestEffort: vi.fn(async () => [{ label: "家" }]),
    };
    const controller = new CallcenterController(
      callcenterService as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      frequentPlaces as never,
    );
    const result = await controller.getFrequentPlaces("call-1", null);
    expect(callcenterService.getCallSessionForRead).toHaveBeenCalledWith(
      "call-1",
      undefined,
      null,
    );
    expect(frequentPlaces.forPhoneBestEffort).toHaveBeenCalledWith(
      "0912345678",
    );
    expect(result.data.items).toEqual([{ label: "家" }]);
  });
});

describe("AI address resolution with the caller's frequent pickups", () => {
  it("offers the provider candidate at a known pickup first", async () => {
    const geo = {
      health: () => ({
        status: "healthy",
        failClosed: false,
        mode: "external",
      }),
      search: vi.fn(async () => ({
        degraded: false,
        candidates: [
          {
            candidateId: "far",
            displayName: "中山路一段",
            address: "中山路一段",
            location: { lat: 25.1, lng: 121.6 },
          },
          {
            candidateId: "home",
            displayName: "中山路二段",
            address: "中山路二段",
            location: { lat: 25.05, lng: 121.52 },
          },
        ],
      })),
    };
    const hints: FrequentPickupPlace[] = aggregateFrequentPlaces([
      { pickup: pickup(25.05, 121.52), createdAt: "2026-11-01T00:00:00Z" },
    ]);
    const pickupHints = vi.fn(async () => hints);
    const ports = new VoiceDomainToolPorts(
      { execute: vi.fn() } as never,
      geo as never,
      undefined,
      undefined,
      pickupHints,
    );
    const result = (await ports.execute(
      { name: "resolve_location", args: { query: "中山路" } },
      {
        claims: { voiceSessionId: "vs-1" } as never,
        inputEpoch: 1,
        boundOrderId: null,
        signal: new AbortController().signal,
      },
    )) as { candidates: Array<{ placeId: string; label: string }> };
    expect(pickupHints).toHaveBeenCalledWith("vs-1");
    expect(result.candidates.map((c) => c.placeId)).toEqual(["home", "far"]);
  });

  it("still resolves when the hint lookup fails", async () => {
    const geo = {
      health: () => ({
        status: "healthy",
        failClosed: false,
        mode: "external",
      }),
      search: vi.fn(async () => ({
        degraded: false,
        candidates: [
          { candidateId: "x", displayName: "台北車站", address: "台北車站" },
        ],
      })),
    };
    const ports = new VoiceDomainToolPorts(
      { execute: vi.fn() } as never,
      geo as never,
      undefined,
      undefined,
      async () => {
        throw new Error("no db");
      },
    );
    const result = (await ports.execute(
      { name: "resolve_location", args: { query: "台北車站" } },
      {
        claims: { voiceSessionId: "vs-1" } as never,
        inputEpoch: 1,
        boundOrderId: null,
        signal: new AbortController().signal,
      },
    )) as { candidates: unknown[] };
    expect(result.candidates).toHaveLength(1);
  });
});

describe("press 0 for a human", () => {
  const session = {
    voiceSessionId: "vs-0",
    sessionVersion: 7,
    leaseEpoch: 3,
    controlOwner: "ai",
    dialogState: "collecting",
  } as VoiceSessionRecord;

  it("recognises only the 0 key", () => {
    expect(isHumanHandoffKeypress("dtmf", { digit: "0" })).toBe(true);
    expect(isHumanHandoffKeypress("dtmf.received", { digit: "0" })).toBe(true);
    expect(isHumanHandoffKeypress("dtmf", { digit: "1" })).toBe(false);
    expect(isHumanHandoffKeypress("speech.started", { digit: "0" })).toBe(
      false,
    );
    expect(isHumanHandoffKeypress("dtmf", null)).toBe(false);
  });

  it("transfers only calls the AI still owns", () => {
    expect(shouldHandOffOnKeypress(session)).toBe(true);
    expect(shouldHandOffOnKeypress({ ...session, controlOwner: "human" })).toBe(
      false,
    );
    expect(shouldHandOffOnKeypress({ ...session, dialogState: "closed" })).toBe(
      false,
    );
  });

  it("hands off with the session that recorded the key press", async () => {
    const port = { initiateHandoff: vi.fn(async () => ({})) };
    await expect(handOffOnKeypress(port, session, vi.fn())).resolves.toBe(true);
    expect(port.initiateHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceSessionId: "vs-0",
        expectedSessionVersion: 7,
        expectedLeaseEpoch: 3,
        reason: "customer_requested",
      }),
    );
  });

  it("retries once against a fresh session after a concurrent change", async () => {
    const port = {
      initiateHandoff: vi
        .fn()
        .mockRejectedValueOnce(new Error("VOICE_DRAFT_STALE"))
        .mockResolvedValueOnce({}),
    };
    const reload = vi.fn(async () => ({ ...session, sessionVersion: 8 }));
    await expect(handOffOnKeypress(port, session, reload)).resolves.toBe(true);
    expect(port.initiateHandoff).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedSessionVersion: 8 }),
    );
  });

  it("reports but never throws when the transfer cannot be made", async () => {
    const onError = vi.fn();
    const port = {
      initiateHandoff: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    await expect(
      handOffOnKeypress(port, session, async () => session, onError),
    ).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    // A human already took the call between the key press and the retry.
    const taken = vi.fn(async () => ({
      ...session,
      controlOwner: "human" as const,
    }));
    const port2 = {
      initiateHandoff: vi.fn().mockRejectedValueOnce(new Error("stale")),
    };
    await expect(handOffOnKeypress(port2, session, taken)).resolves.toBe(false);
    expect(port2.initiateHandoff).toHaveBeenCalledTimes(1);
  });
});
