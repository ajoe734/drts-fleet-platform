// Executed only by the dedicated GitHub-hosted browser acceptance job.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "Browser acceptance servers may run only on GitHub-hosted CI.",
  );
const dbUrl = new URL(process.env.DRTS_ENTERPRISE_SEARCH_DATABASE_URL || "");
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
const { NestFactory } = apiRequire("@nestjs/core");
const { AppModule } = apiRequire("./dist/app.module.js");
const { DatabaseService } = apiRequire("./dist/common/db");
const { JwtAuthService } = apiRequire("./dist/common/auth/jwt-auth.service.js");
const { TenantPartnerService } = apiRequire(
  "./dist/modules/tenant-partner/tenant-partner.service.js",
);
const { getTenantRoleScopes } = apiRequire(
  "./dist/common/auth/auth.constants.js",
);
const evidenceDir = resolve(
  process.env.ENTERPRISE_SEARCH_BROWSER_EVIDENCE_DIR ||
    ".artifacts/enterprise-search-acceptance/browser",
);
mkdirSync(evidenceDir, { recursive: true });

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix("api");
  app.use((req, res, next) => {
    res.on("finish", () => {
      if (req.originalUrl.startsWith("/api/tenant/bookings")) {
        appendFileSync(
          resolve(evidenceDir, "api-requests.jsonl"),
          JSON.stringify({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            tenantId: req.headers["x-tenant-id"] || null,
            recordedAt: new Date().toISOString(),
          }) + "\n",
        );
      }
    });
    next();
  });
  await app.init();
  const db = app.get(DatabaseService);
  const jwt = app.get(JwtAuthService);
  const tenants = app.get(TenantPartnerService);
  const suffix = randomUUID();
  const bootstrap = {
    actorType: "system",
    actorId: `search-seed-${suffix}`,
    realm: "system",
    authMode: "bootstrap_headers",
    roleFamilies: ["platform"],
    roles: [],
    scopes: [],
    tenantId: null,
  };
  const systemSession = await jwt.issueSessionToken(bootstrap, {
    principalId: bootstrap.actorId,
    subject: `system:${bootstrap.actorId}`,
    ensurePrincipal: true,
  });
  async function session(label) {
    const tenantId = `browser-${label}-${suffix}`;
    const created = await tenants.createTenantUser(
      tenantId,
      {
        email: `${label}-${suffix}@enterprise-search.example`,
        displayName: `Search ${label}`,
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
    const options = {
      principalId: user.userId,
      subject: `tenant:${user.userId}`,
      ensurePrincipal: true,
      authTime: identity.authTime,
      amr: identity.amr,
      acr: identity.acr,
    };
    const issued = await jwt.issueSessionToken(identity, options);
    if (!(await jwt.verifyAccessToken(issued.token)))
      throw new Error(`Real JWT failed verification: ${label}`);
    const expired = await jwt.issueSessionToken(identity, {
      ...options,
      expiresIn: "0s",
    });
    if (await jwt.verifyAccessToken(expired.token))
      throw new Error(`Expired JWT unexpectedly verified: ${label}`);
    return { tenantId, token: issued.token, expiredToken: expired.token };
  }
  const identities = {
    a: await session("a"),
    b: await session("b"),
    empty: await session("empty"),
  };
  const rows = [];
  async function seed(which, count) {
    for (let i = 1; i <= count; i++) {
      const tenantId = identities[which].tenantId;
      const bookingId = `ui-${which}-${String(i).padStart(3, "0")}-${suffix}`;
      const orderId = `ord-${bookingId}`;
      const status =
        i === 11 || i === 24
          ? "completed"
          : i === 12 || i === 25
            ? "cancelled"
            : "dispatched";
      const day = i <= 5 ? "10" : i <= 10 ? "11" : "20";
      const record = {
        orderId,
        orderNo: `ORD-${bookingId}`,
        bookingId,
        tenantId,
        status,
        bookingType: "oneway",
        serviceBucket: "business_dispatch",
        dispatchSemantics: "reservation",
        orderSource: "portal",
        orderDomain: "owned",
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: `Origin ${i}` },
        dropoff: { address: `Destination ${i}` },
        passenger: {
          passengerId: `passenger-${bookingId}`,
          name:
            which === "b"
              ? "Other Tenant Secret"
              : i <= 12
                ? "Alpha Passenger"
                : "Beta Passenger",
          phone: "+15550000000",
        },
        reservationWindowStart: `2026-09-${day}T00:00:00.000Z`,
        reservationWindowEnd: `2026-09-${day}T01:00:00.000Z`,
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
        createdAt: `2026-09-09T00:00:${String(i).padStart(2, "0")}.000Z`,
        updatedAt: `2026-09-09T00:00:${String(i).padStart(2, "0")}.000Z`,
      };
      await db.query(
        `INSERT INTO ops.phase1_owned_orders (order_id, order_no, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at, record) VALUES ($1,$2,$3,'enterprise','tenant_booking','scheduled',$4,$4,$5)`,
        [
          orderId,
          record.orderNo,
          status,
          record.createdAt,
          JSON.stringify(record),
        ],
      );
      rows.push({
        bookingId,
        orderId,
        tenantId,
        passenger: record.passenger.name,
        status,
        reservationWindowStart: record.reservationWindowStart,
      });
    }
  }
  await seed("a", 25);
  await seed("b", 3);
  const persisted = await db.query(
    "SELECT record->>'tenantId' AS tenant_id, count(*)::int AS count FROM ops.phase1_owned_orders WHERE record->>'tenantId' = ANY($1::text[]) GROUP BY record->>'tenantId'",
    [Object.values(identities).map((x) => x.tenantId)],
  );
  if (
    persisted.rows.find((x) => x.tenant_id === identities.a.tenantId)?.count !==
    25
  )
    throw new Error("Seed SQL readback did not match tenant A.");
  // Tokens are private fixture material, never included in uploaded artifact paths.
  writeFileSync(
    resolve(evidenceDir, "sessions.private.json"),
    JSON.stringify({ ...identities, wrongRealm: systemSession.token }),
    { mode: 0o600 },
  );
  writeFileSync(
    resolve(evidenceDir, "seed-sql.json"),
    JSON.stringify(
      {
        candidateSha: process.env.CANDIDATE_SHA,
        tenants: Object.fromEntries(
          Object.entries(identities).map(([k, v]) => [k, v.tenantId]),
        ),
        rows,
        sqlCounts: persisted.rows,
      },
      null,
      2,
    ),
  );
  await app.listen(
    Number(process.env.ENTERPRISE_SEARCH_API_PORT || 4102),
    "127.0.0.1",
  );
  console.log(
    "Enterprise browser API ready with real JWT and migrated PostgreSQL",
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
