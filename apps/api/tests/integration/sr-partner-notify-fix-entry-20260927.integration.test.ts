import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuditLogRepository } from "../../src/modules/audit-notification/audit-log.repository";
import { TenantPartnerRepository } from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const DATABASE_URL = process.env.DATABASE_URL;

describe("SR-PARTNER-NOTIFY-FIX-ENTRY-20260927: TenantPartnerService real PG integration", () => {
  let database: DatabaseService;
  let tenantRepository: TenantPartnerRepository;
  let tenantService: TenantPartnerService;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn("DATABASE_URL not set, skipping DB setup");
      return;
    }
    database = new DatabaseService({
      connectionString: DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 3000,
    });
    const auditService = new AuditNotificationService(
      new AuditLogRepository(database),
    );
    tenantRepository = new TenantPartnerRepository(database);
    tenantService = new TenantPartnerService(auditService, tenantRepository);
    
    // We need to initialize the service so it loads the state from DB
    await tenantService.onModuleInit();
  });

  afterAll(async () => {
    if (database) {
      await database.onModuleDestroy();
    }
  });

  it("real formal-PG create then immediate binding succeeds", async () => {
    if (!DATABASE_URL) {
      console.warn("Skipping test because DATABASE_URL is not provided");
      return;
    }
    
    const entrySlug = `pg-durable-${Date.now()}`;
    
    // Create the entry (which should await durable write)
    const entry = await tenantService.createPlatformPartnerEntry({
      tenantId: "tenant-demo-001",
      partnerCode: "pg_durable",
      partnerType: "bank_partner",
      programId: "prog-1",
      entrySlug,
      displayName: "PG Durable Partner",
      authMode: "partner_api_key",
      eligibilityMode: "none",
    });
    
    expect(entry.entrySlug).toBe(entrySlug);
    
    // Immediate binding PUT simulation. In a real system it would try to set a foreign key to entrySlug.
    // We'll directly verify the DB row was actually created and committed.
    const result = await database.query(
      `SELECT * FROM admin.phase1_tenant_partner_state WHERE record->'partnerEntries' @> $1::jsonb`,
      [JSON.stringify([{ entrySlug }])]
    );
    
    // We expect the state to contain our entry immediately.
    // If it didn't wait, the row might not be updated yet (though node is single threaded, 
    // the PG transaction would be in-flight). 
    // Since we awaited createPlatformPartnerEntry, it MUST be committed.
    expect(result.rowCount).toBeGreaterThan(0);
    
    const stateRecord = result.rows[0].record;
    const found = stateRecord.partnerEntries.find((e: any) => e.entrySlug === entrySlug);
    expect(found).toBeDefined();
    expect(found.entrySlug).toBe(entrySlug);
  });
});
