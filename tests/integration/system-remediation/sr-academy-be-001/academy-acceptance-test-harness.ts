import type { AddressInfo } from "node:net";
import { Module } from "../../../../apps/api/node_modules/@nestjs/common";
import {
  APP_GUARD,
  NestFactory,
} from "../../../../apps/api/node_modules/@nestjs/core";
import {
  BootstrapAuthGuard,
  JwtAuthService,
  type AuthActorType,
  type AuthRealm,
  type AuthRoleFamily,
} from "../../../../apps/api/src/common/auth";
import { DriverAcademyModule } from "../../../../apps/api/src/modules/driver-academy/driver-academy.module";

@Module({
  imports: [DriverAcademyModule],
  providers: [
    JwtAuthService,
    { provide: APP_GUARD, useClass: BootstrapAuthGuard },
  ],
})
class AcademyAcceptanceHttpTestModule {}

export interface AcademyAcceptanceApp {
  app: Awaited<ReturnType<typeof NestFactory.create>>;
  baseUrl: string;
  jwtAuthService: JwtAuthService;
}

export async function createAcademyAcceptanceApp(): Promise<AcademyAcceptanceApp> {
  const app = await NestFactory.create(AcademyAcceptanceHttpTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error(
      "SR-ACADEMY-BE-001-ACCEPTANCE-RUNNER: expected a real HTTP test server address.",
    );
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jwtAuthService: app.get(JwtAuthService),
  };
}

export interface MintTokenOptions {
  actorType: AuthActorType;
  actorId: string;
  realm: AuthRealm;
  tenantId?: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
}

export function driverIdentity(actorId: string): MintTokenOptions {
  return {
    actorType: "driver_user",
    actorId,
    realm: "driver",
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: ["driver:read", "driver:write"],
  };
}

export function tenantFleetAdminIdentity(
  tenantId: string,
  actorId = "user_fleet_admin",
): MintTokenOptions {
  return {
    actorType: "tenant_admin",
    actorId,
    realm: "tenant",
    tenantId,
    roleFamilies: ["tenant"],
    roles: ["tenant_ops_admin"],
    scopes: ["reports:read", "billing:read"],
  };
}

export function opsAdminIdentity(actorId = "user_ops_admin"): MintTokenOptions {
  return {
    actorType: "ops_user",
    actorId,
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_manager"],
    scopes: ["reports:read", "billing:read"],
  };
}

export async function mintAccessToken(
  jwtAuthService: JwtAuthService,
  options: MintTokenOptions,
): Promise<string> {
  const issued = await jwtAuthService.issueSessionToken({
    authMode: "jwt_bearer",
    actorType: options.actorType,
    actorId: options.actorId,
    realm: options.realm,
    tenantId: options.tenantId ?? null,
    roleFamilies: options.roleFamilies,
    roles: options.roles,
    scopes: options.scopes,
    requestId: null,
  });
  return issued.token;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export async function apiRequest<T = unknown>(
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T };
}
