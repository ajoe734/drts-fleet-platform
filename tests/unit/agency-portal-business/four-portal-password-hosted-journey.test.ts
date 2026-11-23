import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TotpCodeReplayedError,
  TotpService,
} from "../../../apps/api/src/modules/auth/totp.service";
import { TotpCredentialRepository } from "../../../apps/api/src/modules/auth/totp-credential.repository";
import {
  SIMULATED_AUTHENTICATOR_DEVICE_LABEL,
  SimulatedTotpAuthenticatorDevice,
  assertNoLeakedSecretsInEvidence,
  buildFourPortalHostedJourneyClassification,
  extractInvitationLink,
  extractPasswordResetTarget,
  redactHostedJourneySecrets,
} from "../../e2e/agency-portal-business/totp-authenticator-fixture";

const TEST_JWT_SECRET = "unit-test-four-portal-password-hosted-journey-secret";
const TEST_PEPPER_JSON = JSON.stringify({
  v1: "unit-test-four-portal-password-pepper-v1",
});
const TEST_TOTP_KEYS_JSON = JSON.stringify({
  activeKeyId: "v1",
  keys: {
    v1: Buffer.alloc(32, 0x42).toString("base64"),
  },
});

describe("FOUR-PORTAL-PASSWORD-HOSTED-JOURNEY-20261123: fixture authenticator, evidence redaction & real-surface classification", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
    vi.stubEnv("JWT_ISSUER", "drts-local");
    vi.stubEnv("JWT_AUDIENCE", "drts-api");
    vi.stubEnv("PASSWORD_PEPPER_SECRETS_JSON", TEST_PEPPER_JSON);
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");
    vi.stubEnv("TOTP_ENCRYPTION_KEYS_JSON", TEST_TOTP_KEYS_JSON);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("verifies 3 consecutive RFC 6238 TOTP codes (confirm, initial MFA login, post-reset MFA login) through real TotpService without 30s sleeps and rejects replay", async () => {
    vi.useFakeTimers();
    let fakeNowMs = 1_795_000_005_000;
    vi.setSystemTime(fakeNowMs);

    try {
      const totpRepository = new TotpCredentialRepository();
      const totpService = new TotpService(totpRepository);
      const device = new SimulatedTotpAuthenticatorDevice();
      expect(device.deviceLabel).toBe(SIMULATED_AUTHENTICATOR_DEVICE_LABEL);

      const principalId = `principal_totp_fixture_${randomUUID()}`;
      const enrollment = await totpService.enroll(
        principalId,
        "disposable.user@hosted.example",
      );
      expect(enrollment.secret).toBeTruthy();
      expect(enrollment.otpauthUri).toContain("otpauth://totp/");

      const waitCalls: number[] = [];
      const options = {
        nowMs: () => fakeNowMs,
        waitFn: async (ms: number) => {
          waitCalls.push(ms);
          fakeNowMs += ms;
          vi.setSystemTime(fakeNowMs);
        },
      };

      // 1. Confirm enrollment (`nowStep - 1`)
      const confirmCode = await device.nextCode(enrollment.secret, options);
      const confirmed = await totpService.confirm(
        principalId,
        confirmCode.code,
      );
      expect(confirmed.recoveryCodes).toHaveLength(10);

      // Replaying the exact same confirm code must fail with TotpCodeReplayedError.
      await expect(
        totpService.verifyLoginCode(principalId, confirmCode.code),
      ).rejects.toBeInstanceOf(TotpCodeReplayedError);

      // 2. First MFA login (`nowStep`)
      const firstLoginCode = await device.nextCode(enrollment.secret, options);
      expect(firstLoginCode.step).toBeGreaterThan(confirmCode.step);
      await expect(
        totpService.verifyLoginCode(principalId, firstLoginCode.code),
      ).resolves.toBeUndefined();

      // 3. Post-password-reset MFA login (`nowStep + 1`)
      const postResetLoginCode = await device.nextCode(
        enrollment.secret,
        options,
      );
      expect(postResetLoginCode.step).toBeGreaterThan(firstLoginCode.step);
      await expect(
        totpService.verifyLoginCode(principalId, postResetLoginCode.code),
      ).resolves.toBeUndefined();
      expect(waitCalls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("extracts invitation and password-reset targets and redacts all credentials, tokens, QR/otpauth URIs, secrets, recovery codes, cookies and JWTs", () => {
    const rawInviteToken = "ti_abcdefghijklmnopqrstuvwxyz0123456789";
    const inviteMail = [
      "Hello Hosted Tenant User,",
      "",
      `Accept your invitation: http://localhost:3213/invite?token=${rawInviteToken}`,
      "This invitation expires at 2026-11-24T00:00:00.000Z.",
    ].join("\n");

    const extractedInvite = extractInvitationLink(
      inviteMail,
      "http://localhost:3213/invite",
    );
    expect(extractedInvite.acceptUrl).toBe(
      `http://localhost:3213/invite?token=${rawInviteToken}`,
    );
    expect(extractedInvite.redactedAcceptUrl).toBe(
      "http://localhost:3213/invite?token=%5BREDACTED_INVITATION_TOKEN%5D",
    );

    const rawResetToken = "prt_ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210";
    const resetMail = [
      "Hello,",
      "",
      `Reset your password: http://localhost:3213/reset-password?token=${rawResetToken}`,
    ].join("\n");
    const extractedReset = extractPasswordResetTarget(
      resetMail,
      "http://localhost:3213",
    );
    expect(extractedReset.resetUrl).toBe(
      `http://localhost:3213/reset-password?token=${rawResetToken}`,
    );
    expect(() =>
      extractPasswordResetTarget(resetMail, "http://localhost:3215"),
    ).toThrow();
    expect(() =>
      extractPasswordResetTarget(
        "Password reset code: " + rawResetToken,
        "http://localhost:3213",
      ),
    ).toThrow();
    expect(() =>
      extractInvitationLink(inviteMail, "http://localhost:3215/invite"),
    ).toThrow();

    const rawSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const rawPassword = "InitialDisposablePassword!2026";
    const rawRecoveryCode = "ABCD-EF23";
    const rawJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcmluY2lwYWxfMSIsInJlYWxtIoidGVuYW50In0.signature1234567890";

    const unredactedEvidence = {
      inviteLink: `http://localhost:3213/invite?token=${rawInviteToken}`,
      resetLink: `http://localhost:3213/reset-password?token=${rawResetToken}`,
      otpauthUri: `otpauth://totp/DRTS:user@example.com?secret=${rawSecret}&issuer=DRTS`,
      secret: rawSecret,
      password: rawPassword,
      recoveryCodes: [rawRecoveryCode],
      cookie: `drts_tenant_session=${rawJwt}; HttpOnly`,
      nestedNote: `Used ${rawPassword} with ${rawSecret} and ${rawRecoveryCode} and ${rawJwt}`,
    };

    const redacted = redactHostedJourneySecrets(unredactedEvidence, [
      rawSecret,
      rawPassword,
      rawRecoveryCode,
      rawInviteToken,
      rawResetToken,
      rawJwt,
    ]);
    const serialized = JSON.stringify(redacted);

    expect(() =>
      assertNoLeakedSecretsInEvidence(serialized, [
        rawSecret,
        rawPassword,
        rawRecoveryCode,
        rawInviteToken,
        rawResetToken,
        rawJwt,
      ]),
    ).not.toThrow();

    const classification = buildFourPortalHostedJourneyClassification();
    expect(classification.acceptanceKey).toBe(
      "four_portal_password_hosted_rehearsal_and_real_surface_readback_classified",
    );
    expect(
      classification.fourPortalScopes.enterpriseDispatchWeb
        .inventsSeparateInvitationUri,
    ).toBe(false);
    expect(
      classification.sharedDevExistingPasswordLoginEvidence.deployDevRuns,
    ).toEqual(["44019618638", "44476190461", "44610538859"]);
    expect(classification.sharedDevExistingPasswordLoginEvidence.headSha).toBe(
      "134df5cc4a436dce36fd2359f089217665d10b80",
    );
    expect(
      classification.separateExternalAndSharedDevFormalAcceptance.trackedItems.map(
        (item) => item.id,
      ),
    ).toEqual(["PWD-LOGIN-012", "FLEET-ONB-009"]);
  });
});

describe("GitHub-hosted bureau runner configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the original Agency login and API for both journeys and enables only the three additional portal hosts for password rehearsal", async () => {
    async function config(enabled: boolean) {
      vi.stubEnv("DRTS_FOUR_PORTAL_PASSWORD_JOURNEY", String(enabled));
      vi.resetModules();
      return (await import("../../../playwright.agency-portal-business.config"))
        .default;
    }

    const original = await config(false);
    const password = await config(true);
    expect(original.testMatch).toEqual(/agency-portal-business\.spec\.ts$/);
    expect(password.testMatch).toEqual(
      /four-portal-password-journey\.spec\.ts$/,
    );
    expect(Array.isArray(original.webServer) && original.webServer.length).toBe(
      2,
    );
    expect(Array.isArray(password.webServer) && password.webServer.length).toBe(
      5,
    );
    if (
      !Array.isArray(original.webServer) ||
      !Array.isArray(password.webServer)
    )
      throw new Error("Expected web servers");
    for (const suite of [original.webServer, password.webServer]) {
      expect(suite[0]?.url).toBe("http://127.0.0.1:3141/health");
      expect(suite[0]?.env?.API_PORT).toBe("3141");
      expect(suite[0]?.env?.MAILPIT_SMTP_PORT).toBe("2526");
      expect(suite[0]?.env?.AUTH_MODE).toBe("test");
      expect(suite[0]?.env?.OIDC_MOCK_MODE).toBe("true");
    }
    expect(password.webServer[1]?.url).toBe(original.webServer[1]?.url);
    expect(password.webServer[1]?.command).toBe(original.webServer[1]?.command);
    expect(password.webServer[1]?.env?.NEXT_PUBLIC_API_URL).toBe("/api/agency");
    expect(password.webServer.slice(2).map((server) => server.url)).toEqual([
      "http://localhost:3213/login",
      "http://localhost:3214/login",
      "http://localhost:3215/login",
    ]);
    expect(password.outputDir).not.toContain(".artifacts/");
    expect(
      password.webServer[0]?.env?.NOTIFICATION_OUTBOX_DIRECTORY,
    ).not.toContain(".artifacts/");
  });
});
