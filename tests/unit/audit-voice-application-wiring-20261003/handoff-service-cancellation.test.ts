import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceCapabilityTokenClaims, VoiceDialogueOutput } from "@drts/contracts";
import type { VoiceSessionRecord } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { VoiceHandoffService } from "../../../apps/api/src/modules/voice-booking/voice-handoff.service";
import { VoiceHandoffOnlyToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-handoff-tool-ports";
import { VoiceToolGatewayService } from "../../../apps/api/src/modules/voice-booking/voice-tool-gateway.service";
import { VoiceHandoffQueueService } from "../../../apps/api/src/modules/callcenter/voice-handoff-queue.service";

// R7: real gateway -> port -> service -> queue. Only authentication and repository
// I/O are doubled; service/port spies observe calls without replacing their logic.
// These are socket-free control-flow tests, not PostgreSQL transaction evidence.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function harness(hold: "read" | "committed" | "none" = "none") {
  let row: VoiceSessionRecord = {
    voiceSessionId: "11111111-1111-4111-8111-111111111111",
    resourceScopeId: "22222222-2222-4222-8222-222222222222",
    callId: "r7-call", providerAccountId: "test-account", providerCallId: "test-call",
    lineBindingId: "line", routeProfileId: "route", routeProfileVersion: 1,
    dialogState: "collecting", mediaState: "active", controlOwner: "ai",
    leaseEpoch: 2, sessionVersion: 4, commitStatus: "none", recordingState: "capturing",
    confirmationState: "none", outcome: null, inputEpoch: 1, pendingInput: false,
    lastResolvedInputEpoch: 1, lastAppliedControlSequence: 1,
    createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z",
  };
  const entered = deferred();
  const release = deferred();
  const controller = new AbortController();
  const repository = {
    findSessionById: vi.fn(async () => {
      if (hold === "read") { entered.resolve(); await release.promise; }
      return { ...row };
    }),
    casUpdateSessionControl: vi.fn(async (id: string, version: number, patch: Partial<VoiceSessionRecord>) => {
      if (id !== row.voiceSessionId || version !== row.sessionVersion) return null;
      row = { ...row, ...patch, sessionVersion: version + 1 };
      if (hold === "committed") { entered.resolve(); await release.promise; }
      return { ...row };
    }),
    findPendingReceiptsForSession: vi.fn(async () => []),
  };
  const booking = {
    findSessionById: vi.fn(async () => ({ ...row })),
    findResourceScopeById: vi.fn(async () => ({ resourceScopeId: row.resourceScopeId, status: "active" })),
    findActiveConfirmation: vi.fn(async () => null),
  };
  const claims: VoiceCapabilityTokenClaims = {
    iss: "drts_voice_capability_issuer", aud: "voice-tool-gateway",
    exp: Math.floor(Date.now() / 1000) + 60, servicePrincipalId: "test-worker",
    voiceSessionId: row.voiceSessionId, resourceScopeId: row.resourceScopeId,
    routeProfileVersion: row.routeProfileVersion, leaseEpoch: row.leaseEpoch,
    scopes: ["session_execute", "handoff_request"],
  };
  const guard = { authenticate: vi.fn(async () => claims) };
  const queue = new VoiceHandoffQueueService();
  const service = new VoiceHandoffService(
    repository as never, new VoiceSessionService(repository as never), booking as never, queue,
  );
  const serviceCall = vi.spyOn(service, "initiateHandoff");
  const ports = new VoiceHandoffOnlyToolPorts(booking as never, service);
  const gateway = new VoiceToolGatewayService(guard as never, booking as never, {} as never, ports, {
    headers: {}, inputEpoch: 1, deadline: Date.now() + 1500, signal: controller.signal,
  });
  return {
    gateway, queue, repository, serviceCall, controller, entered, release,
    row: () => ({ ...row }), mutate: (patch: Partial<VoiceSessionRecord>) => { row = { ...row, ...patch }; },
  };
}

const output = {
  intent: "human", text: "", slots: [], tools: [], terminal: "handoff",
  usage: { inputTokens: null, outputTokens: null },
} satisfies VoiceDialogueOutput;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("R7 actual handoff service mutation boundary", () => {
  it("healthy admitted turn transfers once and queues the real result", async () => {
    const h = harness();
    const result = await h.gateway.execute(output);
    expect(result).toEqual([{ status: "queued", handoffId: expect.any(String) }]);
    expect(h.repository.casUpdateSessionControl).toHaveBeenCalledTimes(1);
    expect(h.row()).toMatchObject({ controlOwner: "coordinator", leaseEpoch: 3, sessionVersion: 5 });
    expect(h.queue.listQueuedItems()).toHaveLength(1);
  });

  it("pre-aborted turn starts no service read or mutation", async () => {
    const h = harness(); h.controller.abort();
    await expect(h.gateway.execute(output)).rejects.toThrow("voice_aborted");
    expect(h.repository.findSessionById).not.toHaveBeenCalled();
    expect(h.repository.casUpdateSessionControl).not.toHaveBeenCalled();
    expect(h.queue.listQueuedItems()).toEqual([]);
  });

  it.each(["caller", "deadline"] as const)("%s abort during the INNER service read cannot initiate a later CAS", async (kind) => {
    vi.useFakeTimers();
    const h = harness("read");
    const result = h.gateway.execute(output);
    const rejected = expect(result).rejects.toThrow("voice_aborted");
    await h.entered.promise;
    if (kind === "caller") h.controller.abort();
    else await vi.advanceTimersByTimeAsync(1501);
    await rejected;
    const settled = h.serviceCall.mock.results[0]!.value as Promise<unknown>;
    h.release.resolve();
    await expect(settled).rejects.toBeDefined();
    expect(h.repository.casUpdateSessionControl).not.toHaveBeenCalled();
    expect(h.queue.listQueuedItems()).toEqual([]);
    expect(h.row()).toMatchObject({ controlOwner: "ai", leaseEpoch: 2, sessionVersion: 4 });
  });

  it.each([
    { inputEpoch: 2 }, { resourceScopeId: "foreign-scope" }, { routeProfileVersion: 99 },
    { controlOwner: "coordinator" }, { dialogState: "closed" },
    { leaseEpoch: 3 }, { sessionVersion: 5 },
  ] satisfies Partial<VoiceSessionRecord>[])("rechecks admitted authority after the inner read: %j", async (changed) => {
    const h = harness("read");
    const result = h.gateway.execute(output);
    const rejected = expect(result).rejects.toBeDefined();
    await h.entered.promise;
    h.mutate(changed); h.release.resolve();
    await rejected;
    expect(h.repository.casUpdateSessionControl).not.toHaveBeenCalled();
    expect(h.queue.listQueuedItems()).toEqual([]);
  });

  it("does not pretend cancellation rolls back a CAS already accepted by storage", async () => {
    const h = harness("committed");
    const result = h.gateway.execute(output);
    const rejected = expect(result).rejects.toThrow("voice_aborted");
    await h.entered.promise;
    expect(h.row().sessionVersion).toBe(5);
    h.controller.abort(); await rejected;
    const settled = h.serviceCall.mock.results[0]!.value as Promise<unknown>;
    h.release.resolve();
    await expect(settled).resolves.toMatchObject({ session: { sessionVersion: 5 }, queueItem: { status: "queued" } });
    expect(h.repository.casUpdateSessionControl).toHaveBeenCalledTimes(1);
    expect(h.queue.listQueuedItems()).toHaveLength(1);
  });
});
