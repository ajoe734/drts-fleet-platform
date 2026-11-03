import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";
import { DatabaseService } from "../../src/common/db";
import { AgencyAccessAuditService } from "../../src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../src/modules/agency-access/agency-access-log.repository";
import { AgencyDirectoryRepository } from "../../src/modules/agency-access/agency-directory.repository";
import { AgencyPortalService } from "../../src/modules/agency-access/agency-portal.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

// BUREAU-R13 admin.agency_access_logs (V0133) on the formal migrated schema.
// Runs in the existing hosted Product smoke acceptance job after db:migrate.
// Local VM: skip; do not launch PostgreSQL/Docker to satisfy this suite.
describe.skipIf(!process.env.DATABASE_URL)(
  "Agency access log append-only table on the formal schema",
  () => {
    const database = new DatabaseService();
    const logs = new AgencyAccessLogRepository(database);
    const id = randomUUID().replace(/-/g, "");
    const agencyId = `agency_log_${id}`;
    const principalId = `principal_log_${id}`;

    async function seed() {
      const now = new Date().toISOString();
      await new AgencyDirectoryRepository(database).create({
        agencyId,
        agencyCode: `LOG-${id}`,
        displayName: "Access log fixture agency",
        status: "active",
        createdByPrincipalId: null,
        createdAt: now,
        updatedAt: now,
      });
      await new IdentityRepository(database).ensurePrincipalRecord({
        principalId,
        sourceRef: `agency_log_fixture:${id}`,
        issuer: "agency_invitation",
        subject: `agency:${agencyId}:fixture`,
        principalType: "human",
        email: null,
        emailVerified: false,
        displayName: null,
        status: "invited",
        createdAt: now,
        updatedAt: now,
      });
    }

    async function appendOne() {
      return logs.append({
        agencyId,
        principalId,
        membershipId: `membership_log_${id}`,
        sessionId: null,
        action: "list",
        resourceType: "trip_record",
        routeKey: "agency:trip-records:list",
        resourceId: null,
        filter: { month: "2026-10" },
        rowCount: 3,
        totalCount: 3,
        outcome: "success",
        reasonCode: null,
        exportManifestHash: null,
        requestId: `req-${id}`,
        sourceIpPrefix: "203.0.113.0/24",
        userAgentHash: null,
      });
    }

    afterAll(async () => {
      try {
        // Lawful retention path only (V0080 contract); ignored if this
        // database user is not a member of audit_retention_operator.
        const client = await database.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL audit.allow_retention_archival = 'on'");
          await client.query(
            "DELETE FROM admin.agency_access_logs WHERE agency_id = $1",
            [agencyId],
          );
          await client.query("COMMIT");
        } catch {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      } finally {
        await database.onModuleDestroy();
      }
    });

    it("appends and reads back a row through the production repository", async () => {
      await seed();
      const written = await appendOne();
      expect(written).toMatchObject({
        agencyId,
        principalId,
        action: "list",
        outcome: "success",
        rowCount: 3,
        filter: { month: "2026-10" },
      });
      const page = await logs.list({ agencyId });
      expect(page.items.map((item) => item.accessId)).toContain(
        written.accessId,
      );
    });

    it("rejects UPDATE, DELETE and TRUNCATE for the application role", async () => {
      const written = await appendOne();
      await expect(
        database.query(
          "UPDATE admin.agency_access_logs SET row_count = 0 WHERE access_id = $1",
          [written.accessId],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        database.query(
          "DELETE FROM admin.agency_access_logs WHERE access_id = $1",
          [written.accessId],
        ),
      ).rejects.toThrow(/append-only/);
      const client = await database.connect();
      try {
        // Inside a transaction so a missing trigger could never wipe the table.
        await client.query("BEGIN");
        await expect(
          client.query("TRUNCATE admin.agency_access_logs"),
        ).rejects.toThrow(/append-only/);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      const page = await logs.list({ agencyId });
      expect(page.items.map((item) => item.accessId)).toContain(
        written.accessId,
      );
    });

    it("rejects a denied/error row that claims returned rows (CHECK)", async () => {
      await expect(
        logs.append({
          agencyId,
          principalId,
          membershipId: `membership_log_${id}`,
          sessionId: null,
          action: "detail",
          resourceType: "trip_record",
          routeKey: "agency:trip-records:detail",
          resourceId: "mtr-x",
          filter: {},
          rowCount: 1,
          totalCount: null,
          outcome: "denied",
          reasonCode: "AUTH_SCOPE_DENIED",
          exportManifestHash: null,
          requestId: null,
          sourceIpPrefix: null,
          userAgentHash: null,
        }),
      ).rejects.toThrow();
    });

    it("returns 503 and no data when the access log write fails", async () => {
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: principalId,
        principalId,
        membershipId: `membership_log_${id}`,
        realm: "agency",
        tenantId: null,
        // Not a core.regulatory_agencies row: the FK makes the append fail.
        agencyId: `agency_missing_${id}`,
        roleFamilies: ["agency"],
        roles: ["agency_viewer"],
        scopes: ["agency:trip_records:read"],
        requestId: null,
      };
      const multiTaxi = {
        listTripOperationalRecords: vi.fn(async () => []),
      };
      const service = new AgencyPortalService(
        new AgencyAccessAuditService(logs),
        { resolveActiveAccess: async () => ({}) } as never,
        multiTaxi as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(
        service.listTripRecords(identity, {}, {}),
      ).rejects.toMatchObject({
        code: "AGENCY_ACCESS_AUDIT_UNAVAILABLE",
        status: 503,
      });
    });
  },
);
