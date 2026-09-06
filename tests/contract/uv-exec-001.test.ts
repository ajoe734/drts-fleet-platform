import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  BookingActorSchema,
  VoiceProofSchema,
  VoiceCapabilitySchema,
  VoiceScopeProfileSchema,
  VoiceErrorCodeSchema,
  VOICE_ERROR_CODES,
  VoiceSessionSchema,
  VoiceDraftSchema,
  VoiceReceiptSchema,
  VoiceCallbackSchema,
} from "../../packages/contracts/src/unattended-voice";

const OPENAPI_PATH = resolve(process.cwd(), "docs/04-api/openapi-spec.yaml");

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

    it("validates valid VoiceReceipt", () => {
      const receipt = {
        actionKey: "brand+call+intent+action",
        status: "succeeded",
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        orderId: "123e4567-e89b-12d3-a456-426614174001",
      };
      expect(VoiceReceiptSchema.safeParse(receipt).success).toBe(true);
    });

    it("validates valid VoiceCallback", () => {
      const callback = {
        callbackId: "123e4567-e89b-12d3-a456-426614174000",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        contactPhone: "+886912345678",
        consentSnapshotHash: "hash-consent-xyz",
        status: "pending",
        scheduledAt: "2026-09-06T03:00:00.000Z",
      };
      expect(VoiceCallbackSchema.safeParse(callback).success).toBe(true);
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
        "VoiceProof",
        "VoiceCapabilityScope",
        "VoiceCapability",
        "VoiceDialogState",
        "VoiceMediaState",
        "VoiceControlOwner",
        "VoiceSession",
        "VoiceDraft",
        "VoiceReceipt",
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

    it("publishes speech and dtmf evidence union under VoiceProof in OpenAPI", () => {
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
});
