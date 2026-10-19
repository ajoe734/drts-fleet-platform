import { describe, expect, it, vi } from "vitest";
import { FeatureFlagRepository } from "../../../apps/api/src/modules/feature-flags/feature-flag.repository";
import { FeatureFlagsService } from "../../../apps/api/src/modules/feature-flags/feature-flags.service";
import { FeatureFlagsController } from "../../../apps/api/src/modules/feature-flags/feature-flags.controller";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { DatabaseService } from "../../../apps/api/src/common/db";

const row = {
  flag_key: "tenant-portal.booking",
  tenant_id: "A",
  enabled: false,
  description: "A override",
  updated_at: "2026-10-16T00:00:00Z",
};
function enabledDb(query = vi.fn().mockResolvedValue({ rows: [row] })) {
  const repository = new FeatureFlagRepository({
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService);
  const audit = new AuditNotificationService();
  const service = new FeatureFlagsService(repository, audit);
  return {
    repository,
    service,
    audit,
    controller: new FeatureFlagsController(service),
    query,
  };
}

describe("canonical flag commands and reads", () => {
  it("selected admin query survives the actual controller boundary", async () => {
    const service = new FeatureFlagsService();
    await service.upsertTenantOverride("tenant-portal.booking", "A", false);
    const controller = new FeatureFlagsController(service);
    // Last argument is the production ?tenantId query, independent of headers.
    const result = await Reflect.apply(controller.getAllFlags, controller, [
      "read-A",
      undefined,
      "A",
    ]);
    expect(
      result.data.flags.find(
        (f: { key: string }) => f.key === "tenant-portal.booking",
      ),
    ).toMatchObject({ enabled: false, tenantId: "A" });
    expect(
      (await service.getByKey("tenant-portal.booking", "B"))?.enabled,
    ).toBe(true);
    expect((await service.getByKey("tenant-portal.booking"))?.enabled).toBe(
      true,
    );
  });

  it("enabled repository read rejection remains rejection, distinct from empty/not-found", async () => {
    const { repository } = enabledDb(
      vi.fn().mockRejectedValue(new Error("DB unavailable")),
    );
    await expect(repository.findAll()).rejects.toThrow("DB unavailable");
    await expect(repository.findByKey("missing")).rejects.toThrow(
      "DB unavailable",
    );
    const empty = enabledDb(vi.fn().mockResolvedValue({ rows: [] }));
    expect(await empty.repository.findAll()).toEqual([]);
    expect(await empty.repository.findByKey("missing")).toBeUndefined();
  });

  it("rejected and no-row enabled writes cannot produce success or success audit", async () => {
    const { controller, audit } = enabledDb(
      vi.fn().mockRejectedValue(new Error("DB unavailable")),
    );
    await expect(
      controller.updateFlag("x", { enabled: true }),
    ).rejects.toThrow();
    await expect(
      controller.upsertTenantOverride("x", "A", { enabled: false }),
    ).rejects.toThrow();
    expect(
      audit
        .listAuditLogs()
        .filter((a) => a.actionName === "upsert_tenant_feature_flag"),
    ).toEqual([]);
    const noRow = enabledDb(vi.fn().mockResolvedValue({ rows: [] }));
    await expect(
      noRow.controller.updateFlag("missing", { enabled: true }),
    ).rejects.toThrow();
    await expect(
      noRow.controller.upsertTenantOverride("x", "A", { enabled: false }),
    ).rejects.toThrow();
    expect(
      noRow.audit
        .listAuditLogs()
        .filter((a) => a.actionName === "upsert_tenant_feature_flag"),
    ).toEqual([]);
  });

  it("pending DB ACK stays pending; only actual returned row enables receipt and audit", async () => {
    let ack!: (v: { rows: (typeof row)[] }) => void;
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            ack = resolve;
          }),
      );
    const { controller, audit } = enabledDb(query);
    let settled = false;
    const response = controller
      .upsertTenantOverride("tenant-portal.booking", "A", { enabled: false })
      .then((v) => {
        settled = true;
        return v;
      });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    expect(
      audit
        .listAuditLogs()
        .some((a) => a.actionName === "upsert_tenant_feature_flag"),
    ).toBe(false);
    ack({ rows: [row] });
    expect((await response).data).toMatchObject({
      key: row.flag_key,
      tenantId: "A",
      enabled: false,
    });
    expect(
      audit
        .listAuditLogs()
        .some((a) => a.actionName === "upsert_tenant_feature_flag"),
    ).toBe(true);
  });
});
