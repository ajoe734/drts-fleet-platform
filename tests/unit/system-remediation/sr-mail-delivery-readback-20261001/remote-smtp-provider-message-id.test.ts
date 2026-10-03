import { describe, expect, it } from "vitest";

import { extractProviderMessageId } from "../../../../apps/api/src/modules/notification-delivery/remote-smtp-mail.transport";

// Pure extraction-logic coverage for the Gmail/queued-as providerMessageId
// formats, calling the real exported function directly. No transport,
// nodemailer mock, socket, or TLS listener is involved.
const alwaysSafe = () => true;

describe("SR-MAIL-DELIVERY-READBACK-20261001 provider message id extraction", () => {
  it("extracts providerMessageId from the classic 'queued as <id>' reply", () => {
    expect(
      extractProviderMessageId(
        "250 2.0.0 queued as provider-queue-001",
        alwaysSafe,
      ),
    ).toBe("provider-queue-001");
  });

  it("extracts providerMessageId from Gmail's '250 2.0.0 OK <epoch> <id> - gsmtp' reply, which carries no 'queued as' token", () => {
    expect(
      extractProviderMessageId(
        "250 2.0.0 OK  1696150000 d9-20020a170902bd8900b001234567890asi1234567plh.100 - gsmtp",
        alwaysSafe,
      ),
    ).toBe("d9-20020a170902bd8900b001234567890asi1234567plh.100");
  });

  it("extracts providerMessageId from a Gmail reply with a single leading space before OK", () => {
    expect(
      extractProviderMessageId(
        "250 2.0.0 OK 1696150001 abcDEF123.xyz-456 - gsmtp",
        alwaysSafe,
      ),
    ).toBe("abcDEF123.xyz-456");
  });

  it("keeps providerMessageId null for an unrecognized acceptance reply instead of guessing", () => {
    expect(
      extractProviderMessageId("250 OK message accepted", alwaysSafe),
    ).toBeNull();
  });

  it("keeps providerMessageId null for an empty or plain '250 OK' reply", () => {
    expect(extractProviderMessageId("250 OK", alwaysSafe)).toBeNull();
    expect(extractProviderMessageId("", alwaysSafe)).toBeNull();
  });

  it("never surfaces a candidate that the caller's safety check rejects (e.g. it echoes a redacted credential)", () => {
    const rejectsEverything = () => false;
    expect(
      extractProviderMessageId(
        "250 2.0.0 queued as provider-queue-001",
        rejectsEverything,
      ),
    ).toBeNull();
    expect(
      extractProviderMessageId(
        "250 2.0.0 OK  1696150000 d9-abc123 - gsmtp",
        rejectsEverything,
      ),
    ).toBeNull();
  });

  it("prefers the 'queued as' token over a coincidental gsmtp-shaped suffix when both patterns could match", () => {
    expect(
      extractProviderMessageId(
        "250 2.0.0 queued as real-queue-id (relayed via some-host - gsmtp)",
        alwaysSafe,
      ),
    ).toBe("real-queue-id");
  });
});
