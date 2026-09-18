// SR-LEAVE-BE-001-ACCEPTANCE-RUNNER harness: boots a real NestJS HTTP app
// composing the actual DriverLeaveModule with the actual BootstrapAuthGuard
// and JwtAuthService from apps/api/src/common/auth, so acceptance tests
// exercise real decorators, guards, and cryptographically verified JWTs
// instead of calling controller methods directly with fabricated identities.
//
// This composes a dedicated test module (matching the pattern already used by
// apps/api/tests/integration/int-roc-001-operational-actions.test.ts); it does
// NOT modify or stand in for the real root AppModule, which remains owned by
// SR-WIRE.
import type { AddressInfo } from "node:net";
// Imported by relative path into apps/api's own node_modules rather than as a
// bare specifier: this file lives under the repo-root tests/ tree, which is a
// separate pnpm workspace package from apps/api and does not have @nestjs/*
// hoisted to the repo root. A bare `from "@nestjs/common"` is unresolvable
// from here; the shared root vitest/tsconfig cannot be modified to hoist it
// (central config is out of this task's write scope), so this reaches into
// apps/api's real installed dependency directly instead.
import { Module } from "../../../../apps/api/node_modules/@nestjs/common";
import { APP_GUARD, NestFactory } from "../../../../apps/api/node_modules/@nestjs/core";
import {
  BootstrapAuthGuard,
  JwtAuthService,
  type AuthActorType,
  type AuthRealm,
  type AuthRoleFamily,
} from "../../../../apps/api/src/common/auth";
import { DriverLeaveModule } from "../../../../apps/api/src/modules/driver-leave";

@Module({
  imports: [DriverLeaveModule],
  providers: [JwtAuthService, { provide: APP_GUARD, useClass: BootstrapAuthGuard }],
})
class LeaveAcceptanceHttpTestModule {}

export interface LeaveAcceptanceApp {
  app: Awaited<ReturnType<typeof NestFactory.create>>;
  baseUrl: string;
  jwtAuthService: JwtAuthService;
}

export async function createLeaveAcceptanceApp(): Promise<LeaveAcceptanceApp> {
  const app = await NestFactory.create(LeaveAcceptanceHttpTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error(
      "SR-LEAVE-BE-001-ACCEPTANCE-RUNNER: expected a real HTTP test server address.",
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

export function opsReviewerIdentity(actorId: string): MintTokenOptions {
  return {
    actorType: "ops_user",
    actorId,
    realm: "ops",
    roleFamilies: ["ops"],
    roles: ["ops_manager"],
    scopes: ["dispatch:read", "dispatch:write"],
  };
}

export function opsReadOnlyIdentity(actorId: string): MintTokenOptions {
  return {
    actorType: "ops_user",
    actorId,
    realm: "ops",
    roleFamilies: ["ops"],
    roles: ["ops_viewer"],
    scopes: ["dispatch:read"],
  };
}

// Issues a real, cryptographically signed JWT via the production JwtAuthService
// (HMAC/RSA per JWT_SECRET / JWT_PRIVATE_KEY env, same as production signing).
// BootstrapAuthGuard verifies this token's signature and session claims for
// real on every request; no identity object is ever injected directly.
export async function mintAccessToken(
  jwtAuthService: JwtAuthService,
  options: MintTokenOptions,
): Promise<string> {
  const issued = await jwtAuthService.issueSessionToken({
    authMode: "jwt_bearer",
    actorType: options.actorType,
    actorId: options.actorId,
    realm: options.realm,
    tenantId: null,
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
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : undefined;
  return { status: res.status, body: body as T };
}

export function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}
