import { describe, expect, it } from "vitest";

import {
  REDACTION_MARKER,
  findResidualSecrets,
  isSecretObjectKey,
  redactText,
  redactValue,
  summarizeCredentialIssuance,
} from "../../src/modules/platform-admin-assistant/platform-admin-assistant.redaction";

describe("redactText", () => {
  it("removes OpenAI provider keys", () => {
    const result = redactText(
      "set LLM_GATEWAY_API_KEY then use sk-proj-AbCdEf0123456789ZyXwVuTs to call",
    );
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("sk-proj-AbCdEf0123456789ZyXwVuTs");
    expect(result.text).toContain(REDACTION_MARKER.slice(0, 9));
  });

  it("removes Anthropic provider keys", () => {
    const result = redactText("key=sk-ant-api03-aaaaaaaaaaaaaaaaaaaa");
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("sk-ant-api03-aaaaaaaaaaaaaaaaaaaa");
  });

  it("redacts key=value style secrets while keeping the key name", () => {
    const result = redactText("LLM_GATEWAY_API_KEY=super-secret-value-123456");
    expect(result.text).toContain("LLM_GATEWAY_API_KEY");
    expect(result.text).not.toContain("super-secret-value-123456");
    expect(result.text).toContain("[REDACTED:keyed_secret]");
  });

  it("redacts webhook signing secrets", () => {
    const result = redactText("rotate to whsec_abcdEFGH12345678ZZZZ now");
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("whsec_abcdEFGH12345678ZZZZ");
  });

  it("redacts partner plaintext-once credential shapes", () => {
    const tk = redactText("issued tk_0123456789abcdef0123 to partner");
    expect(tk.text).not.toContain("tk_0123456789abcdef0123");

    const live = redactText("the key acme_live_AbCd1234EfGh5678 is shown once");
    expect(live.text).not.toContain("acme_live_AbCd1234EfGh5678");
  });

  it("redacts bearer tokens but keeps the scheme word", () => {
    const result = redactText(
      "Authorization: Bearer abcdef.ghijkl.mnopqr012345",
    );
    expect(result.text).toContain("Bearer");
    expect(result.text).not.toContain("abcdef.ghijkl.mnopqr012345");
  });

  it("redacts JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1Ni1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4f";
    const result = redactText(`token ${jwt} returned`);
    expect(result.text).not.toContain(jwt);
  });

  it("redacts long secret-like hex/base64 tokens", () => {
    const hex = "a".repeat(40);
    expect(redactText(`val ${hex}`).text).not.toContain(hex);
  });

  it("leaves ordinary operational text untouched", () => {
    const text = "Tenant ACME is in rollout stage staging with 3 modules.";
    const result = redactText(text);
    expect(result.redacted).toBe(false);
    expect(result.text).toBe(text);
  });
});

describe("isSecretObjectKey", () => {
  it("flags secret-bearing keys", () => {
    for (const key of [
      "apiKey",
      "api_key",
      "plaintextKey",
      "webhookSecret",
      "password",
      "providerKey",
      "authorization",
    ]) {
      expect(isSecretObjectKey(key)).toBe(true);
    }
  });

  it("does not flag derived/safe keys that merely mention a secret word", () => {
    for (const key of [
      "credentialId",
      "apiKeyHash",
      "keyPrefix",
      "maskedSuffix",
      "credential_issued",
      "secretName",
      "auditId",
      "tokenType",
    ]) {
      expect(isSecretObjectKey(key)).toBe(false);
    }
  });
});

describe("redactValue", () => {
  it("recursively redacts secret-bearing object keys and string values", () => {
    const result = redactValue({
      sessionId: "sess-1",
      apiKey: "sk-proj-shouldNotSurvive012345",
      nested: {
        plaintextKey: "tk_0123456789abcdef0123",
        note: "paste sk-ant-api03-zzzzzzzzzzzzzzzzzzzz here",
      },
      credentialId: "cred-9",
      list: [{ password: "hunter2-very-secret-value" }],
    });

    expect(result.redacted).toBe(true);
    const value = result.value as Record<string, any>;
    expect(value.sessionId).toBe("sess-1");
    expect(value.credentialId).toBe("cred-9");
    expect(value.apiKey).toBe(REDACTION_MARKER);
    expect(value.nested.plaintextKey).toBe(REDACTION_MARKER);
    expect(value.nested.note).not.toContain(
      "sk-ant-api03-zzzzzzzzzzzzzzzzzzzz",
    );
    expect(value.list[0].password).toBe(REDACTION_MARKER);
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "sk-proj-AbCdEf0123456789ZyXwVuTs" };
    redactValue(input);
    expect(input.apiKey).toBe("sk-proj-AbCdEf0123456789ZyXwVuTs");
  });
});

describe("summarizeCredentialIssuance (partner plaintext-once)", () => {
  it("keeps non-secret metadata and drops the plaintext key entirely", () => {
    const summary = summarizeCredentialIssuance({
      credential: {
        credentialId: "PIC-001",
        keyPrefix: "acme_live_",
        maskedSuffix: "***1234",
        auditId: "audit-cred-1",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
      plaintextKey: "acme_live_AbCd1234EfGh5678IjKl",
    });

    expect(summary).toEqual({
      credential_issued: true,
      credentialId: "PIC-001",
      keyPrefix: "acme_live_",
      maskedSuffix: "***1234",
      auditId: "audit-cred-1",
      createdAt: "2026-06-02T00:00:00.000Z",
    });

    expect(findResidualSecrets(summary)).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(
      "acme_live_AbCd1234EfGh5678IjKl",
    );
  });
});

describe("findResidualSecrets", () => {
  it("reports paths where plaintext secrets survived", () => {
    const leaky = {
      transcript: {
        plaintextKey: "tk_0123456789abcdef0123",
        text: "remember sk-proj-AbCdEf0123456789ZyXwVuTs",
      },
    };
    const offenders = findResidualSecrets(leaky);
    expect(offenders).toContain("transcript.plaintextKey");
    expect(offenders).toContain("transcript.text");
  });

  it("reports nothing for an already-redacted payload", () => {
    const clean = redactValue({
      plaintextKey: "tk_0123456789abcdef0123",
      note: "no secrets here",
    });
    expect(findResidualSecrets(clean.value)).toEqual([]);
  });
});
