import { describe, expect, it, vi } from "vitest";
import {
  VoiceBookingCommandService,
  voiceCommandPayloadHash,
} from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { prepareVoiceOrder } from "../../apps/api/src/modules/owned-mobility/voice-order-preparation";
import { voiceCommandFixture } from "../support/voice-booking-command-fixture";

function replayHarness(status: "pending" | "succeeded" | "rejected") {
  const f = voiceCommandFixture();
  const receipt = {
    commandId: "command",
    intentId: f.request.intentId,
    payloadHash: voiceCommandPayloadHash(f.request),
    status,
    orderId: status === "succeeded" ? "order" : null,
  };
  const repository = {
    findSessionById: vi.fn(async () => ({
      ...f.authority,
      callId: f.callId,
      dialogState: "closed",
      controlOwner: "human",
    })),
    findIntentById: vi.fn(async () => ({
      voiceSessionId: f.request.voiceSessionId,
    })),
    findResourceScopeById: vi.fn(async () => ({
      brandId: f.authority.brandId,
    })),
    findReceiptByActionKey: vi.fn(async () => receipt),
    findReceiptById: vi.fn(async () => receipt),
    findActiveConfirmation: vi.fn(() => {
      throw new Error("ticket consumed");
    }),
  };
  const access = {
    authorizeRead: vi.fn(async () => f.authority),
    authorizeAccept: vi.fn(() => {
      throw new Error("expired worker");
    }),
    credentialForCommand: vi.fn(() => {
      throw new Error("not needed");
    }),
  };
  const commands = new VoiceBookingCommandService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    access,
  );
  return { ...f, repository, access, commands, receipt };
}

describe("UV-EXEC-015 command boundary", () => {
  it("recovers a receipt committed while another request was preparing", async () => {
    const h = replayHarness("succeeded");
    h.repository.findReceiptByActionKey.mockResolvedValueOnce(null as never);
    expect(await h.commands.accept("reader", h.request)).toEqual(h.receipt);
    expect(h.access.authorizeAccept).toHaveBeenCalledOnce();
    expect(h.repository.findReceiptByActionKey).toHaveBeenCalledTimes(2);
  });
  it.each(["pending", "succeeded", "rejected"] as const)(
    "replays %s before consumed/expired ticket or owner validation",
    async (status) => {
      const h = replayHarness(status);
      expect(await h.commands.accept("reader", h.request)).toEqual(h.receipt);
      expect(h.access.authorizeAccept).not.toHaveBeenCalled();
      expect(h.repository.findActiveConfirmation).not.toHaveBeenCalled();
    },
  );
  it("rejects a changed confirmation or snapshot without hiding the original command locator", async () => {
    const h = replayHarness("succeeded");
    for (const patch of [
      { confirmationId: "different" },
      { snapshotHash: "different" },
      { draftVersion: 2 },
    ])
      await expect(
        h.commands.accept("reader", { ...h.request, ...patch }),
      ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
    expect(
      await h.commands.query(
        "reader",
        h.request.voiceSessionId,
        h.request.intentId,
      ),
    ).toEqual(h.receipt);
  });
  it("authorizes even a terminal receipt and denies cross-brand reads", async () => {
    const h = replayHarness("succeeded");
    h.access.authorizeRead.mockResolvedValueOnce({
      ...h.authority,
      brandId: "other-brand",
    });
    await expect(h.commands.accept("reader", h.request)).rejects.toMatchObject({
      code: "VOICE_SCOPE_FORBIDDEN",
    });
    expect(h.repository.findReceiptByActionKey).not.toHaveBeenCalled();
  });
  it("does not put transport lease or session revisions into the business hash", () => {
    const h = replayHarness("pending");
    expect(
      voiceCommandPayloadHash({
        ...h.request,
        sessionVersion: 99,
        leaseEpoch: 99,
      }),
    ).toBe(h.receipt.payloadHash);
  });
  it.each(["succeeded", "rejected"] as const)(
    "executor returns %s without provider access",
    async (status) => {
      const h = replayHarness(status);
      expect(
        await new VoiceCommandRunnerService(h.commands, {} as never).execute(
          "command",
        ),
      ).toEqual(h.receipt);
      expect(h.access.credentialForCommand).not.toHaveBeenCalled();
    },
  );
  it("maps only the confirmed snapshot, trusted actor and immutable evidence into a new order", () => {
    const f = voiceCommandFixture();
    const before = structuredClone(f.snapshot);
    const order = prepareVoiceOrder({
      commandId: "command",
      callId: f.callId,
      intentId: f.request.intentId,
      resourceScopeId: f.scopeId,
      confirmationId: f.request.confirmationId,
      recordingId: "recording",
      checkpointId: f.checkpointId,
      actorId: f.authority.actorId,
      snapshotHash: f.request.snapshotHash,
      snapshot: f.snapshot,
    });
    expect(order.orderSource).toBe("phone");
    expect(order.bookingActor).toEqual({
      type: "voice_agent",
      actorId: "voice-principal",
    });
    expect(order.passenger).toEqual(
      f.snapshot.bookingRequirements.passengerContact,
    );
    expect(order.recordingEvidenceRef).toBe(f.checkpointId);
    expect(order.voiceIntentId).toBe(f.request.intentId);
    expect(order.aggregateVersion).toBe(1);
    expect(f.snapshot).toEqual(before);
  });
});
