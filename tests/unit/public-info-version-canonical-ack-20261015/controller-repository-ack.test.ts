import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import {
  fixture,
  fields,
  identity,
  publicAudits,
  command,
  cache,
} from "./wire-fixture";

describe("actual PublicInfo Controller → Service → enabled Repository ACK", () => {
  it.each(["create", "publish", "delete"] as const)(
    "keeps %s pending, cache and success audit unchanged until canonical write ACK",
    async (operation) => {
      const h = await fixture();
      const before = cache(h.service);
      const canonical = h.wire.snapshot();
      const gate = h.wire.pause("write");
      let settled = false;
      const pending = Promise.resolve(command(h, operation)).then((value) => {
        settled = true;
        return value;
      });
      try {
        await Promise.race([gate.entered, pending]);
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(cache(h.service)).toEqual(before);
        expect(h.wire.snapshot()).toEqual(canonical);
        expect(publicAudits(h.audit)).toHaveLength(0);
      } finally {
        gate.release();
        await pending;
      }
      expect(publicAudits(h.audit)).toHaveLength(1);
    },
  );

  it.each(["create", "publish", "delete"] as const)(
    "propagates a rejected %s write without changing canonical/cache state or recording success",
    async (operation) => {
      const h = await fixture();
      const before = cache(h.service);
      const canonical = h.wire.snapshot();
      h.wire.failWrite = h.wire.writes + 1;
      await expect(Promise.resolve(command(h, operation))).rejects.toThrow(
        "Controlled canonical write failure",
      );
      expect(cache(h.service)).toEqual(before);
      expect(h.wire.snapshot()).toEqual(canonical);
      expect(publicAudits(h.audit)).toHaveLength(0);
      expect(h.wire.statements).toContain("ROLLBACK");
    },
  );

  it("rolls back both publish-history writes if the second fails, permits a legitimate retry and rejects re-publication", async () => {
    const h = await fixture();
    const before = cache(h.service);
    const canonical = h.wire.snapshot();
    h.wire.failWrite = h.wire.writes + 2;
    await expect(Promise.resolve(command(h, "publish"))).rejects.toThrow(
      "Controlled canonical write failure",
    );
    expect(cache(h.service)).toEqual(before);
    expect(h.wire.snapshot()).toEqual(canonical);
    expect(publicAudits(h.audit)).toHaveLength(0);
    h.wire.failWrite = 0;
    const saved = await command(h, "publish");
    expect(saved.data).toMatchObject({
      versionId: h.draft.versionId,
      status: "published",
      publishedBy: identity.actorId,
    });
    expect(
      await h.repository.getPublicInfoVersionRecord(h.draft.versionId),
    ).toEqual(saved.data);
    const previous = canonical.find((row) => row.status === "published")!;
    expect(
      await h.repository.getPublicInfoVersionRecord(previous.versionId),
    ).toMatchObject({ status: "retired", effectiveTo: saved.data.publishedAt });
    await expect(Promise.resolve(command(h, "publish"))).rejects.toMatchObject({
      code: "PUBLIC_INFO_VERSION_NOT_DRAFT",
    });
    expect(publicAudits(h.audit)).toHaveLength(1);
  });

  it("waits for COMMIT itself before returning an API record or exposing the staged version", async () => {
    const h = await fixture();
    const before = cache(h.service);
    const canonical = h.wire.snapshot();
    const gate = h.wire.pause("COMMIT");
    let settled = false;
    const pending = Promise.resolve(command(h, "create")).then((value) => {
      settled = true;
      return value;
    });
    try {
      const reached = await Promise.race([
        gate.entered.then(() => true),
        pending.then(() => false),
      ]);
      expect(reached).toBe(true);
      expect(settled).toBe(false);
      expect(cache(h.service)).toEqual(before);
      expect(h.wire.snapshot()).toEqual(canonical);
      expect(publicAudits(h.audit)).toHaveLength(0);
    } finally {
      gate.release();
      await pending;
    }
    expect(h.wire.statements).toContain("COMMIT");
  });

  it("returns the committed record with every original field, actual actor and same-version authoritative readback through create/publish/delete", async () => {
    const h = await fixture();
    const created = await h.controller.createPublicInfoVersion(
      fields,
      "req-fields",
    );
    expect(created.data).toMatchObject({
      ...fields,
      title: fields.title.trim(),
      status: "draft",
    });
    expect(
      await h.repository.getPublicInfoVersionRecord(created.data.versionId),
    ).toEqual(created.data);
    const published = await h.controller.publishPublicInfoVersion(
      created.data.versionId,
      { publishedBy: "forged-body" },
      identity,
    );
    expect(published.data).toMatchObject({
      ...fields,
      title: fields.title.trim(),
      status: "published",
      publishedBy: identity.actorId,
    });
    expect(
      h.service
        .listPublicInfoVersions()
        .find((row) => row.versionId === published.data.versionId),
    ).toEqual(
      await h.repository.getPublicInfoVersionRecord(published.data.versionId),
    );
    const deleted = await h.controller.deleteDraftPublicInfoVersion(
      h.draft.versionId,
      identity,
    );
    expect(deleted.data.versionId).toBe(h.draft.versionId);
    expect(
      await h.repository.getPublicInfoVersionRecord(h.draft.versionId),
    ).toBeNull();
    expect(publicAudits(h.audit).map((row) => row.actionName)).toEqual(
      expect.arrayContaining([
        "create_public_info_version",
        "publish_public_info_version",
        "delete_draft_public_info_version",
      ]),
    );
  });

  it("preserves allowed no-repository mode and rejects blank/missing versions, non-draft operations and missing verified publisher", async () => {
    const audit = new AuditNotificationService();
    const service = new PlatformAdminService(audit);
    const controller = new PlatformAdminController(service);
    const draft = await controller.createPublicInfoVersion(fields);
    expect(draft.data.status).toBe("draft");
    await expect(
      Promise.resolve().then(() =>
        controller.createPublicInfoVersion({ title: " " }),
      ),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion("missing-version", {}, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_FOUND" });
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion(
          draft.data.versionId,
          { publishedBy: "body-only" },
          null,
        ),
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_ADMIN_IDENTITY_REQUIRED" });
    const published = await controller.publishPublicInfoVersion(
      draft.data.versionId,
      {},
      identity,
    );
    expect(published.data.publishedBy).toBe(identity.actorId);
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion(draft.data.versionId, {}, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_DRAFT" });
    await expect(
      Promise.resolve().then(() =>
        controller.deleteDraftPublicInfoVersion(draft.data.versionId, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_DRAFT" });
    const removable = await controller.createPublicInfoVersion({
      title: "可刪除草稿",
    });
    await expect(
      Promise.resolve().then(() =>
        controller.deleteDraftPublicInfoVersion(removable.data.versionId, null),
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_ADMIN_IDENTITY_REQUIRED" });
    await controller.deleteDraftPublicInfoVersion(
      removable.data.versionId,
      identity,
    );
    expect(
      service
        .listPublicInfoVersions()
        .some((row) => row.versionId === removable.data.versionId),
    ).toBe(false);
  });
});
