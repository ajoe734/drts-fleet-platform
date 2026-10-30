import { describe, expect, it } from "vitest";
import { actualOriginalFlow } from "./fleet-incident-test-fixture";

describe("C067 actual original incident producer to existing Fleet consumer", () => {
  it("the real Incident controller/service already creates and reads the same original incident and Ops timeline", async () => {
    const { ops, created, auditIO } = await actualOriginalFlow();
    const detail = await ops.getIncident(created.incidentId);
    const timeline = await ops.getTimeline(created.incidentId);
    expect(detail.data.item).toMatchObject({
      incidentId: created.incidentId,
      relatedOrderId: "unit-original-order-C067",
      relatedDriverId: "unit-original-driver-C067",
      status: "open",
      assignedTo: null,
      relatedComplaintCaseNo: null,
    });
    expect(timeline.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incidentId: created.incidentId,
          action: "incident_created",
        }),
      ]),
    );
    expect(auditIO.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "create_incident",
        resourceId: created.incidentId,
      }),
    );
  });
  it("the original incident for an attributable own order appears in the existing Fleet case list", async () => {
    const { fleet, created, attributionIO } = await actualOriginalFlow();
    expect(
      await attributionIO.resolveOrderDriverFleetAttribution(
        created.relatedOrderId!,
      ),
    ).toMatchObject({ fleetPartnerId: "unit-original-fleet-C067" });
    const rows = await fleet.listCases("unit-original-fleet-C067");
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.incidentId, type: "incident" }),
      ]),
    );
  });
  it("the existing Fleet detail opens that exact original incident id rather than requiring a separate complaint", async () => {
    const { fleet, created } = await actualOriginalFlow();
    const detail = await fleet.getCaseDetail(
      "unit-original-fleet-C067",
      created.incidentId,
    );
    expect(detail.caseDetail).toMatchObject({
      id: created.incidentId,
      type: "incident",
      relatedOrder: "unit-original-order-C067",
    });
  });
  it("the existing Fleet reply reaches the same original Ops incident timeline", async () => {
    const { ops, fleet, created } = await actualOriginalFlow();
    const content = "Unit original incident same-case Fleet response";
    await fleet.submitReply(
      "unit-original-fleet-C067",
      created.incidentId,
      "unit-original-fleet-case-actor",
      {
        content,
        idempotencyKey: "unit-original-incident-reply-key",
        attachmentIds: [],
      },
    );
    const timeline = await ops.getTimeline(created.incidentId);
    expect(
      timeline.data.items.some((entry) => entry.note.includes(content)),
    ).toBe(true);
  });
  it("includes a real driver-only incident using the canonical affiliation effective at its source timestamp", async () => {
    const { fleet, created } = await actualOriginalFlow({ driverOnly: true });
    const detail = await fleet.getCaseDetail(
      "unit-original-fleet-C067",
      created.incidentId,
    );
    expect(detail.caseDetail).toMatchObject({
      id: created.incidentId,
      type: "incident",
      driverId: "unit-original-driver-C067",
      relatedOrder: null,
      slaDueAt: null,
      slaBreach: null,
      reopenCount: null,
      assignee: "—",
      status: "open",
    });
    expect(await fleet.listCases("unit-original-fleet-C067")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.incidentId }),
      ]),
    );
  });
  it.each([{ missing: true }, { ambiguous: true }])(
    "does not invent fleet attribution for a driver-only incident with %j",
    async (mode) => {
      const { fleet, created } = await actualOriginalFlow({
        ...mode,
        driverOnly: true,
      });
      expect(await fleet.listCases("unit-original-fleet-C067")).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.incidentId }),
        ]),
      );
      await expect(
        fleet.getCaseDetail("unit-original-fleet-C067", created.incidentId),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED", status: 403 });
    },
  );
  it("an invalid or absent source date cannot invent driver-only fleet membership", async () => {
    const { attributionIO } = await actualOriginalFlow();
    expect(
      await attributionIO.resolveIncidentDriverFleetAttribution(
        "unit-original-driver-C067",
        null,
      ),
    ).toBeNull();
    expect(
      await attributionIO.resolveIncidentDriverFleetAttribution(
        "unit-original-driver-C067",
        "not-a-date",
      ),
    ).toBeNull();
  });
  it("commits one original incident reply, replays its exact receipt across replicas, and rejects changed body", async () => {
    const h = await actualOriginalFlow({ durable: true });
    const other = h.makeReplica();
    const command = {
      content: "Durable original incident reply",
      idempotencyKey: "durable-original-key",
      attachmentIds: [],
    };
    const first = await h.fleet.submitReply(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      command,
    );
    const replay = await other.fleet.submitReply(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      command,
    );
    expect(replay).toEqual({ ...first, deduplicated: true });
    await expect(
      other.fleet.submitReply(
        "unit-original-fleet-C067",
        h.created.incidentId,
        "unit-fleet-actor",
        { ...command, content: "Changed body must not replace original" },
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    const timeline = await other.ops.getTimeline(h.created.incidentId);
    expect(
      timeline.data.items.filter(
        (entry) => entry.action === "fleet_case_reply",
      ),
    ).toHaveLength(1);
    expect(
      timeline.data.items.some((entry) => entry.note.includes(command.content)),
    ).toBe(true);
    expect(
      timeline.data.items.some((entry) =>
        entry.note.includes("Changed body must not replace original"),
      ),
    ).toBe(false);
    expect(
      (await other.ops.getIncident(h.created.incidentId)).data.item,
    ).toMatchObject({ status: "open", assignedTo: null });
  });
  it("a rejected canonical timeline write publishes no successful receipt or cached note, and the same key can later recover", async () => {
    const h = await actualOriginalFlow({ durable: true });
    const command = {
      content: "Rejected until canonical append ACK",
      idempotencyKey: "failed-append-key",
      attachmentIds: [],
    };
    h.db.failTimeline = true;
    await expect(
      h.fleet.submitReply(
        "unit-original-fleet-C067",
        h.created.incidentId,
        "unit-fleet-actor",
        command,
      ),
    ).rejects.toThrow("SIM rejected timeline");
    expect(
      (await h.ops.getTimeline(h.created.incidentId)).data.items.filter(
        (entry) => entry.action === "fleet_case_reply",
      ),
    ).toHaveLength(0);
    h.db.failTimeline = false;
    await h.fleet.submitReply(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      command,
    );
    expect(
      (await h.ops.getTimeline(h.created.incidentId)).data.items.filter(
        (entry) => entry.action === "fleet_case_reply",
      ),
    ).toHaveLength(1);
  });
  it("two replicas submitting the same key concurrently append one canonical timeline note", async () => {
    const h = await actualOriginalFlow({ durable: true });
    const other = h.makeReplica();
    const command = {
      content: "Concurrent same original reply",
      idempotencyKey: "concurrent-original-key",
      attachmentIds: [],
    };
    const receipts = await Promise.all([
      h.fleet.submitReply(
        "unit-original-fleet-C067",
        h.created.incidentId,
        "unit-fleet-actor",
        command,
      ),
      other.fleet.submitReply(
        "unit-original-fleet-C067",
        h.created.incidentId,
        "unit-fleet-actor",
        command,
      ),
    ]);
    expect(receipts[1]).toEqual(
      expect.objectContaining({ replyId: receipts[0]?.replyId }),
    );
    expect(
      (await other.ops.getTimeline(h.created.incidentId)).data.items.filter(
        (entry) => entry.action === "fleet_case_reply",
      ),
    ).toHaveLength(1);
  });

  it("stores only actually confirmed same-Incident attachments and re-reads their real unit bytes through the original authorized download", async () => {
    const h = await actualOriginalFlow({ durable: true, withStorage: true });
    const bytes = Buffer.from("C067 synthetic unit attachment bytes");
    const metadata = {
      fileName: "C067-unit-evidence.txt",
      fileSize: bytes.length,
      contentType: "text/plain",
    };
    const upload = await h.fleet.createAttachmentUploadUrl(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      metadata,
    );
    await h.fleet.uploadAttachmentContent(
      "unit-original-fleet-C067",
      h.created.incidentId,
      upload.objectKey,
      h.byteStream(bytes),
      upload.headers["content-type"]!,
    );
    const confirmed = await h.fleet.confirmAttachmentUpload(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      {
        ...metadata,
        attachmentId: upload.attachmentId,
        objectKey: upload.objectKey,
      },
    );
    const command = {
      content: "Confirmed unit bytes attached to original Incident",
      idempotencyKey: "unit-attachment-reply",
      attachmentIds: [confirmed.attachmentId],
    };
    const receipt = await h.fleet.submitReply(
      "unit-original-fleet-C067",
      h.created.incidentId,
      "unit-fleet-actor",
      command,
    );
    expect(receipt).toMatchObject({
      caseId: h.created.incidentId,
      attachments: [
        expect.objectContaining({
          attachmentId: confirmed.attachmentId,
          fileSize: bytes.length,
        }),
      ],
    });
    const other = h.makeReplica();
    expect(
      (
        await other.fleet.getCaseTimeline(
          "unit-original-fleet-C067",
          h.created.incidentId,
        )
      ).some((entry) =>
        entry.attachments?.some(
          (item) => item.attachmentId === confirmed.attachmentId,
        ),
      ),
    ).toBe(true);
    expect(
      (await other.ops.getTimeline(h.created.incidentId)).data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "fleet_case_reply",
          fleetReply: expect.objectContaining({
            attachments: [
              expect.objectContaining({ attachmentId: confirmed.attachmentId }),
            ],
          }),
        }),
      ]),
    );
    const read = await other.fleet.getAttachmentReadUrl(
      "unit-original-fleet-C067",
      h.created.incidentId,
      confirmed.attachmentId,
    );
    const url = new URL(read.downloadUrl, "https://unit.invalid");
    const download = await other.fleet.verifyAndGetAttachmentForDownload(
      "unit-original-fleet-C067",
      h.created.incidentId,
      confirmed.attachmentId,
      Number(url.searchParams.get("expiresAt")),
      url.searchParams.get("sig")!,
    );
    expect(download.fileContent).toEqual(bytes);
    await expect(
      other.fleet.submitReply(
        "unit-original-fleet-C067",
        h.created.incidentId,
        "unit-fleet-actor",
        {
          ...command,
          idempotencyKey: "unit-unconfirmed-attachment",
          attachmentIds: ["unit-never-confirmed"],
        },
      ),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
  });
});
