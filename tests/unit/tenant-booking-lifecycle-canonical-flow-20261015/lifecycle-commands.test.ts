import { describe, expect, it, vi } from "vitest";
import { harness, order, SqlTransport, deferred, tenantId } from "./fixtures";
const put = (h: ReturnType<typeof harness>, command: Record<string, unknown>) =>
  h.controller.updateTenantBooking(
    "tenant-lifecycle-booking",
    command as never,
    null,
    tenantId,
    "lifecycle-request",
  );

describe("original Tenant mounted command and SQL-boundary regressions", () => {
  it.each(["cancelled", "completed"] as const)(
    "rejects %s even with a future cutoff without trace/readback changes",
    async (status) => {
      const h = harness(order({ status }));
      const before = h.service.getOrder("tenant-lifecycle-order");
      await expect(put(h, { notes: "must not commit" })).rejects.toMatchObject({
        code: "ORDER_NOT_MODIFIABLE",
      });
      expect(h.service.getOrder(before.orderId)).toEqual(before);
    },
  );
  it.each([
    { value: "not-an-ISO-date", code: "INVALID_RESERVATION_WINDOW_START" },
    { value: "2000-01-01T00:00:00.000Z", code: "TOO_SOON_TO_BOOK" },
    {
      value: () => new Date(Date.now() + 60_000).toISOString(),
      code: "TOO_SOON_TO_BOOK",
    },
  ])(
    "rejects changed invalid/past/too-soon start before any mutation (%s)",
    async ({ value, code }) => {
      const h = harness();
      const before = h.service.getOrder("tenant-lifecycle-order");
      await expect(
        put(h, {
          reservationWindowStart: typeof value === "function" ? value() : value,
        }),
      ).rejects.toMatchObject({ code });
      expect(h.service.getOrder(before.orderId)).toEqual(before);
    },
  );
  it("waits actual repository COMMIT before mounted receipt and cache projection", async () => {
    const initial = order();
    const db = new SqlTransport(initial);
    const hold = deferred();
    db.holdWrite = hold;
    const h = harness(initial, db);
    const audit = vi.spyOn(h.audit, "recordAuditLog");
    const traceBefore = h.service.listDispatchTrace(initial.orderId);
    let settled = false;
    const command = put(h, { notes: "committed notes" }).then((result) => {
      settled = true;
      return result;
    });
    await db.enteredWrite.promise;
    const pendingObservation = {
      settled,
      notes: h.service.getOrder(initial.orderId).notes,
      trace: h.service.listDispatchTrace(initial.orderId),
      successAudits: audit.mock.calls.filter(
        ([input]) => input.actionName === "update_booking",
      ).length,
    };
    hold.resolve();
    const result = await command;
    expect(pendingObservation).toEqual({
      settled: false,
      notes: initial.notes,
      trace: traceBefore,
      successAudits: 0,
    });
    expect(result.data.notes).toBe("committed notes");
    expect(db.committed.notes).toBe("committed notes");
    expect(h.service.getOrder(initial.orderId).notes).toBe("committed notes");
  });
  it("rejects failed repository write without poisoning cache or preventing lawful retry", async () => {
    const initial = order();
    const db = new SqlTransport(initial);
    db.failWrite = true;
    const h = harness(initial, db);
    const before = h.service.getOrder(initial.orderId);
    const traceBefore = h.service.listDispatchTrace(initial.orderId);
    const audit = vi.spyOn(h.audit, "recordAuditLog");
    await expect(put(h, { notes: "first rejected" })).rejects.toThrow(
      "controlled real repository",
    );
    expect(db.committed).toEqual(initial);
    expect(h.service.getOrder(initial.orderId)).toEqual(before);
    expect(h.service.listDispatchTrace(initial.orderId)).toEqual(traceBefore);
    expect(
      audit.mock.calls.some(([input]) => input.actionName === "update_booking"),
    ).toBe(false);
    db.failWrite = false;
    const result = await put(h, { notes: "valid retry" });
    expect(result.data.notes).toBe("valid retry");
    expect(db.committed.notes).toBe("valid retry");
  });
  it("uses current durable cancelled state instead of a stale local modifiable snapshot", async () => {
    const initial = order();
    const db = new SqlTransport(
      order({ status: "cancelled", cancelledAt: new Date().toISOString() }),
    );
    const h = harness(initial, db);
    await expect(put(h, { notes: "stale mutation" })).rejects.toMatchObject({
      code: "ORDER_NOT_MODIFIABLE",
    });
    expect(db.committed.status).toBe("cancelled");
    expect(db.statements.some((sql) => sql.includes("FOR UPDATE"))).toBe(true);
  });
  it("preserves valid noDB notes/contact and future same-booking reschedule", async () => {
    const h = harness();
    const initial = h.service.getOrder("tenant-lifecycle-order");
    const result = await put(h, {
      notes: "allowed",
      onsiteContact: { name: "Onsite", phone: "0912000333" },
      reservationWindowStart: new Date(Date.now() + 5 * 3600_000).toISOString(),
    });
    expect(result.data.bookingId).toBe(initial.bookingId);
    expect(result.data.notes).toBe("allowed");
    expect(result.data.onsiteContact?.name).toBe("Onsite");
  });
  it("serializes a real normal cancellation before a stale replica update without resurrection", async () => {
    const initial = order();
    const db = new SqlTransport(initial);
    const a = harness(initial, db);
    const b = harness(initial, db);
    const hold = deferred();
    db.holdCommit = hold;
    const cancellation = b.service.cancelTenantBooking(
      tenantId,
      initial.bookingId!,
      { reason: "normal concurrent cancellation" },
    );
    await db.enteredCommit.promise;
    const mutation = put(a, { notes: "stale edit" });
    hold.resolve();
    await cancellation;
    await expect(mutation).rejects.toMatchObject({
      code: "ORDER_NOT_MODIFIABLE",
    });
    expect(db.committed.status).toBe("cancelled");
    expect(a.service.getOrder(initial.orderId).status).toBe("cancelled");
  });
  it("merges two edits against their actual locked row instead of losing a prior committed field", async () => {
    const initial = order();
    const db = new SqlTransport(initial);
    const a = harness(initial, db);
    const b = harness(initial, db);
    await put(a, { notes: "first committed notes" });
    await put(b, {
      onsiteContact: { name: "Second edit", phone: "0912000111" },
    });
    expect(db.committed.notes).toBe("first committed notes");
    expect(db.committed.onsiteContact?.name).toBe("Second edit");
    expect(b.service.getOrder(initial.orderId).notes).toBe(
      "first committed notes",
    );
  });
});
