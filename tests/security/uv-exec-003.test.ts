import { afterEach, describe, expect, it, vi } from "vitest";
import * as jwt from "jsonwebtoken";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  buildVoiceAgentBookingActor,
  VoiceCapabilityGuard,
  type VoiceCapabilityRequestLike,
} from "../../apps/api/src/common/auth/voice-capability.guard";
import {
  assertVoiceCapabilityScope,
  VOICE_CAPABILITY_AUDIENCE,
  VOICE_CAPABILITY_ISSUE_SCOPE,
  VoiceCapabilityService,
} from "../../apps/api/src/common/auth/voice-capability.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import {
  VoiceLineScopeService,
  type TrustedCallAdmission,
} from "../../apps/api/src/modules/voice-booking/voice-line-scope.service";
import { VoiceBookingAuthorizationService } from "../../apps/api/src/modules/voice-booking/voice-booking-authorization.service";
import type {
  VoiceBookingRepository,
  VoiceCommandReceiptRecord,
  VoiceIntentRecord,
  VoiceLineBindingRecord,
  VoiceResourceScopeRecord,
  VoiceSessionRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { AUTH_SCOPE_PRESETS } from "../../apps/api/src/common/auth/auth.constants";
import {
  getIamActorScopePreset,
  IAM_ACTOR_POLICY_BY_TYPE,
} from "../../packages/contracts/src/iam-policy-catalog";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

async function expectApiRequestError(
  action: () => unknown | Promise<unknown>,
  assertions: (error: ApiRequestError) => void | Promise<void>,
) {
  try {
    await action();
    throw new Error("Expected ApiRequestError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError) {
      await assertions(error);
    }
  }
}

function setTestSigningKey() {
  process.env.JWT_SECRET = "uv-exec-003-test-secret";
}

function systemIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "system",
    actorId: "workload-voice-gateway",
    principalId: "workload-voice-gateway",
    realm: "system",
    tenantId: null,
    roleFamilies: [],
    roles: [],
    scopes: [...AUTH_SCOPE_PRESETS.system],
    requestId: null,
    ...overrides,
  };
}

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_SCOPE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RESOURCE_SCOPE_ID = "33333333-3333-4333-8333-333333333333";
const INTENT_ID = "44444444-4444-4444-8444-444444444444";

function makeSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: "call-1",
    providerAccountId: "provider-1",
    providerCallId: "provider-call-1",
    resourceScopeId: RESOURCE_SCOPE_ID,
    lineBindingId: "line-binding-1",
    routeProfileId: "route-profile-1",
    routeProfileVersion: 1,
    dialogState: "committing",
    mediaState: "active",
    controlOwner: "ai",
    leaseEpoch: 2,
    sessionVersion: 3,
    commitStatus: "pending",
    recordingState: "capturing",
    confirmationState: "accepted",
    outcome: null,
    inputEpoch: 0,
    pendingInput: false,
    lastResolvedInputEpoch: 0,
    lastAppliedControlSequence: 0,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

function makeResourceScopeRecord(
  overrides: Partial<VoiceResourceScopeRecord> = {},
): VoiceResourceScopeRecord {
  return {
    scopeId: RESOURCE_SCOPE_ID,
    brandId: "brand-a",
    operatingUnitId: null,
    runtimeMapping: {},
    grantedBy: "ops-admin-1",
    status: "active",
    version: 1,
    ...overrides,
  };
}

function makeIntentRecord(
  overrides: Partial<VoiceIntentRecord> = {},
): VoiceIntentRecord {
  return {
    intentId: INTENT_ID,
    voiceSessionId: VOICE_SESSION_ID,
    action: "create_owned_order",
    currentDraftVersion: 1,
    boundOrderId: null,
    status: "collecting",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

function makeReceiptRecord(
  overrides: Partial<VoiceCommandReceiptRecord> = {},
): VoiceCommandReceiptRecord {
  return {
    commandId: "55555555-5555-4555-8555-555555555555",
    intentId: INTENT_ID,
    brandId: "brand-a",
    callId: "call-1",
    action: "create_owned_order",
    payloadHash: "sha256-fake",
    status: "succeeded",
    orderId: "order-1",
    resultVersion: 1,
    errorCode: null,
    errorReason: null,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

type FakeableRepositoryMethods = Pick<
  VoiceBookingRepository,
  | "findSessionById"
  | "findActiveCreateIntent"
  | "findResourceScopeById"
  | "findReceiptByActionKey"
  | "findEnabledLineBindings"
  | "findActiveResourceScopeForBrand"
>;

/** Minimal fake satisfying only the repository methods these services call. */
function fakeRepository(
  overrides: Partial<FakeableRepositoryMethods> = {},
): VoiceBookingRepository {
  const base: FakeableRepositoryMethods = {
    findSessionById: vi.fn(async () => null),
    findActiveCreateIntent: vi.fn(async () => null),
    findResourceScopeById: vi.fn(async () => null),
    findReceiptByActionKey: vi.fn(async () => null),
    findEnabledLineBindings: vi.fn(async () => []),
    findActiveResourceScopeForBrand: vi.fn(async () => null),
  };
  return { ...base, ...overrides } as unknown as VoiceBookingRepository;
}

describe("UV-EXEC-003: IAM catalog wiring for the voice capability exchange", () => {
  it("grants the system workload actor the voice:capability:issue scope by default", () => {
    const systemPolicy = IAM_ACTOR_POLICY_BY_TYPE.get("system");
    expect(systemPolicy?.scopes).toContain(VOICE_CAPABILITY_ISSUE_SCOPE);
    expect(AUTH_SCOPE_PRESETS.system).toContain(VOICE_CAPABILITY_ISSUE_SCOPE);
    expect(getIamActorScopePreset("system")).toContain(
      VOICE_CAPABILITY_ISSUE_SCOPE,
    );
  });
});

describe("UV-EXEC-003: VoiceCapabilityService two-stage identity exchange", () => {
  it("rejects issuing a capability to a non-system actor", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    expect(() =>
      service.issue(
        systemIdentity({ actorType: "ops_user", realm: "ops" }),
        {
          voiceSessionId: VOICE_SESSION_ID,
          resourceScopeId: RESOURCE_SCOPE_ID,
          routeProfileVersion: 1,
          leaseEpoch: 1,
          scopes: ["session_execute"],
        },
      ),
    ).toThrow(ApiRequestError);
  });

  it("rejects issuing a capability to a system actor missing voice:capability:issue", async () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    await expectApiRequestError(
      () =>
        service.issue(systemIdentity({ scopes: ["foundation:read"] }), {
          voiceSessionId: VOICE_SESSION_ID,
          resourceScopeId: RESOURCE_SCOPE_ID,
          routeProfileVersion: 1,
          leaseEpoch: 1,
          scopes: ["session_execute"],
        }),
      (error) => {
        expect(error.code).toBe("VOICE_CAPABILITY_REJECTED");
      },
    );
  });

  it("issues and verifies a capability token bound to the requested session/scope", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const envelope = service.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 2,
      scopes: ["session_execute", "order_read_bound"],
    });

    expect(envelope.claims.aud).toBe(VOICE_CAPABILITY_AUDIENCE);
    expect(envelope.claims.servicePrincipalId).toBe("workload-voice-gateway");

    const verified = service.verify(envelope.token);
    expect(verified).toEqual(envelope.claims);
  });

  it("rejects an expired capability token", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const envelope = service.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute"],
      ttlSeconds: -10,
    });

    expect(() => service.verify(envelope.token)).toThrow(ApiRequestError);
    try {
      service.verify(envelope.token);
    } catch (error) {
      expect((error as ApiRequestError).code).toBe("VOICE_PROOF_EXPIRED");
    }
  });

  it("rejects a token minted for a different audience", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const wrongAudienceToken = jwt.sign(
      {
        iss: "drts_voice_capability_issuer",
        aud: "some-other-gateway",
        servicePrincipalId: "workload-voice-gateway",
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        routeProfileVersion: 1,
        leaseEpoch: 1,
        scopes: ["session_execute"],
      },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "60s" },
    );

    expect(() => service.verify(wrongAudienceToken)).toThrow(ApiRequestError);
  });

  it("rejects a token signed with the wrong key (tampered signature)", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const envelope = service.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute"],
    });

    const forgedWithWrongKey = jwt.sign(
      jwt.decode(envelope.token) as Record<string, unknown>,
      "attacker-controlled-secret",
      { algorithm: "HS256" },
    );

    expect(() => service.verify(forgedWithWrongKey)).toThrow(ApiRequestError);
  });

  it("rejects a token payload carrying an extra/forged field (e.g. an injected agentId)", () => {
    setTestSigningKey();
    const forgedPayloadToken = jwt.sign(
      {
        iss: "drts_voice_capability_issuer",
        aud: VOICE_CAPABILITY_AUDIENCE,
        servicePrincipalId: "workload-voice-gateway",
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        routeProfileVersion: 1,
        leaseEpoch: 1,
        scopes: ["session_execute"],
        // A forged/extra claim that must never be trusted as an actor
        // identity even though the token is otherwise validly signed by the
        // legitimate issuer's own key material (simulating an issuer bug or
        // downstream tampering of the claims object before signing).
        agentId: "human-agent-007",
      },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "60s" },
    );

    const service = new VoiceCapabilityService();
    expect(() => service.verify(forgedPayloadToken)).toThrow(ApiRequestError);
  });

  it("assertVoiceCapabilityScope rejects a capability missing the tool's required scope", () => {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const envelope = service.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute"],
    });

    expect(() =>
      assertVoiceCapabilityScope(envelope.claims, "cancel_bound"),
    ).toThrow(ApiRequestError);
  });
});

describe("UV-EXEC-003: VoiceCapabilityGuard live scope/epoch re-check", () => {
  function issueToken(
    overrides: Partial<{
      resourceScopeId: string;
      routeProfileVersion: number;
      leaseEpoch: number;
    }> = {},
  ) {
    setTestSigningKey();
    const service = new VoiceCapabilityService();
    const envelope = service.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 2,
      scopes: ["order_read_bound"],
      ...overrides,
    });
    return { service, envelope };
  }

  it("rejects a missing bearer token", async () => {
    const { service } = issueToken();
    const guard = new VoiceCapabilityGuard(service, undefined);
    await expectApiRequestError(
      () => guard.authenticate({}),
      (error) => expect(error.code).toBe("VOICE_INVALID_PROOF"),
    );
  });

  it("rejects when the bound session no longer exists", async () => {
    const { service, envelope } = issueToken();
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => null),
    });
    const guard = new VoiceCapabilityGuard(service, repository);

    await expectApiRequestError(
      () => guard.authenticate({ authorization: `Bearer ${envelope.token}` }),
      (error) => expect(error.code).toBe("VOICE_SESSION_NOT_OWNER"),
    );
  });

  it("rejects cross-brand/cross-product reuse: capability scope no longer matches session scope", async () => {
    const { service, envelope } = issueToken();
    const repository = fakeRepository({
      findSessionById: vi.fn(async () =>
        makeSessionRecord({ resourceScopeId: OTHER_RESOURCE_SCOPE_ID }),
      ),
    });
    const guard = new VoiceCapabilityGuard(service, repository);

    await expectApiRequestError(
      () => guard.authenticate({ authorization: `Bearer ${envelope.token}` }),
      (error) => expect(error.code).toBe("VOICE_SCOPE_DENIED"),
    );
  });

  it("rejects a stale/superseded owner epoch (old token after a new owner took the lease)", async () => {
    const { service, envelope } = issueToken({ leaseEpoch: 1 });
    const repository = fakeRepository({
      // The session has since moved to lease epoch 5 (e.g. handoff/reconnect);
      // the epoch-1 capability must not still be honored.
      findSessionById: vi.fn(async () => makeSessionRecord({ leaseEpoch: 5 })),
    });
    const guard = new VoiceCapabilityGuard(service, repository);

    await expectApiRequestError(
      () => guard.authenticate({ authorization: `Bearer ${envelope.token}` }),
      (error) => expect(error.code).toBe("VOICE_SESSION_NOT_OWNER"),
    );
  });

  it("rejects when the resource scope has been revoked since the token was minted", async () => {
    const { service, envelope } = issueToken();
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findResourceScopeById: vi.fn(async () =>
        makeResourceScopeRecord({ status: "revoked" }),
      ),
    });
    const guard = new VoiceCapabilityGuard(service, repository);

    await expectApiRequestError(
      () => guard.authenticate({ authorization: `Bearer ${envelope.token}` }),
      (error) => expect(error.code).toBe("VOICE_SCOPE_DENIED"),
    );
  });

  it("accepts a live, matching capability and attaches claims + bookingActor derived only from the token", async () => {
    const { service, envelope } = issueToken();
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findResourceScopeById: vi.fn(async () => makeResourceScopeRecord()),
    });
    const guard = new VoiceCapabilityGuard(service, repository);

    const request: VoiceCapabilityRequestLike & { body?: unknown } = {
      headers: { authorization: `Bearer ${envelope.token}` },
      // A forged actor identity smuggled into the body. The guard must never
      // read this -- bookingActor must come only from verified claims.
      body: { agentId: "forged-human-agent", actorId: "forged-actor" },
    };

    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const allowed = await guard.canActivate(context);
    expect(allowed).toBe(true);
    expect(request.voiceCapability).toEqual(envelope.claims);
    expect(request.bookingActor).toEqual(
      buildVoiceAgentBookingActor(envelope.claims),
    );
    expect(request.bookingActor?.principalId).toBe("workload-voice-gateway");
    expect(request.bookingActor?.principalId).not.toBe("forged-human-agent");
    expect((request.bookingActor as unknown as Record<string, unknown>).agentId).toBeUndefined();
  });
});

describe("UV-EXEC-003: VoiceLineScopeService line-scope + brand/product resolution", () => {
  const admission: TrustedCallAdmission = {
    providerAccountId: "provider-1",
    dnis: "0800000000",
  };

  it("rejects an unbound line (no matching voice.line_binding row)", async () => {
    const repository = fakeRepository({
      findEnabledLineBindings: vi.fn(async () => []),
    });
    const service = new VoiceLineScopeService(repository);

    await expectApiRequestError(
      () => service.resolveLineScope(admission),
      (error) => expect(error.code).toBe("VOICE_LINE_NOT_BOUND"),
    );
  });

  it("fails closed on an ambiguous multi-match instead of guessing a brand", async () => {
    const bindingA: VoiceLineBindingRecord = {
      lineBindingId: "line-a",
      providerAccountId: "provider-1",
      dnis: "0800000000",
      brandId: "brand-a",
      operatingProfileId: "route-profile-1",
      queueId: null,
      enabled: true,
      version: 1,
    };
    const bindingB: VoiceLineBindingRecord = { ...bindingA, lineBindingId: "line-b", brandId: "brand-b" };
    const repository = fakeRepository({
      findEnabledLineBindings: vi.fn(async () => [bindingA, bindingB]),
    });
    const service = new VoiceLineScopeService(repository);

    await expectApiRequestError(
      () => service.resolveLineScope(admission),
      (error) => expect(error.code).toBe("VOICE_LINE_NOT_BOUND"),
    );
  });

  it("rejects when the bound brand has no active resource scope", async () => {
    const repository = fakeRepository({
      findEnabledLineBindings: vi.fn(async () => [
        {
          lineBindingId: "line-a",
          providerAccountId: "provider-1",
          dnis: "0800000000",
          brandId: "brand-a",
          operatingProfileId: "route-profile-1",
          queueId: null,
          enabled: true,
          version: 1,
        },
      ]),
      findActiveResourceScopeForBrand: vi.fn(async () => null),
    });
    const service = new VoiceLineScopeService(repository);

    await expectApiRequestError(
      () => service.resolveLineScope(admission),
      (error) => expect(error.code).toBe("VOICE_SCOPE_DENIED"),
    );
  });

  it("resolves brand/runtime/scope from only the trusted provider+DNIS pair, ignoring any hidden/asserted ANI", async () => {
    const findEnabledLineBindings = vi.fn(async () => [
      {
        lineBindingId: "line-a",
        providerAccountId: "provider-1",
        dnis: "0800000000",
        brandId: "brand-a",
        operatingProfileId: "route-profile-1",
        queueId: null,
        enabled: true,
        version: 1,
      },
    ]);
    const repository = fakeRepository({
      findEnabledLineBindings,
      findActiveResourceScopeForBrand: vi.fn(async () =>
        makeResourceScopeRecord(),
      ),
    });
    const service = new VoiceLineScopeService(repository);

    // A caller-declared ANI/brand hint has no field to occupy on
    // TrustedCallAdmission; even if attached via an unsafe cast it is never
    // read by resolveLineScope, which only ever forwards providerAccountId
    // and dnis to the repository lookup.
    const admissionWithSpoofedFields = {
      ...admission,
      assertedCallerPhone: "+886900000000",
      declaredBrandId: "brand-attacker-controlled",
    } as unknown as TrustedCallAdmission;

    const resolved = await service.resolveLineScope(admissionWithSpoofedFields);

    expect(resolved.lineBinding.brandId).toBe("brand-a");
    expect(resolved.resourceScope.scopeId).toBe(RESOURCE_SCOPE_ID);
    expect(findEnabledLineBindings).toHaveBeenCalledWith(
      "provider-1",
      "0800000000",
    );
  });
});

describe("UV-EXEC-003: VoiceBookingAuthorizationService order attribution + query ownership", () => {
  it("rejects lookups against a session that does not exist", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => null),
    });
    const service = new VoiceBookingAuthorizationService(repository);

    await expectApiRequestError(
      () => service.resolveBoundOrderId(VOICE_SESSION_ID, RESOURCE_SCOPE_ID),
      (error) => expect(error.code).toBe("VOICE_SESSION_NOT_OWNER"),
    );
  });

  it("rejects cross-scope access even for a real session id (no cross-brand/product leakage)", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () =>
        makeSessionRecord({ resourceScopeId: OTHER_RESOURCE_SCOPE_ID }),
      ),
    });
    const service = new VoiceBookingAuthorizationService(repository);

    await expectApiRequestError(
      () => service.resolveBoundOrderId(VOICE_SESSION_ID, RESOURCE_SCOPE_ID),
      (error) => expect(error.code).toBe("VOICE_SCOPE_DENIED"),
    );
  });

  it("returns null (not an error) when the session has not bound an order yet", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findActiveCreateIntent: vi.fn(async () => makeIntentRecord({ boundOrderId: null })),
    });
    const service = new VoiceBookingAuthorizationService(repository);

    await expect(
      service.resolveBoundOrderId(VOICE_SESSION_ID, RESOURCE_SCOPE_ID),
    ).resolves.toBeNull();
  });

  it("fails closed when the intent claims a bound order with no matching succeeded receipt", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findActiveCreateIntent: vi.fn(async () =>
        makeIntentRecord({ boundOrderId: "order-1" }),
      ),
      findResourceScopeById: vi.fn(async () => makeResourceScopeRecord()),
      findReceiptByActionKey: vi.fn(async () => null),
    });
    const service = new VoiceBookingAuthorizationService(repository);

    await expectApiRequestError(
      () => service.resolveBoundOrderId(VOICE_SESSION_ID, RESOURCE_SCOPE_ID),
      (error) => expect(error.code).toBe("VOICE_ACTION_PAYLOAD_CONFLICT"),
    );
  });

  it("fails closed when the receipt's orderId disagrees with the intent's cached bound_order_id (simulated tamper/drift)", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findActiveCreateIntent: vi.fn(async () =>
        makeIntentRecord({ boundOrderId: "order-1" }),
      ),
      findResourceScopeById: vi.fn(async () => makeResourceScopeRecord()),
      findReceiptByActionKey: vi.fn(async () =>
        makeReceiptRecord({ orderId: "order-DIFFERENT" }),
      ),
    });
    const service = new VoiceBookingAuthorizationService(repository);

    await expectApiRequestError(
      () => service.resolveBoundOrderId(VOICE_SESSION_ID, RESOURCE_SCOPE_ID),
      (error) => expect(error.code).toBe("VOICE_ACTION_PAYLOAD_CONFLICT"),
    );
  });

  it("resolves the bound orderId only from the succeeded command receipt, never from a call-session linkedOrderId column", async () => {
    const findReceiptByActionKey = vi.fn(async (
      brandId: string,
      callId: string,
      intentId: string,
      action: string,
    ) =>
      makeReceiptRecord({ orderId: "order-1", brandId, callId, intentId, action }),
    );
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findActiveCreateIntent: vi.fn(async () =>
        makeIntentRecord({ boundOrderId: "order-1" }),
      ),
      findResourceScopeById: vi.fn(async () => makeResourceScopeRecord()),
      findReceiptByActionKey,
    });
    // This fake repository has no method resembling a linkedOrderId lookup
    // at all -- resolveBoundOrderId cannot reach for one even if it wanted
    // to, since VoiceBookingRepository never exposes crm.phase1_call_sessions
    // data to this authorization path.
    expect((repository as unknown as Record<string, unknown>).findByLinkedOrderId).toBeUndefined();

    const service = new VoiceBookingAuthorizationService(repository);
    const orderId = await service.resolveBoundOrderId(
      VOICE_SESSION_ID,
      RESOURCE_SCOPE_ID,
    );

    expect(orderId).toBe("order-1");
    expect(findReceiptByActionKey).toHaveBeenCalledWith(
      "brand-a",
      "call-1",
      INTENT_ID,
      "create_owned_order",
    );
  });

  it("getBoundBookingStatus rejects a capability missing order_read_bound", async () => {
    const repository = fakeRepository();
    const service = new VoiceBookingAuthorizationService(repository);
    setTestSigningKey();
    const capabilityService = new VoiceCapabilityService();
    const envelope = capabilityService.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute"],
    });

    await expectApiRequestError(
      () => service.getBoundBookingStatus(envelope.claims),
      (error) => expect(error.code).toBe("VOICE_UNAUTHORIZED_SCOPE"),
    );
  });

  it("getBoundBookingStatus returns only the caller's own session-bound order, with no orderId/callId parameter to redirect it elsewhere", async () => {
    const repository = fakeRepository({
      findSessionById: vi.fn(async () => makeSessionRecord()),
      findActiveCreateIntent: vi.fn(async () =>
        makeIntentRecord({ boundOrderId: "order-1" }),
      ),
      findResourceScopeById: vi.fn(async () => makeResourceScopeRecord()),
      findReceiptByActionKey: vi.fn(async () => makeReceiptRecord()),
    });
    const service = new VoiceBookingAuthorizationService(repository);
    setTestSigningKey();
    const capabilityService = new VoiceCapabilityService();
    const envelope = capabilityService.issue(systemIdentity(), {
      voiceSessionId: VOICE_SESSION_ID,
      resourceScopeId: RESOURCE_SCOPE_ID,
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["order_read_bound"],
    });

    // getBoundBookingStatus(claims) takes no orderId/callId argument at all,
    // so there is no input surface through which a caller could ask for
    // another passenger's booking.
    expect(service.getBoundBookingStatus.length).toBe(1);

    await expect(
      service.getBoundBookingStatus(envelope.claims),
    ).resolves.toEqual({ orderId: "order-1" });
  });
});
