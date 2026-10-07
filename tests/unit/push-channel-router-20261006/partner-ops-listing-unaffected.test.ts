// PUSH-CHANNEL-ROUTER-20261006 acceptance: "確認既有的夥伴投遞清單與 Ops
// 待處理不會因為 no_notification_channel 的列而出現假的待辦". This task makes
// no edit to MultiTaxiRepository.listPartnerNotificationDeliveries — a
// no_notification_channel row has neither a partner route row nor a partner
// delivery context row, so `COALESCE(ctx.entry_slug, r.entry_slug)` is SQL
// NULL for it and can never equal the caller-supplied `$1` entrySlug,
// regardless of which entrySlug is queried. This is a structural guarantee
// of the unmodified query text, not something a mocked `query()` can
// re-prove (a mock does not execute real NULL-comparison semantics); a real
// assertion against Postgres is deferred to PUSH-CHANNEL-PG-QA-20261006 per
// the task brief. This test guards the one fact this task's unit tests can
// check without a database: the filter is still a plain equality against a
// required, non-nullable-by-COALESCE column set, not an OR/IS NULL
// condition that would let an unrouted row leak through.
import { describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

describe("listPartnerNotificationDeliveries stays route-scoped", () => {
  it("filters strictly by COALESCE(context, route) equality, never OR/IS NULL", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ cnt: "0" }] };
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.listPartnerNotificationDeliveries(
      { entrySlug: "entry-1", tenantId: "tenant-1", partnerId: "partner-1" },
      { page: 1, pageSize: 50 },
    );

    const calls = query.mock.calls.map(([sql]) => sql as string);
    for (const sql of calls) {
      expect(sql).toMatch(
        /COALESCE\(ctx\.entry_slug, r\.entry_slug\) = \$\d/,
      );
      expect(sql).not.toMatch(/IS NULL/);
      expect(sql).not.toMatch(/\bOR\b/);
    }
  });
});
