import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import type {
  DriverSosAttachmentScanner,
  DriverSosAttachmentStorageProvider,
  DriverSosAttachmentUploadIntentInput,
  DriverSosUploadedObjectMetadata,
} from "../../src/modules/driver-sos/driver-sos-attachment.ports";
import { DriverSosService } from "../../src/modules/driver-sos/driver-sos.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

function identity(
  realm: "driver" | "ops",
  actorId: string,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: realm === "driver" ? "driver_user" : "ops_user",
    actorId,
    realm,
    tenantId: null,
    roleFamilies: [realm],
    roles: [realm === "driver" ? "driver_user" : "ops_manager"],
    scopes: ["incident:write"],
    requestId: `req-${actorId}`,
  };
}

class FakeStorage implements DriverSosAttachmentStorageProvider {
  readonly providerName = "hermetic-storage";
  private metadata = new Map<string, DriverSosUploadedObjectMetadata>();

  availability() {
    return { state: "available" as const };
  }

  async createUploadIntent(input: DriverSosAttachmentUploadIntentInput) {
    this.metadata.set(input.objectKey, {
      objectKey: input.objectKey,
      contentType: input.contentType,
      fileSize: input.fileSize,
      checksumSha256: "a".repeat(64),
    });
    return {
      uploadUrl: `http://127.0.0.1/hermetic-upload/${input.objectKey}`,
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
    };
  }

  async inspectUploadedObject(objectKey: string) {
    const metadata = this.metadata.get(objectKey);
    if (!metadata) {
      throw new Error("object missing");
    }
    return metadata;
  }

  corruptSize(objectKey: string) {
    const metadata = this.metadata.get(objectKey);
    if (metadata) {
      metadata.fileSize += 1;
    }
  }
}

class FakeScanner implements DriverSosAttachmentScanner {
  readonly providerName = "hermetic-scanner";

  constructor(
    private readonly status: "clean" | "infected" | "error" = "clean",
  ) {}

  availability() {
    return { state: "available" as const };
  }

  async scan() {
    return {
      status: this.status,
      reason: this.status === "clean" ? null : `hermetic_${this.status}`,
      scannedAt: new Date().toISOString(),
    };
  }
}

function buildService(
  storage?: DriverSosAttachmentStorageProvider,
  scanner?: DriverSosAttachmentScanner,
) {
  const audit = { recordAuditLog: vi.fn() };
  const incidents = new IncidentService(audit as never);
  return {
    audit,
    service: new DriverSosService(
      audit as never,
      incidents,
      undefined,
      undefined,
      storage,
      scanner,
    ),
  };
}

async function submit(service: DriverSosService) {
  return service.submitSosEvent(
    {
      clientEventId: crypto.randomUUID(),
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: false,
    },
    identity("driver", "drv-attachment-001"),
  );
}

describe("DriverSosService attachment verification", () => {
  it("returns unavailable without fabricating an upload URL", async () => {
    const { service } = buildService();
    const submitted = await submit(service);

    const result = await service.createAttachmentUploadIntent(
      submitted.event.sosEventId,
      {
        attachmentType: "photo",
        originalFileName: "scene.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      },
      identity("driver", "drv-attachment-001"),
    );

    expect(result).toEqual({
      state: "unavailable",
      sosEventId: submitted.event.sosEventId,
      reasonCode: "storage_provider_unavailable",
      reason: "No attachment storage provider is configured.",
      retryable: true,
    });
    expect(result).not.toHaveProperty("uploadUrl");
  });

  it("confirms metadata but fails closed when no scanner is configured", async () => {
    const storage = new FakeStorage();
    const { service } = buildService(storage);
    const submitted = await submit(service);
    const intent = await service.createAttachmentUploadIntent(
      submitted.event.sosEventId,
      {
        attachmentType: "audio",
        originalFileName: "incident.m4a",
        contentType: "audio/m4a",
        fileSize: 2048,
      },
      identity("driver", "drv-attachment-001"),
    );
    if (intent.state !== "ready") {
      throw new Error("expected a hermetic upload intent");
    }

    const confirmed = await service.confirmAttachmentUpload(
      submitted.event.sosEventId,
      { objectKey: intent.objectKey },
      identity("driver", "drv-attachment-001"),
    );

    expect(confirmed.state).toBe("confirmed");
    if (confirmed.state !== "confirmed") {
      throw new Error("expected confirmed attachment");
    }
    expect(confirmed.attachment).toEqual(
      expect.objectContaining({
        checksumSha256: "a".repeat(64),
        scanStatus: "unavailable",
        scannerProvider: null,
        scanAttemptCount: 0,
      }),
    );
  });

  it.each(["clean", "infected", "error"] as const)(
    "records explicit %s from the injected hermetic scanner",
    async (status) => {
      const storage = new FakeStorage();
      const { service } = buildService(storage, new FakeScanner(status));
      const submitted = await submit(service);
      const intent = await service.createAttachmentUploadIntent(
        submitted.event.sosEventId,
        {
          attachmentType: "photo",
          originalFileName: "scene.png",
          contentType: "image/png",
          fileSize: 4096,
        },
        identity("driver", "drv-attachment-001"),
      );
      if (intent.state !== "ready") {
        throw new Error("expected a hermetic upload intent");
      }

      const result = await service.confirmAttachmentUpload(
        submitted.event.sosEventId,
        { objectKey: intent.objectKey },
        identity("driver", "drv-attachment-001"),
      );

      expect(result.state).toBe("confirmed");
      if (result.state !== "confirmed") {
        throw new Error("expected confirmed attachment");
      }
      expect(result.attachment.scanStatus).toBe(status);
      expect(result.attachment.scannerProvider).toBe("hermetic-scanner");
      expect(result.attachment.scanAttemptCount).toBe(1);
    },
  );

  it("rejects uploaded metadata that differs from the intent", async () => {
    const storage = new FakeStorage();
    const { service } = buildService(storage);
    const submitted = await submit(service);
    const intent = await service.createAttachmentUploadIntent(
      submitted.event.sosEventId,
      {
        attachmentType: "photo",
        originalFileName: "scene.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      },
      identity("driver", "drv-attachment-001"),
    );
    if (intent.state !== "ready") {
      throw new Error("expected a hermetic upload intent");
    }
    storage.corruptSize(intent.objectKey);

    await expect(
      service.confirmAttachmentUpload(
        submitted.event.sosEventId,
        { objectKey: intent.objectKey },
        identity("driver", "drv-attachment-001"),
      ),
    ).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: "DRIVER_SOS_ATTACHMENT_METADATA_MISMATCH",
        }),
      },
    });
  });

  it("keeps the first Ops render observation", async () => {
    const { service } = buildService();
    const submitted = await submit(service);
    const renderedAt = new Date(
      Date.parse(submitted.receipt.fleetReportConfirmedAt) + 25,
    ).toISOString();

    await expect(
      service.recordOpsAlertsRendered(
        {
          incidentIds: [submitted.receipt.incidentId, "missing-incident"],
          renderedAt,
        },
        identity("ops", "ops-sos-001"),
      ),
    ).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: "DRIVER_SOS_ALERT_NOT_FOUND",
        }),
      },
    });

    const first = await service.recordOpsAlertsRendered(
      { incidentIds: [submitted.receipt.incidentId], renderedAt },
      identity("ops", "ops-sos-001"),
    );
    const duplicate = await service.recordOpsAlertsRendered(
      {
        incidentIds: [submitted.receipt.incidentId],
        renderedAt: new Date(Date.parse(renderedAt) + 1000).toISOString(),
      },
      identity("ops", "ops-sos-001"),
    );

    expect(first.observations[0]).toEqual(
      expect.objectContaining({
        opsAlertRenderedAt: renderedAt,
        alertToOpsLatencyMs: 25,
        duplicate: false,
      }),
    );
    expect(duplicate.observations[0]).toEqual(
      expect.objectContaining({
        opsAlertRenderedAt: renderedAt,
        alertToOpsLatencyMs: 25,
        duplicate: true,
      }),
    );
  });

  it("summarizes persisted Ops render latency without manufacturing samples", async () => {
    const { service } = buildService();
    const first = await submit(service);
    const firstRenderedAt = new Date(
      Date.parse(first.receipt.fleetReportConfirmedAt) + 1_000,
    ).toISOString();
    await service.recordOpsAlertsRendered(
      {
        incidentIds: [first.receipt.incidentId],
        renderedAt: firstRenderedAt,
      },
      identity("ops", "ops-sos-001"),
    );

    const second = await submit(service);
    const secondRenderedAt = new Date(
      Date.parse(second.receipt.fleetReportConfirmedAt) + 6_000,
    ).toISOString();
    await service.recordOpsAlertsRendered(
      {
        incidentIds: [second.receipt.incidentId],
        renderedAt: secondRenderedAt,
      },
      identity("ops", "ops-sos-001"),
    );

    await expect(
      service.getOpsAlertLatencySummary({}, identity("driver", "drv-001")),
    ).rejects.toMatchObject({
      response: { error: { code: "OPS_REALM_REQUIRED" } },
    });
    await expect(
      service.getOpsAlertLatencySummary(
        {
          from: "2026-07-24T10:00:00.000Z",
          to: "2026-07-24T09:00:00.000Z",
        },
        identity("ops", "ops-sos-001"),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: "VALIDATION_ERROR" } },
    });

    expect(
      await service.getOpsAlertLatencySummary(
        {},
        identity("ops", "ops-sos-001"),
      ),
    ).toEqual({
      from: null,
      to: null,
      targetLatencyMs: 5_000,
      sampleCount: 2,
      withinTargetCount: 1,
      withinTargetRate: 0.5,
      p50LatencyMs: 3_500,
      p95LatencyMs: 5_750,
      maxLatencyMs: 6_000,
    });
  });
});
