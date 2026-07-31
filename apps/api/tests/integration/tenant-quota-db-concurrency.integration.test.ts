import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { TenantQuotaPolicyRecord } from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  TenantPartnerRepository,
  type TenantQuotaMonthlySnapshotRecord,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { createEmptyTenantQuotaUsage } from "../../src/modules/tenant-partner/tenant-quota-ledger";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const DATABASE_URL = process.env.DATABASE_URL;
const PERIOD_KEY = "2099-06";
const RESERVATION_WINDOW_START = "2099-06-01T00:00:00.000Z";
const LIMIT: TenantQuotaPolicyRecord["limit"] = {
  bookingCountLimit: 1,
  amountMinorLimit: null,
  currency: "TWD",
  enforcementMode: "hard_block",
};

type SnapshotRow = {
  record: TenantQuotaMonthlySnapshotRecord;
};

type CountRow = {
  count: number;
};

function createTenantPartnerService(database: DatabaseService) {
  const repository = new TenantPartnerRepository(database);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository,
  );
  return { repository, service };
}

async function deleteTenantQuotaRows(database: DatabaseService, tenantId: string) {
  await database.query(
    "DELETE FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id = $1",
    [tenantId],
  );
  await database.query(
    "DELETE FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1",
    [tenantId],
  );
  await database.query(
    "DELETE FROM core.phase1_tenant_quota_policies WHERE tenant_id = $1",
    [tenantId],
  );
}

describe("tenant quota db concurrency regression", () => {
  const databases: DatabaseService[] = [];
  const services: TenantPartnerService[] = [];
  const tenantIds = new Set<string>();

  afterEach(async () => {
    for (const service of services.splice(0)) {
      service.onModuleDestroy();
    }

    if (DATABASE_URL) {
      const cleanupDatabase = new DatabaseService();
      try {
        for (const tenantId of tenantIds) {
          await deleteTenantQuotaRows(cleanupDatabase, tenantId);
        }
      } finally {
        tenantIds.clear();
        await cleanupDatabase.onModuleDestroy();
      }
    }

    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("lets exactly one service instance consume the same reservation", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const tenantId = `tenant-quota-db-${randomUUID()}`;
    const bookingId = `booking-quota-db-${randomUUID()}`;
    tenantIds.add(tenantId);

    const databaseA = new DatabaseService();
    const databaseB = new DatabaseService();
    databases.push(databaseA, databaseB);

    const serviceA = createTenantPartnerService(databaseA);
    const serviceB = createTenantPartnerService(databaseB);
    services.push(serviceA.service, serviceB.service);

    await deleteTenantQuotaRows(databaseA, tenantId);

    await serviceA.repository.persistChanges({
      quotaPolicies: [
        {
          tenantId,
          costCenterCode: null,
          period: "monthly",
          limit: { ...LIMIT },
          inheritedFromTenant: false,
          createdAt: RESERVATION_WINDOW_START,
          updatedAt: RESERVATION_WINDOW_START,
        },
      ],
      quotaLedger: [
        {
          ledgerEntryId: `quota-ledger-reserve-${randomUUID()}`,
          tenantId,
          costCenterCode: null,
          periodKey: PERIOD_KEY,
          dimension: "booking_count",
          amount: 1,
          entryType: "reserve",
          bookingId,
          evaluationId: `quota-eval-${randomUUID()}`,
          createdAt: RESERVATION_WINDOW_START,
        },
      ],
      quotaMonthlySnapshots: [
        {
          tenantId,
          costCenterCode: null,
          period: "monthly",
          periodKey: PERIOD_KEY,
          limit: { ...LIMIT },
          usage: {
            ...createEmptyTenantQuotaUsage(LIMIT),
            pendingReservedBookingCount: 1,
            bookingCountRemaining: 0,
          },
          refreshedAt: RESERVATION_WINDOW_START,
        },
      ],
    });

    await Promise.all([serviceA.service.onModuleInit(), serviceB.service.onModuleInit()]);

    const results = await Promise.allSettled([
      serviceA.service.consumeTenantQuota({ tenantId, bookingId }),
      serviceB.service.consumeTenantQuota({ tenantId, bookingId }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ ledgerEntries: unknown[] }> =>
        result.status === "fulfilled",
    );
    const winners = fulfilled.filter(
      (result) => result.value.ledgerEntries.length === 1,
    );
    const noops = fulfilled.filter(
      (result) => result.value.ledgerEntries.length === 0,
    );

    expect(results).toHaveLength(2);
    expect(fulfilled).toHaveLength(2);
    expect(winners).toHaveLength(1);
    expect(noops).toHaveLength(1);

    const consumeRows = await databaseA.query<CountRow>(
      `
        SELECT COUNT(*)::int AS count
        FROM core.phase1_tenant_quota_ledger
        WHERE tenant_id = $1
          AND booking_id = $2
          AND entry_type = 'consume'
      `,
      [tenantId, bookingId],
    );
    expect(consumeRows.rows[0]?.count).toBe(1);

    const snapshotRows = await databaseA.query<SnapshotRow>(
      `
        SELECT record
        FROM core.phase1_tenant_quota_monthly_snapshots
        WHERE tenant_id = $1
          AND cost_center_code IS NULL
          AND period = 'monthly'
          AND period_key = $2
      `,
      [tenantId, PERIOD_KEY],
    );
    expect(snapshotRows.rows[0]?.record.usage).toMatchObject({
      pendingReservedBookingCount: 0,
      confirmedBookingCount: 1,
      bookingCountRemaining: 0,
    });
  });
});
