// Executed only by the dedicated GitHub-hosted browser acceptance job.
//
// Seeds one real booking (via a direct insert into the same
// ops.phase1_owned_orders table the production write path uses) *before*
// booting the real AppModule, because OwnedMobilityService hydrates its
// in-memory order cache from persisted state exactly once, in onModuleInit.
// GET /api/tenant/bookings/:bookingId (single-booking detail) reads only
// that in-memory cache, so a row inserted after boot would be invisible to
// it even though it is immediately visible to the live-DB-backed list/search
// endpoint. Seeding before boot keeps both endpoints — and therefore the
// dashboard summary and the booking-detail page they both ultimately read
// from OwnedMobilityService.listOrders() — backed by the identical record.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "Browser acceptance servers may run only on GitHub-hosted CI.",
  );
const dbUrl = new URL(process.env.DRTS_ENTERPRISE_DATA_DATABASE_URL || "");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname))
  throw new Error("Disposable local CI database required.");
process.env.DATABASE_URL = dbUrl.href;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.JWT_ALGORITHMS = "HS256";
process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET = randomUUID() + randomUUID();

const apiRequire = createRequire(
  resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../apps/api/package.json",
  ),
);
apiRequire("reflect-metadata");
const { Pool } = apiRequire("pg");

const evidenceDir = resolve(
  process.env.ENTERPRISE_DATA_BROWSER_EVIDENCE_DIR ||
    ".artifacts/enterprise-data-acceptance/browser",
);
mkdirSync(evidenceDir, { recursive: true });

const suffix = randomUUID();
const TENANT_ACTIVE = `browser-active-${suffix}`;
const TENANT_EMPTY = `browser-empty-${suffix}`;
const BOOKING_ID = `ui-data-${suffix}`;
const ORDER_ID = `ord-${BOOKING_ID}`;
// Deliberately never inserted anywhere: proves a genuinely-absent booking,
// not just one this session forgot to create.
const NONEXISTENT_BOOKING_ID = `ui-data-missing-${suffix}`;

async function seedActiveBooking() {
  const pool = new Pool({ connectionString: dbUrl.href });
  try {
    const now = new Date();
    const reservationWindowStart = new Date(
      now.getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();
    const record = {
      orderId: ORDER_ID,
      orderNo: `ORD-${BOOKING_ID}`,
      bookingId: BOOKING_ID,
      tenantId: TENANT_ACTIVE,
      // A real OwnedOrderStatus (see packages/contracts OWNED_ORDER_STATUSES),
      // not an ad hoc bucket label — the frontend's own
      // isEnterpriseActiveTripStatus/getEnterpriseTripProgressStage branch on
      // this exact value.
      status: "enroute_pickup",
      bookingType: "oneway",
      serviceBucket: "business_dispatch",
      dispatchSemantics: "reservation",
      orderSource: "portal",
      orderDomain: "owned",
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: { address: "Enterprise HQ Lobby" },
      dropoff: { address: "Taoyuan Airport T2" },
      passenger: {
        passengerId: `passenger-${BOOKING_ID}`,
        name: "Data Acceptance Passenger",
        phone: "+15550001111",
      },
      reservationWindowStart,
      reservationWindowEnd: reservationWindowStart,
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceFlags: [],
      fixedPrice: false,
      dispatchAttemptCount: 0,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      reservationHoldStatus: "none",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await pool.query(
      `INSERT INTO ops.phase1_owned_orders (
        order_id, order_no, status, order_source, service_bucket,
        dispatch_semantics, created_at, updated_at, record
      ) VALUES ($1, $2, $3, 'enterprise', 'tenant_booking', 'scheduled', $4, $4, $5)`,
      [ORDER_ID, record.orderNo, record.status, record.createdAt, JSON.stringify(record)],
    );
    const readback = await pool.query(
      `SELECT record->>'bookingId' AS booking_id, status FROM ops.phase1_owned_orders WHERE order_id = $1`,
      [ORDER_ID],
    );
    if (
      readback.rows[0]?.booking_id !== BOOKING_ID ||
      readback.rows[0]?.status !== "enroute_pickup"
    ) {
      throw new Error("Seed SQL readback did not match the inserted booking.");
    }
    return record;
  } finally {
    await pool.end();
  }
}

const seededRecord = await seedActiveBooking();

const { NestFactory } = apiRequire("@nestjs/core");
const { AppModule } = apiRequire("./dist/app.module.js");
const { JwtAuthService } = apiRequire("./dist/common/auth/jwt-auth.service.js");
const { TenantPartnerService } = apiRequire(
  "./dist/modules/tenant-partner/tenant-partner.service.js",
);
const { getTenantRoleScopes } = apiRequire(
  "./dist/common/auth/auth.constants.js",
);

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix("api", { exclude: ["health", "metrics"] });
  await app.init();

  const jwt = app.get(JwtAuthService);
  const tenants = app.get(TenantPartnerService);
  const bootstrap = {
    actorType: "system",
    actorId: `data-seed-${suffix}`,
    realm: "system",
    authMode: "bootstrap_headers",
    roleFamilies: ["platform"],
    roles: [],
    scopes: [],
    tenantId: null,
  };

  async function session(tenantId, label) {
    const created = await tenants.createTenantUser(
      tenantId,
      {
        email: `${label}-${suffix}@enterprise-data.example`,
        displayName: `Data ${label}`,
        roleCode: "tenant_admin",
      },
      `seed-${label}`,
      bootstrap,
    );
    await tenants.updateTenantUserRole(
      tenantId,
      created.userId,
      { roleCode: "tenant_admin", status: "active" },
      `activate-${label}`,
      bootstrap,
    );
    const user = tenants.findTenantUser(tenantId, created.userId);
    const identity = {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: user.userId,
      principalId: user.userId,
      realm: "tenant",
      tenantId,
      roleFamilies: ["tenant"],
      roles: [user.roleCode],
      scopes: [...getTenantRoleScopes(user.roleCode)],
      tokenVersion: Date.parse(user.updatedAt),
      authTime: new Date().toISOString(),
      amr: ["mfa", "totp"],
      acr: "aal2",
    };
    const issued = await jwt.issueSessionToken(identity, {
      principalId: user.userId,
      subject: `tenant:${user.userId}`,
      ensurePrincipal: true,
      authTime: identity.authTime,
      amr: identity.amr,
      acr: identity.acr,
    });
    if (!(await jwt.verifyAccessToken(issued.token)))
      throw new Error(`Real JWT failed verification: ${label}`);
    return { tenantId, token: issued.token };
  }

  const sessions = {
    active: await session(TENANT_ACTIVE, "active"),
    empty: await session(TENANT_EMPTY, "empty"),
  };

  // Tokens are private fixture material, never included in uploaded artifact paths.
  writeFileSync(
    resolve(evidenceDir, "sessions.private.json"),
    JSON.stringify(sessions),
    { mode: 0o600 },
  );
  writeFileSync(
    resolve(evidenceDir, "seed-data.json"),
    JSON.stringify(
      {
        candidateSha: process.env.CANDIDATE_SHA,
        bookingId: BOOKING_ID,
        orderId: ORDER_ID,
        nonexistentBookingId: NONEXISTENT_BOOKING_ID,
        tenants: { active: TENANT_ACTIVE, empty: TENANT_EMPTY },
        reservationWindowStart: seededRecord.reservationWindowStart,
        status: seededRecord.status,
      },
      null,
      2,
    ),
  );

  await app.listen(
    Number(process.env.ENTERPRISE_DATA_API_PORT || 4103),
    "127.0.0.1",
  );
  console.log(
    "Enterprise data browser API ready with real JWT and migrated PostgreSQL",
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
