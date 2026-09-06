import { describe, it, expect } from "vitest";
import {
  BookingActorSchema,
  VoiceProofSchema,
  VoiceCapabilitySchema,
} from "../../packages/contracts/src/unattended-voice";

describe("UV-EXEC-001 Voice Contracts", () => {
  it("rejects fake agentId in voice_agent actor", () => {
    const result = BookingActorSchema.safeParse({
      type: "voice_agent",
      agentId: "fake-agent-id",
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

  it("rejects URL or SQL or arbitrary actor in capability", () => {
    const capability = {
      aud: "voice-tool-gateway",
      servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
      voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
      resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
      routeProfileVersion: 1,
      leaseEpoch: 2,
      scopes: ["session_execute"],
      url: "http://hacker.com", // should be rejected by strict
    };
    const result = VoiceCapabilitySchema.safeParse(capability);
    expect(result.success).toBe(false);
  });

  it("accepts valid capability", () => {
    const capability = {
      aud: "voice-tool-gateway",
      servicePrincipalId: "123e4567-e89b-12d3-a456-426614174000",
      voiceSessionId: "123e4567-e89b-12d3-a456-426614174001",
      resourceScopeId: "123e4567-e89b-12d3-a456-426614174002",
      routeProfileVersion: 1,
      leaseEpoch: 2,
      scopes: ["session_execute"],
    };
    const result = VoiceCapabilitySchema.safeParse(capability);
    expect(result.success).toBe(true);
  });

  it("validates speech proof", () => {
    const proof = {
      confirmationId: "123e4567-e89b-12d3-a456-426614174000",
      voiceSessionId: "123e4567-e89b-12d3-a456-426614174000",
      intentId: "123e4567-e89b-12d3-a456-426614174000",
      action: "create_order",
      draftVersion: 1,
      snapshotHash: "hash123",
      readbackPlaybackId: "123e4567-e89b-12d3-a456-426614174000",
      readbackCompletedEventId: "123e4567-e89b-12d3-a456-426614174000",
      inputEpoch: 1,
      controlCutoff: { mediaEpoch: 1, controlSequence: 1 },
      leaseEpoch: 1,
      recordingCheckpointId: "123e4567-e89b-12d3-a456-426614174000",
      confirmedAt: "2026-09-06T00:00:00.000Z",
      expiresAt: "2026-09-06T00:00:00.000Z",
      confirmationMethod: "speech",
      evidence: {
        turnId: "123e4567-e89b-12d3-a456-426614174000",
        finalEventId: "123e4567-e89b-12d3-a456-426614174000",
      },
    };
    const result = VoiceProofSchema.safeParse(proof);
    expect(result.success).toBe(true);
  });
});
