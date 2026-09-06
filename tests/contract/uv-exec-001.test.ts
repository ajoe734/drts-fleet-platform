import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import {
  BookingActorSchema,
  VoiceProofSchema,
  SpeechVoiceProofSchema,
  DtmfVoiceProofSchema,
  VoiceCapabilitySchema,
  VoiceScopeProfileSchema,
  VoiceErrorCodeSchema,
  VOICE_ERROR_CODES,
  VoiceSessionSchema,
  VoiceDraftSchema,
  VoiceReceiptSchema,
  VoiceCallbackSchema,
  VoiceCallbackStatusSchema,
  VoiceRecordingStateSchema,
  VoiceConfirmationStateSchema,
  VoiceOutcomeSchema,
  VoiceCommitStatusSchema,
} from "../../packages/contracts/src/unattended-voice";

const OPENAPI_PATH = resolve(process.cwd(), "docs/04-api/openapi-spec.yaml");
const requireMod = createRequire(resolve(process.cwd(), "package.json"));

function resolvePnpmModule(name: string): any {
  try {
    return requireMod(name);
  } catch {
    const candidates = [
      resolve(process.cwd(), "node_modules/.pnpm"),
      "/home/lupin/drts-fleet-platform/node_modules/.pnpm",
    ];
    for (const base of candidates) {
      if (!existsSync(base)) continue;
      const entries = readdirSync(base);
      const match = entries.find((e) => e.startsWith(`${name}@`));
      if (match) {
        const modPath = join(base, match, "node_modules", name);
        if (existsSync(modPath)) {
          return requireMod(modPath);
        }
      }
    }
    throw new Error(`Cannot find module '${name}'`);
  }
}

describe("UV-EXEC-001 Voice Contracts", () => {
  describe("BookingActorSchema", () => {
    it("rejects fake agentId in voice_agent actor", () => {
      const result = BookingActorSchema.safeParse({
        type: "voice_agent",
        agentId: "fake-agent-id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects fake agentId attached to valid voice_agent fields", () => {
      const result = BookingActorSchema.safeParse({
        type: "voice_agent",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        principalId: "principal-123",
        agentId: "fake-agent-id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects arbitrary actor types", () => {
      const result = BookingActorSchema.safeParse({
        type: "super_admin",
        agentId: "admin-1",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid voice_agent actor", () => {
      const result = BookingActorSchema.safeParse({
        type: "voice_agent",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        principalId: "principal-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid human actor", () => {
      const result = BookingActorSchema.safeParse({
        type: "human",
        agentId: "human-ops-42",
      });
      expect(result.success).toBe(true);
    });

    it("rejects arbitrary extra fields in human actor", () => {
      const result = BookingActorSchema.safeParse({
        type: "human",
        agentId: "human-ops-42",
        injected: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("VoiceCapabilitySchema", () => {
    it("accepts valid capability token claims", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute", "address_resolve"],
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(true);
    });

    it("rejects URL injection in capability", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        url: "https://malicious.example.com",
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
    });

    it("rejects SQL injection in capability", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        sql: "SELECT * FROM ops.orders",
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
    });

    it("rejects arbitrary actor injection in capability", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        actor: "platform_admin",
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
    });

    it("rejects arbitrary unauthorized scopes", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["admin_full_access"],
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
    });

    it("rejects invalid audience", () => {
      const capability = {
        aud: "other-audience",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
    });
  });

  describe("VoiceProofSchema", () => {
    const baseProof = {
      confirmationId: "123e4567-e89b-12d3-a456-426614174000",
      voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
      intentId: "123e4567-e89b-12d3-a456-426614174002",
      action: "create_owned_immediate_order",
      draftVersion: 7,
      snapshotHash: "sha256-abcdef0123456789",
      readbackPlaybackId: "123e4567-e89b-12d3-a456-426614174003",
      readbackCompletedEventId: "123e4567-e89b-12d3-a456-426614174004",
      inputEpoch: 12,
      controlCutoff: { mediaEpoch: 2, controlSequence: 98 },
      leaseEpoch: 3,
      recordingCheckpointId: "123e4567-e89b-12d3-a456-426614174005",
      confirmedAt: "2026-09-06T02:00:00.000Z",
      expiresAt: "2026-09-06T02:02:00.000Z",
    };

    it("validates valid speech proof", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "speech",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      const result = VoiceProofSchema.safeParse(proof);
      expect(result.success).toBe(true);
    });

    it("validates valid DTMF proof", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "dtmf",
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "1",
        },
      };
      const result = VoiceProofSchema.safeParse(proof);
      expect(result.success).toBe(true);
    });

    it("rejects speech confirmationMethod with DTMF evidence shape", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "speech",
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "1",
        },
      };
      const result = VoiceProofSchema.safeParse(proof);
      expect(result.success).toBe(false);
    });

    it("rejects DTMF confirmationMethod with speech evidence shape", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "dtmf",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      const result = VoiceProofSchema.safeParse(proof);
      expect(result.success).toBe(false);
    });

    it("rejects proof with arbitrary/extra fields", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "speech",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
        injectedClaim: "bypass",
      };
      const result = VoiceProofSchema.safeParse(proof);
      expect(result.success).toBe(false);
    });

    it("rejects proof with missing controlCutoff", () => {
      const incompleteProof = {
        ...baseProof,
        confirmationMethod: "speech" as const,
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      Reflect.deleteProperty(incompleteProof, "controlCutoff");
      const result = VoiceProofSchema.safeParse(incompleteProof);
      expect(result.success).toBe(false);
    });
  });

  describe("VoiceScopeProfileSchema", () => {
    it("accepts valid scope profile", () => {
      const profile = {
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174000",
        brandId: "drts-metro",
        operatingProfileId: "tw-metro-standard",
        operatingProfileVersion: 2,
      };
      const result = VoiceScopeProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });

    it("rejects non-uuid resourceScopeId", () => {
      const profile = {
        resourceScopeId: "invalid-uuid",
        brandId: "drts-metro",
        operatingProfileId: "tw-metro-standard",
        operatingProfileVersion: 2,
      };
      const result = VoiceScopeProfileSchema.safeParse(profile);
      expect(result.success).toBe(false);
    });
  });

  describe("VoiceErrorCodeSchema", () => {
    it("validates all 19 canonical and verification error codes", () => {
      expect(VOICE_ERROR_CODES.length).toBe(19);
      for (const code of VOICE_ERROR_CODES) {
        expect(VoiceErrorCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it("rejects unknown error codes", () => {
      expect(
        VoiceErrorCodeSchema.safeParse("VOICE_UNKNOWN_ERROR").success,
      ).toBe(false);
    });
  });

  describe("VoiceSession and related lifecycle schemas", () => {
    it("validates valid VoiceSession", () => {
      const session = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "123e4567-e89b-12d3-a456-426614174001",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "confirming",
        mediaState: "active",
        controlOwner: "ai",
        leaseEpoch: 1,
        sessionVersion: 1,
      };
      expect(VoiceSessionSchema.safeParse(session).success).toBe(true);
    });

    it("preserves commitStatus, recordingState, confirmationState, and outcome on closed+pending VoiceSession snapshot", () => {
      const closedPendingSession = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "123e4567-e89b-12d3-a456-426614174001",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "closed",
        mediaState: "ended",
        commitStatus: "pending",
        recordingState: "checkpoint_ready",
        confirmationState: "accepted",
        outcome: "auto_booking_created",
        inputEpoch: 12,
        pendingInput: false,
        lastResolvedInputEpoch: 12,
        lastAppliedControlSequence: 98,
      };
      const result = VoiceSessionSchema.safeParse(closedPendingSession);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dialogState).toBe("closed");
        expect(result.data.mediaState).toBe("ended");
        expect(result.data.commitStatus).toBe("pending");
        expect(result.data.recordingState).toBe("checkpoint_ready");
        expect(result.data.confirmationState).toBe("accepted");
        expect(result.data.outcome).toBe("auto_booking_created");
      }
    });

    it("validates valid VoiceDraft", () => {
      const draft = {
        intentId: "123e4567-e89b-12d3-a456-426614174000",
        draftVersion: 3,
        rawText: "台北車站東三門",
        normalizedValue: { placeId: "poi-123" },
        sourceTurnIds: ["123e4567-e89b-12d3-a456-426614174001"],
        sourceSegmentIds: ["seg-1"],
        providerConfidence: 0.95,
        validationState: "validated",
        confirmedByCustomerAt: null,
      };
      expect(VoiceDraftSchema.safeParse(draft).success).toBe(true);
    });

    it("validates valid VoiceReceipt with orderId", () => {
      const receipt = {
        actionKey: "brand+call+intent+action",
        status: "succeeded",
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        orderId: "123e4567-e89b-12d3-a456-426614174001",
      };
      expect(VoiceReceiptSchema.safeParse(receipt).success).toBe(true);
    });

    it("validates valid VoiceReceipt with orderId: null for SD §10.2 documented 202 pending receipt", () => {
      const pendingReceipt = {
        actionKey: "brand+call+intent+action",
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "pending",
        orderId: null,
        nextAction: "query_same_command",
        pollAfterMs: 1000,
      };
      const result = VoiceReceiptSchema.safeParse(pendingReceipt);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
        expect(result.data.orderId).toBeNull();
        expect(result.data.nextAction).toBe("query_same_command");
        expect(result.data.pollAfterMs).toBe(1000);
      }
    });

    it("validates all VoiceCallbackStatus lifecycle states per SD §9.1 and §12.5", () => {
      const statuses = [
        "pending",
        "claimed",
        "in_progress",
        "completed",
        "failed",
        "cancelled",
        "unreachable",
      ] as const;

      for (const status of statuses) {
        expect(VoiceCallbackStatusSchema.safeParse(status).success).toBe(true);
        const callback = {
          callbackId: "123e4567-e89b-12d3-a456-426614174000",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          contactPhone: "+886912345678",
          consentSnapshotHash: "hash-consent-xyz",
          status,
          scheduledAt: "2026-09-06T03:00:00.000Z",
        };
        expect(VoiceCallbackSchema.safeParse(callback).success).toBe(true);
      }
    });

    it("validates orthogonal recording, confirmation, outcome, and commit status enums per SD §5.2", () => {
      const recordingStates = [
        "starting",
        "capturing",
        "checkpoint_ready",
        "finalizing",
        "finalized",
        "failed",
        "expired",
      ] as const;
      for (const state of recordingStates) {
        expect(VoiceRecordingStateSchema.safeParse(state).success).toBe(true);
      }

      const confirmationStates = [
        "absent",
        "readback_playing",
        "awaiting_answer",
        "accepted",
        "invalidated",
        "consumed",
      ] as const;
      for (const state of confirmationStates) {
        expect(VoiceConfirmationStateSchema.safeParse(state).success).toBe(true);
      }

      const outcomes = [
        "auto_booking_created",
        "auto_no_service",
        "auto_query_completed",
        "human_handoff",
        "callback_scheduled",
        "abandoned",
        "technical_failure",
      ] as const;
      for (const outcome of outcomes) {
        expect(VoiceOutcomeSchema.safeParse(outcome).success).toBe(true);
      }

      const commitStatuses = ["none", "pending", "succeeded", "rejected"] as const;
      for (const commitStatus of commitStatuses) {
        expect(VoiceCommitStatusSchema.safeParse(commitStatus).success).toBe(true);
      }
    });
  });

  describe("OpenAPI Spec Consistency", () => {
    const openapi = readFileSync(OPENAPI_PATH, "utf8");

    it("publishes Voice schemas in openapi-spec.yaml", () => {
      const expectedSchemas = [
        "VoiceScopeProfile",
        "VoiceErrorCode",
        "VoiceControlCutoff",
        "VoiceSpeechEvidence",
        "VoiceDtmfEvidence",
        "VoiceSpeechProof",
        "VoiceDtmfProof",
        "VoiceProof",
        "VoiceCapabilityScope",
        "VoiceCapability",
        "VoiceDialogState",
        "VoiceMediaState",
        "VoiceControlOwner",
        "VoiceCommitStatus",
        "VoiceRecordingState",
        "VoiceConfirmationState",
        "VoiceOutcome",
        "VoiceSession",
        "VoiceDraft",
        "VoiceReceipt",
        "VoiceCallbackStatus",
        "VoiceCallback",
        "VoiceAgentBookingActor",
        "HumanBookingActor",
        "BookingActor",
      ];
      for (const schema of expectedSchemas) {
        expect(openapi).toContain(`${schema}:`);
      }
    });

    it("publishes all canonical Voice error codes in openapi-spec.yaml", () => {
      for (const code of VOICE_ERROR_CODES) {
        expect(openapi).toContain(`- ${code}`);
      }
    });

    it("publishes speech and dtmf evidence references in OpenAPI", () => {
      expect(openapi).toContain(
        `$ref: "#/components/schemas/VoiceSpeechEvidence"`,
      );
      expect(openapi).toContain(
        `$ref: "#/components/schemas/VoiceDtmfEvidence"`,
      );
    });

    it("publishes VoiceCapability scopes in openapi-spec.yaml", () => {
      expect(openapi).toContain("session_execute");
      expect(openapi).toContain("address_resolve");
      expect(openapi).toContain("order_create_bound");
      expect(openapi).toContain("order_read_bound");
      expect(openapi).toContain("handoff_request");
      expect(openapi).toContain("cancel_bound");
    });
  });

  describe("OpenAPI Ajv Schema Validation", () => {
    const YAML = resolvePnpmModule("yaml");
    const Ajv = resolvePnpmModule("ajv");
    const AjvClass = Ajv.default || Ajv;
    const ajv = new AjvClass({ strict: false, allErrors: true });

    const openapiDoc = YAML.parse(readFileSync(OPENAPI_PATH, "utf8"));
    for (const [name, schema] of Object.entries(openapiDoc.components.schemas)) {
      ajv.addSchema(schema, `#/components/schemas/${name}`);
    }

    const validateProof = ajv.getSchema("#/components/schemas/VoiceProof")!;
    const validateCapability = ajv.getSchema("#/components/schemas/VoiceCapability")!;
    const validateActor = ajv.getSchema("#/components/schemas/BookingActor")!;
    const validateReceipt = ajv.getSchema("#/components/schemas/VoiceReceipt")!;
    const validateSession = ajv.getSchema("#/components/schemas/VoiceSession")!;
    const validateCallback = ajv.getSchema("#/components/schemas/VoiceCallback")!;
    const validateScope = ajv.getSchema("#/components/schemas/VoiceScopeProfile")!;
    const validateCutoff = ajv.getSchema("#/components/schemas/VoiceControlCutoff")!;

    const baseProofData = {
      confirmationId: "123e4567-e89b-12d3-a456-426614174000",
      voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
      intentId: "123e4567-e89b-12d3-a456-426614174002",
      action: "create_owned_immediate_order",
      draftVersion: 7,
      snapshotHash: "sha256-abcdef0123456789",
      readbackPlaybackId: "123e4567-e89b-12d3-a456-426614174003",
      readbackCompletedEventId: "123e4567-e89b-12d3-a456-426614174004",
      inputEpoch: 12,
      controlCutoff: { mediaEpoch: 2, controlSequence: 98 },
      leaseEpoch: 3,
      recordingCheckpointId: "123e4567-e89b-12d3-a456-426614174005",
      confirmedAt: "2026-09-06T02:00:00.000Z",
      expiresAt: "2026-09-06T02:02:00.000Z",
    };

    it("OpenAPI accepts valid speech proof", () => {
      const proof = {
        ...baseProofData,
        confirmationMethod: "speech",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      expect(validateProof(proof)).toBe(true);
    });

    it("OpenAPI accepts valid DTMF proof", () => {
      const proof = {
        ...baseProofData,
        confirmationMethod: "dtmf",
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "1",
        },
      };
      expect(validateProof(proof)).toBe(true);
    });

    it("OpenAPI rejects speech confirmationMethod with DTMF evidence shape", () => {
      const proof = {
        ...baseProofData,
        confirmationMethod: "speech",
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "1",
        },
      };
      expect(validateProof(proof)).toBe(false);
    });

    it("OpenAPI rejects DTMF confirmationMethod with speech evidence shape", () => {
      const proof = {
        ...baseProofData,
        confirmationMethod: "dtmf",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      expect(validateProof(proof)).toBe(false);
    });

    it("OpenAPI rejects proof with injected arbitrary fields (additionalProperties: false)", () => {
      const proof = {
        ...baseProofData,
        confirmationMethod: "speech",
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
        injectedClaim: "bypass",
      };
      expect(validateProof(proof)).toBe(false);
    });

    it("OpenAPI accepts valid capability token", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute", "address_resolve"],
      };
      expect(validateCapability(capability)).toBe(true);
    });

    it("OpenAPI rejects URL injection in capability (additionalProperties: false)", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        url: "https://malicious.example.com",
      };
      expect(validateCapability(capability)).toBe(false);
    });

    it("OpenAPI rejects SQL injection in capability (additionalProperties: false)", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        sql: "SELECT * FROM ops.orders",
      };
      expect(validateCapability(capability)).toBe(false);
    });

    it("OpenAPI rejects actor injection in capability (additionalProperties: false)", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
        actor: "platform_admin",
      };
      expect(validateCapability(capability)).toBe(false);
    });

    it("OpenAPI accepts valid voice_agent and human booking actors", () => {
      expect(
        validateActor({
          type: "voice_agent",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
          principalId: "principal-123",
        }),
      ).toBe(true);

      expect(
        validateActor({
          type: "human",
          agentId: "human-ops-42",
        }),
      ).toBe(true);
    });

    it("OpenAPI rejects fake agentId in voice_agent actor (additionalProperties: false)", () => {
      expect(
        validateActor({
          type: "voice_agent",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
          principalId: "principal-123",
          agentId: "fake-agent-id",
        }),
      ).toBe(false);
    });

    it("OpenAPI rejects extra fields in human booking actor (additionalProperties: false)", () => {
      expect(
        validateActor({
          type: "human",
          agentId: "human-ops-42",
          injected: true,
        }),
      ).toBe(false);
    });

    it("OpenAPI rejects extra fields in VoiceScopeProfile and VoiceControlCutoff", () => {
      expect(
        validateScope({
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174000",
          brandId: "drts-metro",
          operatingProfileId: "tw-metro-standard",
          operatingProfileVersion: 2,
          extraField: "invalid",
        }),
      ).toBe(false);

      expect(
        validateCutoff({
          mediaEpoch: 1,
          controlSequence: 2,
          extraCutoff: "invalid",
        }),
      ).toBe(false);
    });

    it("OpenAPI accepts VoiceReceipt with orderId: null for 202 pending response", () => {
      const pendingReceipt = {
        actionKey: "brand+call+intent+action",
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "pending",
        orderId: null,
        nextAction: "query_same_command",
        pollAfterMs: 1000,
      };
      expect(validateReceipt(pendingReceipt)).toBe(true);
    });

    it("OpenAPI accepts closed+pending VoiceSession snapshot with orthogonal states", () => {
      const closedPendingSession = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "123e4567-e89b-12d3-a456-426614174001",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "closed",
        mediaState: "ended",
        commitStatus: "pending",
        recordingState: "checkpoint_ready",
        confirmationState: "accepted",
        outcome: "auto_booking_created",
        inputEpoch: 12,
        pendingInput: false,
        lastResolvedInputEpoch: 12,
        lastAppliedControlSequence: 98,
      };
      expect(validateSession(closedPendingSession)).toBe(true);
    });

    it("OpenAPI accepts VoiceCallback lifecycle statuses (claimed, in_progress, unreachable)", () => {
      for (const status of ["claimed", "in_progress", "unreachable"]) {
        const callback = {
          callbackId: "123e4567-e89b-12d3-a456-426614174000",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          contactPhone: "+886912345678",
          consentSnapshotHash: "hash-consent-xyz",
          status,
        };
        expect(validateCallback(callback)).toBe(true);
      }
    });
  });
});
