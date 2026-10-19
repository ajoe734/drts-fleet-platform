import { expect, it } from "vitest";
import { resolve } from "node:path";
import { VoiceSessionService as CurrentService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import type { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { sourceModuleLoader } from "./source-module-loader";
const Service = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-session.service.ts",
    ])<{ VoiceSessionService: typeof CurrentService }>(
      resolve("apps/api/src/modules/voice-booking/voice-session.service.ts"),
    ).VoiceSessionService
  : CurrentService;
it.each(["capturing", "finalized"])(
  "F2 authoritative recording completion survives a later control close (previous=%s)",
  async (recordingState) => {
    const session = {
      voiceSessionId: "session",
      callId: "call",
      providerAccountId: "provider",
      resourceScopeId: "scope",
      controlOwner: "ai",
      sessionVersion: 5,
      leaseEpoch: 1,
      inputEpoch: 1,
      lastAppliedControlSequence: 3,
      dialogState: "collecting",
      recordingState,
      createdAt: new Date().toISOString(),
    };
    const statements: string[] = [];
    const tx = {
      query: async (sql: string) => {
        statements.push(sql);
        return {
          rows: sql.includes("scope.brand_id")
            ? [{ call_id: "call", brand_id: "brand", bound_order_id: null }]
            : [],
          rowCount: 1,
        };
      },
    };
    const repository = {
      withTransaction: async (
        work: (executor: typeof tx) => Promise<unknown>,
      ) => work(tx),
      findSessionById: async () => session,
      casUpdateSessionControl: async (
        _id: string,
        _version: number,
        patch: object,
      ) => ({ ...session, ...patch, sessionVersion: 6 }),
    } as unknown as VoiceSessionRepository;
    const closed = await new Service(repository).closeSession("session", 5);
    expect(closed.dialogState).toBe("closed");
    expect(closed.recordingState).toBe(
      recordingState === "finalized" ? "finalized" : "finalizing",
    );
    expect(
      statements.filter((sql) =>
        sql.includes("INSERT INTO voice.session_event"),
      ),
    ).toHaveLength(1);
    expect(
      statements.filter((sql) => sql.includes("INSERT INTO voice.work_item")),
    ).toHaveLength(1);
  },
);
