import { resolve } from "node:path";
import { createRequire } from "node:module";
import type { IdentityContext } from "@drts/contracts";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { getTenantRoleScopes } from "../../../apps/api/src/common/auth/auth.constants";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
const { Reflector } = requireApi("@nestjs/core");
const { RouteParamsFactory } = requireApi(
  "@nestjs/core/router/route-params-factory",
);
const { ROUTE_ARGS_METADATA } = requireApi("@nestjs/common/constants");

export function signedIdentity(
  jwt: JwtAuthService,
  tenantId: string,
  role = "tenant_admin",
) {
  // OIDC/identity issued shape: tenant roles share actorType=tenant_admin;
  // authority comes from the original signed catalog scopes, not actorType.
  return jwt.sign({
    actorType: "tenant_admin",
    actorId: `principal-${tenantId}`,
    realm: "tenant",
    tenantId,
    roles: [role],
    roleFamilies: ["tenant"],
    scopes: getTenantRoleScopes(role),
    sessionId: `session-${tenantId}`,
    tokenId: `token-${tenantId}`,
    tokenVersion: 1,
    authTime: new Date().toISOString(),
    amr: ["pwd"],
    acr: "urn:drts:loa:1",
    policyVersion: "unit-current",
  } as never);
}

export async function invokeRoute(
  controller: TenantPartnerController,
  jwt: JwtAuthService,
  handlerName: keyof TenantPartnerController,
  input: {
    token: string;
    tenantId: string;
    method: string;
    url: string;
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string>;
  },
) {
  const request = {
    headers: {
      authorization: `Bearer ${input.token}`,
      "x-tenant-id": input.tenantId,
    },
    method: input.method,
    url: input.url,
    body: input.body,
    params: input.params ?? {},
    query: input.query ?? {},
    identity: undefined as IdentityContext | undefined,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => controller[handlerName],
    getClass: () => TenantPartnerController,
  };
  await new BootstrapAuthGuard(new Reflector(), jwt).canActivate(
    context as never,
  );
  const metadata =
    Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TenantPartnerController,
      handlerName,
    ) ?? {};
  const args: unknown[] = [];
  const paramsFactory = new RouteParamsFactory();
  for (const [key, value] of Object.entries(metadata)) {
    const arg = value as {
      index: number;
      data: unknown;
      factory?: (data: unknown, context: unknown) => unknown;
    };
    args[arg.index] = arg.factory
      ? arg.factory(arg.data, context)
      : paramsFactory.exchangeKeyForValue(Number(key.split(":")[0]), arg.data, {
          req: request,
          res: {},
          next: () => {},
        });
  }
  const handler = controller[handlerName] as (...args: unknown[]) => unknown;
  return handler.apply(controller, args);
}
