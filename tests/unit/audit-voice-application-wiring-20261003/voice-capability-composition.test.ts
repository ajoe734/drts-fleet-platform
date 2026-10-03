import { describe, expect, it, vi } from "vitest";
import type {
  VoiceCapabilityTokenClaims,
  VoiceCapabilityTokenEnvelope,
} from "@drts/contracts";

import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { VoiceBookingAuthorizationService } from "../../../apps/api/src/modules/voice-booking/voice-booking-authorization.service";
import type { VoiceCapabilityGuard } from "../../../apps/api/src/common/auth/voice-capability.guard";
import type { VoiceCapabilityService } from "../../../apps/api/src/common/auth/voice-capability.service";
import type { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import type {
  VoiceBookingRepository,
  VoiceSessionRecord,
} from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceHandoffService } from "../../../apps/api/src/modules/voice-booking/voice-handoff.service";
import { VoiceHandoffOnlyToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-handoff-tool-ports";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 (Codex reopen round 5/6):
 * previously `VoiceCapabilityService.issue` had no production call site,
 * `voice-booking.controller.ts` exposed no route guarded by
 * `VoiceCapabilityGuard`, and `VoiceToolGatewayService.execute` was an
 * unconsumed interface. This file exercises the real, newly-wired
 * composition end to end -- only the DB-backed repository/session/handoff
 * services (the genuine external boundary this unit test is scoped to) are
 * doubled; `VoiceBookingController`, `VoiceBookingAuthorizationService`,
 * `VoiceToolGatewayService`, and `VoiceHandoffOnlyToolPorts` all run for
 * real.
 */

function session(overrides: Partial<VoiceSessionRecord> = {}): VoiceSessionRecord {
  return {
    voiceSessionId: "22222222-2222-2222-2222-222222222222",
    callId: "call-1",
    providerAccountId: "acct-1",
    providerCallId: "provider-call-1",
    resourceScopeId: "33333333-3333-3333-3333-333333333333",
    lineBindingId: "line-1",
    routeProfileId: "profile-1",
    routeProfileVersion: 1,
    dialogState: "collecting",
    mediaState: "active",
    controlOwner: "ai",
    leaseEpoch: 1,
    sessionVersion: 5,
    commitStatus: "none",
    recordingState: "active",
    confirmationState: "none",
    outcome: null,
    inputEpoch: 2,
    pendingInput: true,
    lastResolvedInputEpoch: 1,
    lastAppliedControlSequence: 10,
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    ...overrides,
  };
}

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
    scopes: ["session_execute", "handoff_request"],
    ...overrides,
  };
}

function buildController(opts: {
  guardAuthenticate: ReturnType<typeof vi.fn>;
  issue?: ReturnType<typeof vi.fn>;
  resolveInput?: ReturnType<typeof vi.fn>;
  findSessionById?: ReturnType<typeof vi.fn>;
  initiateHandoff?: ReturnType<typeof vi.fn>;
}) {
  const guard = { authenticate: opts.guardAuthenticate } as unknown as VoiceCapabilityGuard;
  const capabilityService = {
    issue: opts.issue ?? vi.fn(),
  } as unknown as VoiceCapabilityService;
  const sessionService = {
    resolveInput: opts.resolveInput ?? vi.fn(),
  } as unknown as VoiceSessionService;
  const repository = {
    findSessionById: opts.findSessionById ?? vi.fn(async () => session()),
    findResourceScopeById: vi.fn(async () => ({ status: "active" })),
  } as unknown as VoiceBookingRepository;
  const authorization = new VoiceBookingAuthorizationService(repository);
  const handoffService = {
    initiateHandoff:
      opts.initiateHandoff ??
      vi.fn(async () => ({
        session: session(),
        handoffId: "handoff-1",
        summary: {} as unknown,
        queueItem: { status: "queued" },
        coordinatorClaims: {
          voiceSessionId: session().voiceSessionId,
          resourceScopeId: session().resourceScopeId,
          leaseEpoch: 2,
          scopes: [],
        },
      })),
  } as unknown as VoiceHandoffService;

  const controller = new VoiceBookingController(
    { deriveCohortFromDurableEvidence: vi.fn() } as never,
    { listUsageRecords: vi.fn(), listRateCards: vi.fn(), reconcileInvoice: vi.fn() } as never,
    undefined,
    capabilityService,
    guard,
    sessionService,
    repository,
    authorization,
    handoffService,
  );
  return { controller, repository, guard, capabilityService, sessionService, handoffService };
}

describe("VoiceBookingController.issueCapability (SD §4.2 stage 2 issuance route)", () => {
  it("forwards the authenticated identity and body to VoiceCapabilityService.issue", () => {
    const envelope = {
      token: "jwt",
      tokenType: "Bearer",
      expiresIn: 120,
      claims: claims(),
    } as VoiceCapabilityTokenEnvelope;
    const issue = vi.fn(() => envelope);
    const { controller } = buildController({ guardAuthenticate: vi.fn(), issue });

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "system" as const,
      actorId: "svc-1",
      realm: "system" as const,
      tenantId: null,
      scopes: ["voice:capability:issue"],
      roles: [],
      roleFamilies: [],
      requestId: null,
    };

    const result = controller.issueCapability(identity, {
      voiceSessionId: session().voiceSessionId,
      resourceScopeId: session().resourceScopeId,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute", "handoff_request"],
    });

    expect(issue).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        voiceSessionId: session().voiceSessionId,
        scopes: ["session_execute", "handoff_request"],
      }),
    );
    expect(result.data).toEqual(envelope);
  });

  it("rejects an unknown scope value before ever reaching VoiceCapabilityService", () => {
    const issue = vi.fn();
    const { controller } = buildController({ guardAuthenticate: vi.fn(), issue });

    expect(() =>
      controller.issueCapability(null, {
        voiceSessionId: session().voiceSessionId,
        resourceScopeId: session().resourceScopeId,
        routeProfileVersion: 1,
        leaseEpoch: 1,
        scopes: ["not_a_real_scope" as never],
      }),
    ).toThrow();
    expect(issue).not.toHaveBeenCalled();
  });
});

describe("VoiceBookingController.resolveInput (backs VoiceDialoguePersistPort trusted mode)", () => {
  it("rejects when the capability's bound session does not match the path", async () => {
    const guardAuthenticate = vi.fn(async () =>
      claims({ voiceSessionId: "99999999-9999-9999-9999-999999999999" }),
    );
    const { controller } = buildController({ guardAuthenticate });

    await expect(
      controller.resolveInput(
        session().voiceSessionId,
        { authorization: "Bearer token" },
        { expectedSessionVersion: 5, inputEpoch: 2, resolution: "relevant" },
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("rejects when the capability lacks session_execute scope", async () => {
    const guardAuthenticate = vi.fn(async () => claims({ scopes: ["handoff_request"] }));
    const { controller } = buildController({ guardAuthenticate });

    await expect(
      controller.resolveInput(
        session().voiceSessionId,
        { authorization: "Bearer token" },
        { expectedSessionVersion: 5, inputEpoch: 2, resolution: "relevant" },
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("calls VoiceSessionService.resolveInput with the capability-bound session id and the caller's CAS fields", async () => {
    const guardAuthenticate = vi.fn(async () => claims());
    const resolveInput = vi.fn(async () => session({ inputEpoch: 2, pendingInput: false }));
    const { controller } = buildController({ guardAuthenticate, resolveInput });

    const result = await controller.resolveInput(
      session().voiceSessionId,
      { authorization: "Bearer token" },
      { expectedSessionVersion: 5, inputEpoch: 2, resolution: "irrelevant" },
    );

    expect(resolveInput).toHaveBeenCalledWith(
      session().voiceSessionId,
      5,
      2,
      "irrelevant",
    );
    expect((result.data as { session: VoiceSessionRecord }).session.pendingInput).toBe(
      false,
    );
  });

  it("propagates VOICE_DRAFT_STALE when the session service rejects a stale CAS value, never silently succeeding", async () => {
    const guardAuthenticate = vi.fn(async () => claims());
    const resolveInput = vi.fn(async () => {
      throw new ApiRequestError(409, "VOICE_DRAFT_STALE", "stale");
    });
    const { controller } = buildController({ guardAuthenticate, resolveInput });

    await expect(
      controller.resolveInput(
        session().voiceSessionId,
        { authorization: "Bearer token" },
        { expectedSessionVersion: 1, inputEpoch: 2, resolution: "relevant" },
      ),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });
});

describe("VoiceBookingController.requestHandoff (backs VoiceToolGatewayService.execute)", () => {
  const output = {
    intent: "unknown" as const,
    text: "",
    terminal: "handoff" as const,
    slots: [],
    tools: [{ name: "request_handoff" as const, args: { reason: "customer_requested" as const } }],
    usage: { inputTokens: null, outputTokens: null },
  };

  it("initiates a real handoff through VoiceHandoffService and maps a queued outcome", async () => {
    const guardAuthenticate = vi.fn(async () => claims());
    const initiateHandoff = vi.fn(async () => ({
      session: session(),
      handoffId: "handoff-1",
      summary: {} as unknown,
      queueItem: { status: "queued" },
      coordinatorClaims: {
        voiceSessionId: session().voiceSessionId,
        resourceScopeId: session().resourceScopeId,
        leaseEpoch: 2,
        scopes: [],
      },
    }));
    const { controller } = buildController({ guardAuthenticate, initiateHandoff });

    const result = await controller.requestHandoff(
      session().voiceSessionId,
      { authorization: "Bearer token" },
      { inputEpoch: 2, output },
    );

    expect(initiateHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceSessionId: session().voiceSessionId,
        expectedSessionVersion: session().sessionVersion,
        expectedLeaseEpoch: claims().leaseEpoch,
        reason: "customer_requested",
      }),
    );
    expect(result.data).toEqual({
      results: [{ status: "queued", handoffId: "handoff-1" }],
    });
  });

  it("rejects when the capability is bound to a different session than the path", async () => {
    const guardAuthenticate = vi.fn(async () =>
      claims({ voiceSessionId: "99999999-9999-9999-9999-999999999999" }),
    );
    const { controller } = buildController({ guardAuthenticate });

    await expect(
      controller.requestHandoff(
        session().voiceSessionId,
        { authorization: "Bearer token" },
        { inputEpoch: 2, output },
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("VoiceHandoffOnlyToolPorts", () => {
  it("fails closed (never fabricates a result) for any tool other than request_handoff", async () => {
    const repository = {
      findSessionById: vi.fn(async () => session()),
    } as unknown as VoiceBookingRepository;
    const handoffService = { initiateHandoff: vi.fn() } as unknown as VoiceHandoffService;
    const ports = new VoiceHandoffOnlyToolPorts(repository, handoffService);

    await expect(
      ports.execute(
        { name: "resolve_location", args: { rawText: "x" } } as never,
        { claims: claims() } as never,
      ),
    ).rejects.toMatchObject({ code: "VOICE_TOOL_NOT_IMPLEMENTED" });
    expect(handoffService.initiateHandoff).not.toHaveBeenCalled();
  });

  it("maps every HandoffQueueStatus to the request_handoff result schema's three-value enum", async () => {
    const repository = {
      findSessionById: vi.fn(async () => session()),
    } as unknown as VoiceBookingRepository;
    const cases: Array<[string, "queued" | "connected" | "unavailable"]> = [
      ["queued", "queued"],
      ["assigned", "queued"],
      ["bridging", "queued"],
      ["connected", "connected"],
      ["unanswered", "unavailable"],
      ["caller_dropped", "unavailable"],
      ["agent_dropped", "unavailable"],
      ["failed", "unavailable"],
    ];
    for (const [status, expected] of cases) {
      const handoffService = {
        initiateHandoff: vi.fn(async () => ({
          handoffId: "h-1",
          queueItem: { status },
        })),
      } as unknown as VoiceHandoffService;
      const ports = new VoiceHandoffOnlyToolPorts(repository, handoffService);
      const result = await ports.execute(
        { name: "request_handoff", args: { reason: "customer_requested" } } as never,
        { claims: claims() } as never,
      );
      expect(result).toEqual({ status: expected, handoffId: "h-1" });
    }
  });

  it("rejects when the session no longer exists, never calling initiateHandoff with a stale/forged version", async () => {
    const repository = {
      findSessionById: vi.fn(async () => null),
    } as unknown as VoiceBookingRepository;
    const handoffService = { initiateHandoff: vi.fn() } as unknown as VoiceHandoffService;
    const ports = new VoiceHandoffOnlyToolPorts(repository, handoffService);

    await expect(
      ports.execute(
        { name: "request_handoff", args: { reason: "customer_requested" } } as never,
        { claims: claims() } as never,
      ),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
    expect(handoffService.initiateHandoff).not.toHaveBeenCalled();
  });
});
