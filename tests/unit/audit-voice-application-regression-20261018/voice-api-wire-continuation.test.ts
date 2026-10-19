import { expect, it } from "vitest";
import { resolve } from "node:path";
import { VoiceApiClient as CurrentClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { sourceModuleLoader } from "./source-module-loader";
const Client = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/voice-media-worker/src/server/voice-api-client.ts",
    ])<{ VoiceApiClient: typeof CurrentClient }>(
      resolve("apps/voice-media-worker/src/server/voice-api-client.ts"),
    ).VoiceApiClient
  : CurrentClient;
it("F1/F2 actual API wire casing restores complete recording event scope/closure, preserving opaque ids and nested metadata", async () => {
  const event = {
    kind: "closure",
    eventKey: "closure",
    scope: {
      brandId: "SIM_brand",
      callId: "call_original",
      recordingId: "rec_original",
      legId: "leg_original",
    },
    payload: {
      endMs: 1000,
      endedAt: new Date().toISOString(),
      closedEventId: "closed_event_original",
      checkpointRefs: [
        {
          objectKey: "SIM/original_manifest",
          objectVersion: "version_original",
          checksum: "a".repeat(64),
          byteLength: 128,
          durableAt: new Date().toISOString(),
        },
      ],
    },
  };
  const controller = new VoiceBookingController(
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    undefined,
    { readRecordingContinuation: async () => [event] } as never,
  );
  const client = new Client(
    {
      baseUrl: "https://api.example.test",
      fetchImpl: async () =>
        Response.json(
          deepToSnakeCase(await controller.getRecordingEvents("session")),
        ),
    },
    { getToken: async () => "SIM-identity" },
  );
  expect((await client.getRecordingEvents("session")).events).toEqual([event]);
});
