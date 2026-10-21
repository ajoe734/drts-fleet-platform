import { expect, it } from "vitest";
import { resolve } from "node:path";
import {
  VoiceMediaWorkerSession as CurrentSession,
  type VoiceMediaWorkerEvent,
} from "../../../apps/voice-media-worker/src/media-session";
import {
  SandboxSpeechToTextAdapter,
  SandboxTextToSpeechAdapter,
} from "../../../apps/voice-media-worker/src/media-provider";
import { sourceModuleLoader } from "./source-module-loader";
const Session = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, ["apps/voice-media-worker/src/media-session.ts"])<{
      VoiceMediaWorkerSession: typeof CurrentSession;
    }>(resolve("apps/voice-media-worker/src/media-session.ts"))
      .VoiceMediaWorkerSession
  : CurrentSession;
it("F1: actual media registration consumes the server readback identity and still fences cancellation/late completion", async () => {
  const events: VoiceMediaWorkerEvent[] = [];
  const session = new Session({
    sessionId: "session",
    asrAdapter: new SandboxSpeechToTextAdapter(),
    ttsAdapter: new SandboxTextToSpeechAdapter(),
    eventSink: (event) => events.push(event),
  });
  const abort = new AbortController();
  const handle = await session.startPlayback(
    "確認原地址與聯絡人",
    "cmn-TW",
    new Date().toISOString(),
    () => !abort.signal.aborted,
    abort.signal,
    "server-readback-id",
  );
  expect(handle.playbackId).toBe("server-readback-id");
  expect(events[0]).toMatchObject({
    type: "tts.playback.started",
    payload: { playbackId: "server-readback-id" },
  });
  abort.abort();
  expect(
    session.completePlayback(handle.playbackId, new Date().toISOString()),
  ).toBe(false);
  await expect(
    session.startPlayback(
      "再次朗讀",
      "cmn-TW",
      new Date().toISOString(),
      undefined,
      undefined,
      "server-readback-id",
    ),
  ).rejects.toThrow("voice_playback_identity_reused");
});
