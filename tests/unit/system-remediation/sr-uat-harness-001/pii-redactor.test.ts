import { describe, it, expect } from "vitest";
import {
  redactPii,
  redactObject,
} from "../../../e2e/system-remediation/shared/pii-redactor";

describe("SR-UAT-HARNESS-001: PII De-identification and Redaction", () => {
  it("redacts email addresses while preserving initial character and domain", () => {
    expect(redactPii("Contact user at admin@acme.example for details")).toBe(
      "Contact user at a***@acme.example for details",
    );
    expect(redactPii("john.doe+service@partner.org")).toBe("j***@partner.org");
  });

  it("redacts Taiwan mobile and landline phone numbers", () => {
    expect(redactPii("Driver mobile: 0912-345-678.")).toBe(
      "Driver mobile: 0912-***-678.",
    );
    expect(redactPii("Driver mobile: 0912345678.")).toBe(
      "Driver mobile: 0912-***-678.",
    );
    expect(redactPii("Office phone: 02-2700-9999.")).toBe(
      "Office phone: 02-***-9999.",
    );
  });

  it("redacts Taiwan National IDs", () => {
    expect(redactPii("Citizen ID is A123456789.")).toBe(
      "Citizen ID is A12***789.",
    );
    expect(redactPii("Passport/National ID F298765432 processed.")).toBe(
      "Passport/National ID F29***432 processed.",
    );
  });

  it("redacts Bearer tokens and sensitive key-value pairs", () => {
    expect(redactPii("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test")).toBe(
      "Authorization: Bearer [REDACTED_TOKEN]",
    );
    expect(redactPii("https://api.drts.internal/v1/auth?token=abc123xyz")).toBe(
      "https://api.drts.internal/v1/auth?token=[REDACTED]",
    );
    expect(redactPii('{"password":"mySecretPassword123"}')).toBe(
      '{"password":"[REDACTED]"}',
    );
  });

  it("redacts bank and credit card numbers", () => {
    expect(redactPii("Card: 4111-2222-3333-4444 on file")).toBe(
      "Card: ****-****-****-**** on file",
    );
  });

  it("recursively redacts complex objects and arrays", () => {
    const rawPayload = {
      tenant: "Acme",
      email: "billing@acme.example",
      admin: {
        phone: "0988-111-222",
        rocId: "B123456789",
        password: "plainTextPassword!",
        nestedList: [
          { contact: "0922-333-444", token: "secret-abc" },
          "Report recipient: ops@acme.example",
        ],
      },
    };

    const sanitized = redactObject(rawPayload) as any;

    expect(sanitized.email).toBe("b***@acme.example");
    expect(sanitized.admin.phone).toBe("0988-***-222");
    expect(sanitized.admin.rocId).toBe("B12***789");
    expect(sanitized.admin.password).toBe("[REDACTED]");
    expect(sanitized.admin.nestedList[0].contact).toBe("0922-***-444");
    expect(sanitized.admin.nestedList[0].token).toBe("[REDACTED]");
    expect(sanitized.admin.nestedList[1]).toBe(
      "Report recipient: o***@acme.example",
    );
  });
});
