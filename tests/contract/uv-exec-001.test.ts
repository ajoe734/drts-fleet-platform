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
  VoiceCapabilityTokenClaimsSchema,
  VoiceCapabilityClaimsSchema,
  VoiceCapabilityTokenEnvelopeSchema,
  VoiceScopeProfileSchema,
  VoiceErrorCodeSchema,
  VOICE_ERROR_CODES,
  VoiceSessionSchema,
  VoiceDraftSchema,
  VoiceReceiptSchema,
  VoiceReceiptStatusSchema,
  VOICE_RECEIPT_STATUSES,
  VoicePendingReceiptSchema,
  VoiceSucceededReceiptSchema,
  VoiceRejectedReceiptSchema,
  VoiceReceiptRecordSchema,
  VoiceActionKeyRecordSchema,
  VoiceCallbackSchema,
  VoiceCallbackStatusSchema,
  VoiceRecordingStateSchema,
  VoiceConfirmationStateSchema,
  VoiceOutcomeSchema,
  VoiceCommitStatusSchema,
  VoiceDtmfEvidenceSchema,
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

    it("accepts valid capability token with workload identity opaque principal ID (e.g. svc-api-runtime)", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "svc-api-runtime",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute", "address_resolve"],
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(true);
    });

    it("rejects empty servicePrincipalId in capability", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      const result = VoiceCapabilitySchema.safeParse(capability);
      expect(result.success).toBe(false);
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

    it("accepts valid capability token claims with iss and exp in VoiceCapabilitySchema", () => {
      const capability = {
        iss: "https://auth.example.com",
        aud: "voice-tool-gateway",
        exp: 1757134800,
        iat: 1757131200,
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

    it("accepts valid full token claims in VoiceCapabilityTokenClaimsSchema per SD §4.2", () => {
      const claims = {
        iss: "https://auth.example.com",
        aud: "voice-tool-gateway",
        exp: 1757134800,
        iat: 1757131200,
        servicePrincipalId: "svc-voice-runtime",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute", "address_resolve"],
      };
      expect(VoiceCapabilityTokenClaimsSchema.safeParse(claims).success).toBe(
        true,
      );
      expect(VoiceCapabilityClaimsSchema.safeParse(claims).success).toBe(true);
    });

    it("rejects token claims missing iss or with empty iss in VoiceCapabilityTokenClaimsSchema", () => {
      const baseClaims = {
        aud: "voice-tool-gateway",
        exp: 1757134800,
        servicePrincipalId: "svc-voice-runtime",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse(baseClaims).success,
      ).toBe(false);
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse({ ...baseClaims, iss: "" })
          .success,
      ).toBe(false);
    });

    it("rejects token claims missing exp, with non-positive or non-integer exp in VoiceCapabilityTokenClaimsSchema", () => {
      const baseClaims = {
        iss: "https://auth.example.com",
        aud: "voice-tool-gateway",
        servicePrincipalId: "svc-voice-runtime",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse(baseClaims).success,
      ).toBe(false);
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse({ ...baseClaims, exp: 0 })
          .success,
      ).toBe(false);
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse({ ...baseClaims, exp: -10 })
          .success,
      ).toBe(false);
      expect(
        VoiceCapabilityTokenClaimsSchema.safeParse({
          ...baseClaims,
          exp: 1757134800.5,
        }).success,
      ).toBe(false);
    });

    it("validates VoiceCapabilityTokenEnvelopeSchema with Bearer token and valid claims", () => {
      const envelope = {
        token: "eyJhbGciOi...",
        tokenType: "Bearer" as const,
        expiresIn: 3600,
        claims: {
          iss: "https://auth.example.com",
          aud: "voice-tool-gateway",
          exp: 1757134800,
          servicePrincipalId: "svc-voice-runtime",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          routeProfileVersion: 1,
          leaseEpoch: 2,
          scopes: ["session_execute"],
        },
      };
      expect(
        VoiceCapabilityTokenEnvelopeSchema.safeParse(envelope).success,
      ).toBe(true);
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

    it("validates valid speech proof directly and via union", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "speech" as const,
        evidence: {
          turnId: "123e4567-e89b-12d3-a456-426614174006",
          finalEventId: "123e4567-e89b-12d3-a456-426614174007",
        },
      };
      expect(SpeechVoiceProofSchema.safeParse(proof).success).toBe(true);
      expect(VoiceProofSchema.safeParse(proof).success).toBe(true);
    });

    it("validates valid DTMF proof directly and via union", () => {
      const proof = {
        ...baseProof,
        confirmationMethod: "dtmf" as const,
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "1",
        },
      };
      expect(DtmfVoiceProofSchema.safeParse(proof).success).toBe(true);
      expect(VoiceProofSchema.safeParse(proof).success).toBe(true);
    });

    it("validates VoiceDtmfEvidenceSchema for valid single keys (0-9, *, #, A-D)", () => {
      const validKeys = ["0", "1", "9", "*", "#", "A", "B", "C", "D", "a", "d"];
      for (const digit of validKeys) {
        const result = VoiceDtmfEvidenceSchema.safeParse({
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit,
        });
        expect(result.success, `digit '${digit}' should be valid`).toBe(true);
      }
    });

    it("rejects empty string, multi-character, and invalid characters in VoiceDtmfEvidenceSchema", () => {
      const invalidKeys = ["", "12", " ", "**", "##", "E", "invalid", "\n"];
      for (const digit of invalidKeys) {
        const result = VoiceDtmfEvidenceSchema.safeParse({
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit,
        });
        expect(result.success, `digit '${digit}' should be rejected`).toBe(
          false,
        );
      }
    });

    it("rejects full DTMF proof with empty digit or multi-character digit", () => {
      const proofEmpty = {
        ...baseProof,
        confirmationMethod: "dtmf" as const,
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "",
        },
      };
      expect(DtmfVoiceProofSchema.safeParse(proofEmpty).success).toBe(false);
      expect(VoiceProofSchema.safeParse(proofEmpty).success).toBe(false);

      const proofMulti = {
        ...baseProof,
        confirmationMethod: "dtmf" as const,
        evidence: {
          eventId: "123e4567-e89b-12d3-a456-426614174008",
          digit: "12",
        },
      };
      expect(DtmfVoiceProofSchema.safeParse(proofMulti).success).toBe(false);
      expect(VoiceProofSchema.safeParse(proofMulti).success).toBe(false);
    });

    it("rejects full DTMF proof with invalid eventId UUID", () => {
      const proofInvalidEvent = {
        ...baseProof,
        confirmationMethod: "dtmf" as const,
        evidence: {
          eventId: "not-a-uuid",
          digit: "1",
        },
      };
      expect(DtmfVoiceProofSchema.safeParse(proofInvalidEvent).success).toBe(
        false,
      );
      expect(VoiceProofSchema.safeParse(proofInvalidEvent).success).toBe(false);
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

    it("validates valid VoiceSession with real CallcenterService callId format (CALL-YYYYMMDD-XXXXXX)", () => {
      const session = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "CALL-20260410-000001",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "collecting",
        mediaState: "active",
      };
      const result = VoiceSessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it("rejects empty callId in VoiceSession", () => {
      const session = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "collecting",
        mediaState: "active",
      };
      const result = VoiceSessionSchema.safeParse(session);
      expect(result.success).toBe(false);
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

    it("validates VoiceDraft with polymorphic slot values (object, number, phone string, null, omitted) per SD §6.1", () => {
      const baseDraft = {
        intentId: "123e4567-e89b-12d3-a456-426614174000",
        draftVersion: 3,
        sourceTurnIds: ["123e4567-e89b-12d3-a456-426614174001"],
        sourceSegmentIds: ["seg-1"],
        providerConfidence: 0.95,
        validationState: "validated",
        confirmedByCustomerAt: null,
      };

      // 1. Structured address object
      expect(
        VoiceDraftSchema.safeParse({
          ...baseDraft,
          rawText: "台北車站東三門",
          normalizedValue: {
            placeId: "poi-123",
            formattedAddress: "台北市中正區北平西路3號",
          },
        }).success,
      ).toBe(true);

      // 2. Passenger count number (e.g. 3)
      expect(
        VoiceDraftSchema.safeParse({
          ...baseDraft,
          rawText: "3位",
          normalizedValue: 3,
        }).success,
      ).toBe(true);

      // 3. Phone string
      expect(
        VoiceDraftSchema.safeParse({
          ...baseDraft,
          rawText: "0912345678",
          normalizedValue: "+886912345678",
        }).success,
      ).toBe(true);

      // 4. Null normalizedValue
      expect(
        VoiceDraftSchema.safeParse({
          ...baseDraft,
          rawText: "待確認",
          normalizedValue: null,
        }).success,
      ).toBe(true);

      // 5. Omitted normalizedValue
      expect(
        VoiceDraftSchema.safeParse({
          ...baseDraft,
        }).success,
      ).toBe(true);
    });

    it("validates all VoiceReceiptStatus enum values per SD §7.1 and §10.1", () => {
      for (const status of VOICE_RECEIPT_STATUSES) {
        expect(VoiceReceiptStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(VoiceReceiptStatusSchema.safeParse("none").success).toBe(false);
    });

    it("validates exact SD §10.2 documented 202 response data shape without actionKey", () => {
      const pendingReceipt = {
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "pending" as const,
        orderId: null,
        nextAction: "query_same_command",
        pollAfterMs: 1000,
      };
      const result = VoiceReceiptSchema.safeParse(pendingReceipt);
      expect(result.success).toBe(true);
      expect(VoicePendingReceiptSchema.safeParse(pendingReceipt).success).toBe(
        true,
      );
      if (result.success) {
        expect(result.data.status).toBe("pending");
        expect(result.data.orderId).toBeNull();
        expect(result.data.nextAction).toBe("query_same_command");
        expect(result.data.pollAfterMs).toBe(1000);
      }
    });

    it("validates succeeded VoiceReceipt with required valid UUID orderId and commandId", () => {
      const receipt = {
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "succeeded" as const,
        orderId: "123e4567-e89b-12d3-a456-426614174001",
      };
      expect(VoiceReceiptSchema.safeParse(receipt).success).toBe(true);
      expect(VoiceSucceededReceiptSchema.safeParse(receipt).success).toBe(true);
    });

    it("rejects succeeded VoiceReceipt missing commandId, missing orderId, or with orderId: null", () => {
      expect(
        VoiceReceiptSchema.safeParse({
          status: "succeeded",
          orderId: "123e4567-e89b-12d3-a456-426614174001",
        }).success,
      ).toBe(false);

      expect(
        VoiceReceiptSchema.safeParse({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "succeeded",
        }).success,
      ).toBe(false);

      expect(
        VoiceReceiptSchema.safeParse({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "succeeded",
          orderId: null,
        }).success,
      ).toBe(false);
    });

    it("rejects { actionKey: 'key', status: 'succeeded' } without commandId and orderId", () => {
      expect(
        VoiceReceiptSchema.safeParse({
          actionKey: "brand+call+intent+action",
          status: "succeeded",
        }).success,
      ).toBe(false);
    });

    it("rejects session commitStatus 'none' in VoiceReceiptSchema", () => {
      expect(
        VoiceReceiptSchema.safeParse({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "none",
        }).success,
      ).toBe(false);
    });

    it("validates rejected VoiceReceipt with commandId and optional rejectionReason", () => {
      const rejectedReceipt = {
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "rejected" as const,
        rejectionReason: "VOICE_SERVICE_NOT_AVAILABLE",
      };
      expect(VoiceReceiptSchema.safeParse(rejectedReceipt).success).toBe(true);
      expect(
        VoiceRejectedReceiptSchema.safeParse(rejectedReceipt).success,
      ).toBe(true);
    });

    it("validates internal VoiceReceiptRecordSchema requiring actionKey, commandId, and status", () => {
      const validRecord = {
        actionKey: "brand+call+intent+action",
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "pending" as const,
        orderId: null,
      };
      expect(VoiceReceiptRecordSchema.safeParse(validRecord).success).toBe(
        true,
      );
      expect(VoiceActionKeyRecordSchema.safeParse(validRecord).success).toBe(
        true,
      );

      // missing actionKey
      expect(
        VoiceReceiptRecordSchema.safeParse({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "pending",
        }).success,
      ).toBe(false);

      // status: none
      expect(
        VoiceReceiptRecordSchema.safeParse({
          ...validRecord,
          status: "none",
        }).success,
      ).toBe(false);
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
        expect(VoiceConfirmationStateSchema.safeParse(state).success).toBe(
          true,
        );
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

      const commitStatuses = [
        "none",
        "pending",
        "succeeded",
        "rejected",
      ] as const;
      for (const commitStatus of commitStatuses) {
        expect(VoiceCommitStatusSchema.safeParse(commitStatus).success).toBe(
          true,
        );
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
        "VoiceCapabilityTokenClaims",
        "VoiceCapabilityTokenEnvelope",
        "VoiceDialogState",
        "VoiceMediaState",
        "VoiceControlOwner",
        "VoiceCommitStatus",
        "VoiceRecordingState",
        "VoiceConfirmationState",
        "VoiceOutcome",
        "VoiceSession",
        "VoiceDraft",
        "VoiceReceiptStatus",
        "VoicePendingReceipt",
        "VoiceSucceededReceipt",
        "VoiceRejectedReceipt",
        "VoiceReceipt",
        "VoiceReceiptRecord",
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

    function transformOpenApiToAjv(schema: any): any {
      if (!schema || typeof schema !== "object") return schema;
      if (Array.isArray(schema)) return schema.map(transformOpenApiToAjv);
      const copy: any = { ...schema };
      if (copy.nullable && copy.type && typeof copy.type === "string") {
        copy.type = [copy.type, "null"];
      }
      for (const [k, v] of Object.entries(copy)) {
        copy[k] = transformOpenApiToAjv(v);
      }
      return copy;
    }

    const openapiDoc = YAML.parse(readFileSync(OPENAPI_PATH, "utf8"));
    for (const [name, schema] of Object.entries(
      openapiDoc.components.schemas,
    )) {
      ajv.addSchema(
        transformOpenApiToAjv(schema),
        `#/components/schemas/${name}`,
      );
    }

    const validateProof = ajv.getSchema("#/components/schemas/VoiceProof")!;
    const validateCapability = ajv.getSchema(
      "#/components/schemas/VoiceCapability",
    )!;
    const validateCapabilityTokenClaims = ajv.getSchema(
      "#/components/schemas/VoiceCapabilityTokenClaims",
    )!;
    const validateCapabilityTokenEnvelope = ajv.getSchema(
      "#/components/schemas/VoiceCapabilityTokenEnvelope",
    )!;
    const validateActor = ajv.getSchema("#/components/schemas/BookingActor")!;
    const validateReceipt = ajv.getSchema("#/components/schemas/VoiceReceipt")!;
    const validateReceiptRecord = ajv.getSchema(
      "#/components/schemas/VoiceReceiptRecord",
    )!;
    const validateSession = ajv.getSchema("#/components/schemas/VoiceSession")!;
    const validateDraft = ajv.getSchema("#/components/schemas/VoiceDraft")!;
    const validateCallback = ajv.getSchema(
      "#/components/schemas/VoiceCallback",
    )!;
    const validateScope = ajv.getSchema(
      "#/components/schemas/VoiceScopeProfile",
    )!;
    const validateCutoff = ajv.getSchema(
      "#/components/schemas/VoiceControlCutoff",
    )!;
    const validateDtmfEvidence = ajv.getSchema(
      "#/components/schemas/VoiceDtmfEvidence",
    )!;

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

    it("OpenAPI accepts capability token with opaque workload servicePrincipalId (svc-api-runtime)", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "svc-api-runtime",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      expect(validateCapability(capability)).toBe(true);
    });

    it("OpenAPI and Zod both reject empty servicePrincipalId in VoiceCapability", () => {
      const capability = {
        aud: "voice-tool-gateway",
        servicePrincipalId: "",
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
        resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        scopes: ["session_execute"],
      };
      expect(VoiceCapabilitySchema.safeParse(capability).success).toBe(false);
      expect(validateCapability(capability)).toBe(false);
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

    it("OpenAPI accepts VoiceReceipt with orderId: null without actionKey for SD §10.2 202 pending response", () => {
      const pendingReceipt = {
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "pending",
        orderId: null,
        nextAction: "query_same_command",
        pollAfterMs: 1000,
      };
      expect(validateReceipt(pendingReceipt)).toBe(true);
    });

    it("OpenAPI accepts succeeded VoiceReceipt with required orderId", () => {
      const succeededReceipt = {
        commandId: "123e4567-e89b-12d3-a456-426614174000",
        status: "succeeded",
        orderId: "123e4567-e89b-12d3-a456-426614174001",
      };
      expect(validateReceipt(succeededReceipt)).toBe(true);
    });

    it("OpenAPI rejects succeeded VoiceReceipt missing orderId or with orderId: null", () => {
      expect(
        validateReceipt({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "succeeded",
        }),
      ).toBe(false);

      expect(
        validateReceipt({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "succeeded",
          orderId: null,
        }),
      ).toBe(false);
    });

    it("OpenAPI rejects VoiceReceipt with status: none", () => {
      expect(
        validateReceipt({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "none",
        }),
      ).toBe(false);
    });

    it("OpenAPI accepts VoiceReceiptRecord with actionKey, commandId, and status", () => {
      expect(
        validateReceiptRecord({
          actionKey: "brand+call+intent+action",
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "pending",
          orderId: null,
        }),
      ).toBe(true);
    });

    it("OpenAPI rejects VoiceReceiptRecord missing actionKey or commandId", () => {
      expect(
        validateReceiptRecord({
          commandId: "123e4567-e89b-12d3-a456-426614174000",
          status: "pending",
        }),
      ).toBe(false);

      expect(
        validateReceiptRecord({
          actionKey: "brand+call+intent+action",
          status: "pending",
        }),
      ).toBe(false);
    });

    it("OpenAPI accepts VoiceCapabilityTokenClaims with iss, aud, exp, and scopes", () => {
      expect(
        validateCapabilityTokenClaims({
          iss: "https://auth.example.com",
          aud: "voice-tool-gateway",
          exp: 1757134800,
          servicePrincipalId: "svc-voice-runtime",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          routeProfileVersion: 1,
          leaseEpoch: 2,
          scopes: ["session_execute"],
        }),
      ).toBe(true);
    });

    it("OpenAPI rejects VoiceCapabilityTokenClaims missing iss or exp", () => {
      expect(
        validateCapabilityTokenClaims({
          aud: "voice-tool-gateway",
          exp: 1757134800,
          servicePrincipalId: "svc-voice-runtime",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          routeProfileVersion: 1,
          leaseEpoch: 2,
          scopes: ["session_execute"],
        }),
      ).toBe(false);

      expect(
        validateCapabilityTokenClaims({
          iss: "https://auth.example.com",
          aud: "voice-tool-gateway",
          servicePrincipalId: "svc-voice-runtime",
          voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          routeProfileVersion: 1,
          leaseEpoch: 2,
          scopes: ["session_execute"],
        }),
      ).toBe(false);
    });

    it("OpenAPI accepts VoiceCapabilityTokenEnvelope with token, expiresIn, and claims", () => {
      expect(
        validateCapabilityTokenEnvelope({
          token: "valid-token-string",
          expiresIn: 3600,
          claims: {
            iss: "https://auth.example.com",
            aud: "voice-tool-gateway",
            exp: 1757134800,
            servicePrincipalId: "svc-voice-runtime",
            voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
            resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
            routeProfileVersion: 1,
            leaseEpoch: 2,
            scopes: ["session_execute"],
          },
        }),
      ).toBe(true);
    });

    it("OpenAPI accepts valid single DTMF digits and rejects empty or multi-character digits", () => {
      for (const digit of ["0", "1", "9", "*", "#", "A", "D"]) {
        expect(
          validateDtmfEvidence({
            eventId: "123e4567-e89b-12d3-a456-426614174008",
            digit,
          }),
        ).toBe(true);
      }

      for (const digit of ["", "12", " ", "**", "invalid"]) {
        expect(
          validateDtmfEvidence({
            eventId: "123e4567-e89b-12d3-a456-426614174008",
            digit,
          }),
        ).toBe(false);
      }
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

    it("OpenAPI accepts VoiceSession with real CallcenterService callId (CALL-20260410-000001)", () => {
      const session = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "CALL-20260410-000001",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "collecting",
        mediaState: "active",
      };
      expect(validateSession(session)).toBe(true);
    });

    it("OpenAPI and Zod both reject empty callId in VoiceSession", () => {
      const session = {
        voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
        callId: "",
        scope: {
          resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
          brandId: "brand-1",
          operatingProfileId: "op-1",
          operatingProfileVersion: 1,
        },
        dialogState: "collecting",
        mediaState: "active",
      };
      expect(VoiceSessionSchema.safeParse(session).success).toBe(false);
      expect(validateSession(session)).toBe(false);
    });

    it("ensures VoiceDraft parity between Zod schema and OpenAPI Ajv validator for all slot value types", () => {
      const baseDraft = {
        intentId: "123e4567-e89b-12d3-a456-426614174000",
        draftVersion: 2,
        sourceTurnIds: ["123e4567-e89b-12d3-a456-426614174001"],
        sourceSegmentIds: ["seg-1"],
        providerConfidence: 0.95,
        validationState: "validated",
        confirmedByCustomerAt: null,
      };

      const testCases: Array<{
        name: string;
        rawText?: string;
        normalizedValue?: unknown;
      }> = [
        {
          name: "structured address object",
          rawText: "台北車站東三門",
          normalizedValue: {
            placeId: "poi-123",
            formattedAddress: "台北市中正區北平西路3號",
          },
        },
        {
          name: "passenger count number",
          rawText: "3位",
          normalizedValue: 3,
        },
        {
          name: "phone string",
          rawText: "0912345678",
          normalizedValue: "+886912345678",
        },
        {
          name: "null normalized value",
          rawText: "待確認",
          normalizedValue: null,
        },
        {
          name: "omitted normalized value",
          rawText: "未提供",
        },
      ];

      for (const tc of testCases) {
        const draft = {
          ...baseDraft,
          ...(tc.rawText !== undefined ? { rawText: tc.rawText } : {}),
          ...(tc.normalizedValue !== undefined
            ? { normalizedValue: tc.normalizedValue }
            : {}),
        };

        const zodResult = VoiceDraftSchema.safeParse(draft);
        const ajvValid = validateDraft(draft);

        expect(
          zodResult.success,
          `Zod should accept VoiceDraft with ${tc.name}`,
        ).toBe(true);
        expect(
          ajvValid,
          `OpenAPI Ajv should accept VoiceDraft with ${tc.name}`,
        ).toBe(true);
      }
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
