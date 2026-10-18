import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ApiClient } from "../../../packages/api-client/src/index";
import { VoiceCallbackController } from "../../../apps/api/src/modules/voice-booking/voice-callback.controller";
import type { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import type { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import {
  newVoiceCallbackIntent,
  readVoiceCallbackIntent,
} from "../../../apps/ops-console-web/app/callcenter/voice-callbacks/intent";

afterEach(() => vi.unstubAllGlobals());

describe("callback workbench request recovery without a server", () => {
  it("preserves the original task, version, payload and key across browser reload and retries", async () => {
    const taskId = randomUUID();
    const body = {
      expectedVersion: 3,
      outcome: "no_answer" as const,
      notes: "SIM original observation",
    };
    const intent = newVoiceCallbackIntent(taskId, "attempt", body);
    body.notes = "changed form value";
    const restored = readVoiceCallbackIntent(JSON.stringify(intent))!;
    expect(restored.body.notes).toBe("SIM original observation");
    const requests: { url: string; init?: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (requests.length === 1) throw new Error("SIM dropped response");
        return new Response(
          JSON.stringify({
            data: {
              replayed: true,
              receipt: { command_id: "original-command" },
            },
          }),
        );
      }),
    );
    const client = new ApiClient({ baseUrl: "https://api.example.test" });
    const send = () =>
      client.executeVoiceCallbackCommand(
        restored.taskId,
        restored.action,
        restored.body,
        restored.idempotencyKey,
      );
    await expect(send()).rejects.toThrow();
    expect(await send()).toMatchObject({
      replayed: true,
      receipt: { commandId: "original-command" },
    });
    expect(requests[0]!.url).toBe(
      `https://api.example.test/api/voice/callbacks/${taskId}/attempts`,
    );
    expect(requests[0]!.init!.body).toBe(requests[1]!.init!.body);
    expect(new Headers(requests[0]!.init!.headers).get("Idempotency-Key")).toBe(
      new Headers(requests[1]!.init!.headers).get("Idempotency-Key"),
    );
  });

  it("reads only the chosen scope and status, and unwraps a real list envelope", async () => {
    const scope = randomUUID();
    const session = randomUUID();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              items: [{ task_id: "original-task", resource_scope_id: scope }],
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(
      await new ApiClient({
        baseUrl: "https://api.example.test",
      }).listVoiceCallbackTasks({
        resourceScopeId: scope,
        voiceSessionId: session,
        status: "cancelled",
      }),
    ).toEqual([{ taskId: "original-task", resourceScopeId: scope }]);
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get("resourceScopeId")).toBe(scope);
    expect(url.searchParams.get("voiceSessionId")).toBe(session);
    expect(url.searchParams.get("status")).toBe("cancelled");
  });

  it("takes the create scope from the original session and binds the receipt to session and supplied key", async () => {
    const create = vi.fn(async () => ({ task: null, receipt: null }));
    const scope = randomUUID();
    const sessionId = randomUUID();
    const controller = new VoiceCallbackController(
      { createCallbackDurable: create } as unknown as VoiceCallbackService,
      {
        findSessionById: vi.fn(async () => ({ resourceScopeId: scope })),
      } as unknown as VoiceSessionRepository,
    );
    const input = {
      contactPhoneEncrypted: "SIM-cipher",
      contactPhoneLookupToken: "SIM-lookup",
      consentSnapshotHash: "SIM-consent",
    };
    await controller.create(sessionId, input, "original-action");
    expect(create).toHaveBeenCalledWith({
      ...input,
      resourceScopeId: scope,
      voiceSessionId: sessionId,
      actionKey: `${sessionId}:create_callback:original-action`,
    });
    await expect(
      controller.create(
        sessionId,
        { ...input, resourceScopeId: randomUUID() },
        "different-key",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("writes the current operator identity and original expected version rather than accepting an operator from a form", async () => {
    const write = vi.fn(async () => ({ replayed: false }));
    const controller = new VoiceCallbackController(
      { executeTaskCommandForWrite: write } as unknown as VoiceCallbackService,
      {} as VoiceSessionRepository,
    );
    const identity = {
      actorId: "SIM-current-operator",
    } as BootstrapRequestIdentity;
    const taskId = randomUUID();
    await controller.claim(
      taskId,
      { expectedVersion: 4 },
      identity,
      "original-action",
    );
    expect(write).toHaveBeenCalledWith({
      taskId,
      expectedVersion: 4,
      action: "claim",
      operatorId: "SIM-current-operator",
      idempotencyKey: "original-action",
    });
    await expect(
      controller.claim(
        taskId,
        { expectedVersion: 4, operatorId: "different-operator" },
        identity,
        "changed-action",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("requires a valid task version and original action key before a write", async () => {
    const write = vi.fn();
    const controller = new VoiceCallbackController(
      { executeTaskCommandForWrite: write } as unknown as VoiceCallbackService,
      {} as VoiceSessionRepository,
    );
    const identity = {
      actorId: "SIM-current-operator",
    } as BootstrapRequestIdentity;
    await expect(
      controller.claim(
        randomUUID(),
        { expectedVersion: 0 },
        identity,
        "action",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      controller.claim(randomUUID(), { expectedVersion: 1 }, identity),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(write).not.toHaveBeenCalled();
    expect(readVoiceCallbackIntent("not valid JSON")).toBeNull();
    expect(
      readVoiceCallbackIntent(
        '{"taskId":"x","action":"attempt","idempotencyKey":"k"}',
      ),
    ).toBeNull();
  });
});
