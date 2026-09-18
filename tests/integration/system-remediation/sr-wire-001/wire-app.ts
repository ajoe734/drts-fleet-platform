/** GitHub-hosted acceptance only. Uses compiled, unmodified full AppModule. */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import type { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import type { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import type { RuntimeEligibilityEvaluator } from "../../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { buildHostAcceptanceCandidate } from "../../../e2e/system-remediation/sr-host-fe-001/host-acceptance-app";
import {
  seedHostAcceptanceFixtures,
  HOST_A_PARTNER_ID,
  HOST_B_PARTNER_ID,
} from "../../../e2e/system-remediation/sr-host-fe-001/host-acceptance-seed";

export const DRIVER_ID = "drv_wire_001";
const apiRequire = createRequire(
  path.resolve(__dirname, "../../../../apps/api/package.json"),
);
export interface WireApp {
  get<T>(token: unknown): T;
  setGlobalPrefix(prefix: string): void;
  init(): Promise<void>;
  listen(port: number, host: string): Promise<void>;
  getUrl(): Promise<string>;
  close(): Promise<void>;
}
export function assertRemoteDatabase() {
  const configured = process.env.DRTS_WIRE_TEST_DATABASE_URL;
  if (process.env.GITHUB_ACTIONS !== "true" || !configured) {
    throw new Error(
      "WIRE HTTP/browser acceptance runs only on GitHub-hosted CI with its dedicated PostgreSQL URL; never start this on the development VM.",
    );
  }
  const url = new URL(configured);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error(
      "WIRE acceptance requires its loopback service-container database.",
    );
  }
  if (process.env.DATABASE_URL !== configured)
    throw new Error("DATABASE_URL must be the exact dedicated WIRE database.");
}
export async function createWireApp(port = 0) {
  assertRemoteDatabase();
  buildHostAcceptanceCandidate();
  apiRequire("reflect-metadata");
  const { NestFactory } = apiRequire("@nestjs/core") as {
    NestFactory: {
      create(module: unknown, options: unknown): Promise<WireApp>;
    };
  };
  const { AppModule } = apiRequire("./dist/app.module.js");
  const token = (file: string, name: string): unknown =>
    apiRequire(`./dist/${file}.js`)[name];
  const tokens = {
    database: token("common/db/database.service", "DatabaseService"),
    jwt: token("common/auth/jwt-auth.service", "JwtAuthService"),
    registry: token(
      "modules/regulatory-registry/regulatory-registry.service",
      "RegulatoryRegistryService",
    ),
    leave: token(
      "modules/driver-leave/driver-leave.service",
      "DriverLeaveService",
    ),
    academy: token("modules/driver-academy/academy.service", "AcademyService"),
    shifts: token(
      "modules/shift-attendance/shift-attendance.service",
      "ShiftAttendanceService",
    ),
    presence: token(
      "modules/platform-presence/platform-presence.service",
      "PlatformPresenceService",
    ),
    evaluator: token(
      "modules/vehicle-eligibility/runtime-eligibility-evaluator.service",
      "RuntimeEligibilityEvaluator",
    ),
    readiness: token(
      "modules/fleet-partner/supply-readiness.service",
      "SupplyReadinessService",
    ),
  };
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    abortOnError: false,
    cors: true,
  });
  try {
    const db = app.get<DatabaseService>(tokens.database);
    const registry = app.get<RegulatoryRegistryService>(tokens.registry);
    const template = registry.listDrivers()[0];
    if (!template)
      throw new Error(
        "Real registry contains no driver template for dedicated acceptance seeding.",
      );
    const now = new Date().toISOString();
    const driver = {
      ...structuredClone(template),
      driverId: DRIVER_ID,
      name: "WIRE Test Driver",
      lifecycleStatus: "active",
      dispatchEligible: true,
      licensesValid: true,
      workState: "available",
      eligibilityBlockedReasons: [],
      deviceBindings: [],
      createdAt: now,
      updatedAt: now,
    };
    await db.query(
      `INSERT INTO reg.phase1_registry_drivers (driver_id, full_name, work_state, licenses_valid, updated_at, record)
      VALUES ($1,$2,'available',true,$3,$4::jsonb) ON CONFLICT (driver_id) DO UPDATE SET record=EXCLUDED.record, updated_at=EXCLUDED.updated_at`,
      [DRIVER_ID, driver.name, now, JSON.stringify(driver)],
    );
    await seedHostAcceptanceFixtures();
    app.setGlobalPrefix("api");
    await app.init();
    const jwt = app.get<JwtAuthService>(tokens.jwt);
    const driverSessionId = `sid_wire_${randomUUID()}`;
    const driverSession = await jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: DRIVER_ID,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver"],
        scopes: ["driver:read", "driver:write"],
        requestId: null,
        driverBindingId: driverSessionId,
        driverDeviceId: "wire-ci-device",
      },
      { sessionId: driverSessionId, subject: DRIVER_ID },
    );
    const systemSession = await jwt.issueSessionToken({
      authMode: "jwt_bearer",
      actorType: "system",
      actorId: "wire-ci-reviewer",
      realm: "system",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: [],
      scopes: [
        "driver:read",
        "driver:write",
        "dispatch:read",
        "dispatch:write",
      ],
      requestId: null,
    });
    const hostToken = async (partnerId: string) =>
      (
        await jwt.issueSessionToken({
          authMode: "jwt_bearer",
          actorType: "partner_user",
          actorId: partnerId,
          realm: "partner",
          partnerId,
          tenantId: null,
          roleFamilies: ["partner"],
          roles: ["partner"],
          scopes: ["owned:read", "reports:read", "maintenance:read"],
          requestId: null,
        })
      ).token;
    const hostA = await hostToken(HOST_A_PARTNER_ID);
    const hostB = await hostToken(HOST_B_PARTNER_ID);
    await app.listen(port, "127.0.0.1");
    return {
      app,
      db,
      tokens,
      evaluator: app.get<RuntimeEligibilityEvaluator>(tokens.evaluator),
      baseUrl: `${await app.getUrl()}/api`,
      driverToken: driverSession.token,
      reviewerToken: systemSession.token,
      hostA,
      hostB,
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}

export function camelize(value: unknown): any {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camelize(child),
      ]),
    );
  return value;
}
export async function wireRequest(
  baseUrl: string,
  route: string,
  bearer?: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: camelize(await response.json()) };
}
