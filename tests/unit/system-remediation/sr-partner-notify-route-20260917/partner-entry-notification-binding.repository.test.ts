import { describe, expect, it } from "vitest";

import { PartnerEntryNotificationBindingRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.repository";

const ENTRY_SLUG = "yuhe-residence";
const TENANT_ID = "tenant-demo-001";
const PARTNER_ID = "partner-demo-001";
const WEBHOOK_ID = "webhook-demo-001";

function now() {
  return new Date().toISOString();
}

describe("PartnerEntryNotificationBindingRepository (fallback, no DATABASE_URL)", () => {
  it("creates a new binding as test_pending with expectedVersion 0", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    const outcome = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["assignment_disclosure_ready"],
      expectedVersion: 0,
      now: now(),
    });
    expect(outcome.outcome).toBe("written");
    if (outcome.outcome !== "written") throw new Error("unreachable");
    expect(outcome.binding.version).toBe(1);
    expect(outcome.binding.state).toBe("test_pending");
    expect(outcome.binding.validatedEndpointFingerprint).toBeNull();
    expect(outcome.binding.validatedAt).toBeNull();
  });

  it("rejects create when expectedVersion is not 0 and no binding exists", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    const outcome = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["assignment_disclosure_ready"],
      expectedVersion: 3,
      now: now(),
    });
    expect(outcome.outcome).toBe("version_conflict");
    if (outcome.outcome !== "version_conflict") throw new Error("unreachable");
    expect(outcome.current).toBeNull();
  });

  it("409s a stale-version PUT instead of silently overwriting", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["assignment_disclosure_ready"],
      expectedVersion: 0,
      now: now(),
    });

    const staleOutcome = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["eta_changed"],
      expectedVersion: 0, // stale: the binding is already at version 1
      now: now(),
    });
    expect(staleOutcome.outcome).toBe("version_conflict");
    if (staleOutcome.outcome !== "version_conflict") throw new Error("unreachable");
    expect(staleOutcome.current?.version).toBe(1);
    // the stale write must not have applied
    expect(staleOutcome.current?.eventTypes).toEqual(["assignment_disclosure_ready"]);
  });

  it("a valid-version PUT bumps version and resets state/validation (URL/events rotation must be re-tested)", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    const created = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["assignment_disclosure_ready"],
      expectedVersion: 0,
      now: now(),
    });
    if (created.outcome !== "written") throw new Error("unreachable");

    await repository.setValidated({
      entrySlug: ENTRY_SLUG,
      expectedVersion: created.binding.version,
      validatedEndpointFingerprint: "fp-1",
      now: now(),
    });

    const updated = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: "webhook-demo-002",
      eventTypes: ["eta_changed", "driver_arrived"],
      expectedVersion: created.binding.version,
      now: now(),
    });
    expect(updated.outcome).toBe("written");
    if (updated.outcome !== "written") throw new Error("unreachable");
    expect(updated.binding.version).toBe(2);
    expect(updated.binding.state).toBe("test_pending");
    expect(updated.binding.validatedEndpointFingerprint).toBeNull();
    expect(updated.binding.validatedAt).toBeNull();
    expect(updated.binding.webhookId).toBe("webhook-demo-002");
  });

  it("setState enable/disable bump version and require the caller's version to match", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    const created = await repository.put({
      entrySlug: ENTRY_SLUG,
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      webhookId: WEBHOOK_ID,
      eventTypes: ["assignment_disclosure_ready"],
      expectedVersion: 0,
      now: now(),
    });
    if (created.outcome !== "written") throw new Error("unreachable");

    const staleEnable = await repository.setState({
      entrySlug: ENTRY_SLUG,
      expectedVersion: 99,
      nextState: "ready",
      now: now(),
    });
    expect(staleEnable.outcome).toBe("version_conflict");

    const enabled = await repository.setState({
      entrySlug: ENTRY_SLUG,
      expectedVersion: created.binding.version,
      nextState: "ready",
      now: now(),
    });
    expect(enabled.outcome).toBe("written");
    if (enabled.outcome !== "written") throw new Error("unreachable");
    expect(enabled.binding.state).toBe("ready");
    expect(enabled.binding.version).toBe(2);

    const disabled = await repository.setState({
      entrySlug: ENTRY_SLUG,
      expectedVersion: enabled.binding.version,
      nextState: "disabled",
      now: now(),
    });
    expect(disabled.outcome).toBe("written");
    if (disabled.outcome !== "written") throw new Error("unreachable");
    expect(disabled.binding.state).toBe("disabled");
    expect(disabled.binding.version).toBe(3);
  });

  it("findByEntrySlug returns null before any binding is created", async () => {
    const repository = new PartnerEntryNotificationBindingRepository();
    expect(await repository.findByEntrySlug(ENTRY_SLUG)).toBeNull();
  });
});
