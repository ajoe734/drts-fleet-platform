import { describe, it, expect, afterEach } from "vitest";
import {
  VOICE_MEDIA_INTERNAL_KEY_HEADER,
  VoiceMediaAuthError,
  verifyVoiceMediaCaller,
} from "../../../apps/voice-media-worker/src/server/internal-auth";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("AUDIT-VOICE-RUNTIME-20261002: voice-media-worker internal caller auth", () => {
  afterEach(resetEnv);

  describe("non-strict environment (local/dev/test)", () => {
    it("allows requests through when no key is configured, matching InternalKeyMiddleware's dev bypass", () => {
      process.env.NODE_ENV = "test";
      expect(() =>
        verifyVoiceMediaCaller({}, { configuredKey: undefined }),
      ).not.toThrow();
    });

    it("still rejects a wrong key once a key IS configured, even in a non-strict environment", () => {
      process.env.NODE_ENV = "test";
      expect(() =>
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "wrong" },
          { configuredKey: "right-key" },
        ),
      ).toThrow(VoiceMediaAuthError);
    });
  });

  describe("strict environment (staging/production)", () => {
    it("fails closed with 503 when no key is configured at all", () => {
      process.env.DRTS_ENV = "production";
      let caught: unknown;
      try {
        verifyVoiceMediaCaller({}, { configuredKey: undefined });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(VoiceMediaAuthError);
      expect((caught as VoiceMediaAuthError).statusCode).toBe(503);
      expect((caught as VoiceMediaAuthError).code).toBe(
        "VOICE_MEDIA_INTERNAL_KEY_NOT_CONFIGURED",
      );
    });

    it("rejects with 401 when the header is missing", () => {
      process.env.DRTS_ENV = "staging";
      let caught: unknown;
      try {
        verifyVoiceMediaCaller({}, { configuredKey: "secret-key" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(VoiceMediaAuthError);
      expect((caught as VoiceMediaAuthError).statusCode).toBe(401);
      expect((caught as VoiceMediaAuthError).code).toBe(
        "VOICE_MEDIA_INTERNAL_KEY_REQUIRED",
      );
    });

    it("rejects with 401 when the header does not match the configured key", () => {
      process.env.DRTS_ENV = "production";
      let caught: unknown;
      try {
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "nope" },
          { configuredKey: "secret-key" },
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(VoiceMediaAuthError);
      expect((caught as VoiceMediaAuthError).statusCode).toBe(401);
      expect((caught as VoiceMediaAuthError).code).toBe(
        "VOICE_MEDIA_INTERNAL_KEY_INVALID",
      );
    });

    it("accepts a matching key", () => {
      process.env.DRTS_ENV = "production";
      expect(() =>
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "secret-key" },
          { configuredKey: "secret-key" },
        ),
      ).not.toThrow();
    });

    it("accepts the previous key during a rotation window", () => {
      process.env.DRTS_ENV = "production";
      expect(() =>
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "old-key" },
          { configuredKey: "new-key", previousKey: "old-key" },
        ),
      ).not.toThrow();
    });

    it("does not throw on a key of different length than expected (no RangeError from timingSafeEqual)", () => {
      process.env.DRTS_ENV = "production";
      let caught: unknown;
      try {
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "short" },
          { configuredKey: "a-much-longer-configured-secret-key" },
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(VoiceMediaAuthError);
      expect((caught as VoiceMediaAuthError).statusCode).toBe(401);
    });

    it("treats a multi-value header as its first value, mirroring InternalKeyMiddleware's normalizeHeaderValue", () => {
      process.env.DRTS_ENV = "production";
      expect(() =>
        verifyVoiceMediaCaller(
          { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: ["secret-key", "other"] },
          { configuredKey: "secret-key" },
        ),
      ).not.toThrow();
    });
  });
});
