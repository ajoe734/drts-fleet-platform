import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseService } from "../../../apps/api/src/common/db";
import {
  AuditNotificationModule,
  createAuditNotificationDeliveryService,
} from "../../../apps/api/src/modules/audit-notification/audit-notification.module";
import {
  TenantPartnerModule,
  createTenantInvitationNotificationDeliveryService,
} from "../../../apps/api/src/modules/tenant-partner/tenant-partner.module";
import {
  RegulatoryRegistryModule,
  createRegistryNotificationDeliveryService,
} from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.module";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";

const remote = {
  REMOTE_SMTP_HOST: "smtp.example.test",
  REMOTE_SMTP_PORT: "587",
  REMOTE_SMTP_USERNAME: "fixture-user",
  REMOTE_SMTP_PASSWORD: "fixture-password",
  REMOTE_SMTP_FROM_EMAIL: "sender@example.test",
  REMOTE_SMTP_RECIPIENT_ALLOWLIST: "approved.example.test",
};
const factories = [
  ["audit", AuditNotificationModule, createAuditNotificationDeliveryService],
  [
    "invitation",
    TenantPartnerModule,
    createTenantInvitationNotificationDeliveryService,
  ],
  [
    "registry",
    RegulatoryRegistryModule,
    createRegistryNotificationDeliveryService,
  ],
] as const;

describe.each(factories)(
  "%s notification bootstrap",
  (_name, module, factory) => {
    let directory: string;
    const connect = vi
      .fn()
      .mockRejectedValue(new Error("database_boundary_reached"));
    const database = {
      isEnabled: () => true,
      connect,
    } as unknown as DatabaseService;
    const disabledDatabase = { isEnabled: () => false } as DatabaseService;

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), "smtp-bootstrap-"));
      for (const key of [
        ...Object.keys(remote),
        "MAILPIT_SMTP_PORT",
        "NOTIFICATION_OUTBOX_DIRECTORY",
        "NOTIFICATION_OUTBOX_TYPE",
        "DATABASE_URL",
      ])
        vi.stubEnv(key, undefined);
      vi.stubEnv("DRTS_ENV", "development");
      connect.mockClear();
    });
    afterEach(async () => {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    });

    it.each(["absent", "file", "postgres"])(
      "rejects each partial SMTP setting with %s storage before returning a service",
      (storage) => {
        if (storage === "file")
          vi.stubEnv("NOTIFICATION_OUTBOX_DIRECTORY", directory);
        if (storage === "postgres")
          vi.stubEnv("NOTIFICATION_OUTBOX_TYPE", "postgres");
        for (const key of Object.keys(remote)) {
          vi.stubEnv(key, remote[key as keyof typeof remote]);
          expect(() => factory(database)).toThrow("SMTP_CONFIGURATION_INVALID");
          vi.stubEnv(key, undefined);
        }
        for (const missing of Object.keys(remote).filter(
          (key) => key !== "REMOTE_SMTP_RECIPIENT_ALLOWLIST",
        )) {
          for (const [key, value] of Object.entries(remote))
            vi.stubEnv(key, value);
          for (const value of [undefined, "", " "]) {
            vi.stubEnv(missing, value);
            expect(() => factory(database)).toThrow(
              "SMTP_CONFIGURATION_INVALID",
            );
          }
        }
        expect(connect).not.toHaveBeenCalled();
      },
    );

    it("preserves disabled behavior when neither storage nor SMTP is configured", () => {
      expect(factory(database)).toBeNull();
    });

    it("keeps the file outbox durable and transport unavailable without SMTP", async () => {
      vi.stubEnv("NOTIFICATION_OUTBOX_DIRECTORY", directory);
      const service = factory(database)!;
      expect(service.availability()).toBe("unavailable");
      const receipt = await service.enqueue({
        tenantId: "tenant-fixture",
        idempotencyKey: "fixture-mail",
        recipientEmail: "recipient@approved.example.test",
        fromEmail: "sender@example.test",
        subject: "Fixture",
        body: "Fixture body",
      });
      expect(
        await factory(database)!.get("tenant-fixture", receipt.deliveryId),
      ).toEqual(receipt);
      expect(connect).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      "uses the injected database for postgres with directory configured=%s",
      async (withDirectory) => {
        for (const [key, value] of Object.entries(remote))
          vi.stubEnv(key, value);
        vi.stubEnv("NOTIFICATION_OUTBOX_TYPE", "postgres");
        if (withDirectory)
          vi.stubEnv("NOTIFICATION_OUTBOX_DIRECTORY", directory);
        const service = factory(database);
        expect(service).toBeInstanceOf(NotificationDeliveryService);
        expect(service!.availability()).toBe("available");
        // Mock only the external connection boundary; the factory, service and
        // PostgresMailOutbox are real. This does not claim PostgreSQL integration.
        await expect(
          service!.get("tenant-fixture", "delivery-fixture"),
        ).rejects.toThrow("database_boundary_reached");
        expect(connect).toHaveBeenCalledTimes(1);
      },
    );

    it("fails closed when postgres was requested but the database is disabled", () => {
      vi.stubEnv("NOTIFICATION_OUTBOX_TYPE", "postgres");
      vi.stubEnv("NOTIFICATION_OUTBOX_DIRECTORY", directory);
      expect(() => factory(disabledDatabase)).toThrow(
        "notification_outbox_unavailable",
      );
    });

    it("registers the real factory with the shared DatabaseService dependency", () => {
      const providers = Reflect.getMetadata("providers", module) as {
        provide?: unknown;
        useFactory?: unknown;
        inject?: unknown[];
      }[];
      const provider = providers.find(
        (entry) => entry.provide === NotificationDeliveryService,
      );
      expect(provider?.useFactory).toBe(factory);
      expect(provider?.inject).toEqual([DatabaseService]);
    });
  },
);
