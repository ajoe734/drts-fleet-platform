import { NextRequest } from "next/server";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { identity, tenantId, type harness } from "./fixture";

export async function signedTransport(
  x: ReturnType<typeof harness>,
  proxy: {
    GET: (
      request: NextRequest,
      context: { params: Promise<{ path: string[] }> },
    ) => Promise<Response>;
  },
) {
  const jwt = new JwtAuthService(new IdentityRepository());
  const guard = new BootstrapAuthGuard(
    { getAllAndOverride: () => undefined } as never,
    jwt,
  );
  const issue = (
    overrides: Partial<typeof identity> = {},
    expiresIn: "1h" | "0s" = "1h",
  ) =>
    jwt.issueSessionToken(
      {
        ...identity,
        ...overrides,
        actorId: overrides.actorId ?? identity.actorId!,
      },
      { expiresIn },
    );
  const issued = await issue();
  let token: string | undefined = issued.token;
  let locale = "zh";
  const requests: Array<{ path: string; method: string; headers: Headers }> =
    [];
  const failures: string[] = [];
  const fetcher = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input), "http://enterprise.contact.test");
    const headers = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    if (url.pathname.startsWith("/control-plane-proxy/")) {
      if (token) headers.set("cookie", `drts_tenant_session=${token}`);
      const path = url.pathname
        .slice("/control-plane-proxy/".length)
        .split("/");
      return proxy.GET(new NextRequest(url, { method, headers }), {
        params: Promise.resolve({ path }),
      });
    }
    if (url.pathname === "/api/auth/session") {
      const bearer = headers.get("authorization")?.replace(/^Bearer /, "");
      const payload = bearer ? await jwt.verifyAccessToken(bearer) : null;
      return Response.json(
        {
          data: {
            active: !!payload,
            identity: payload
              ? {
                  realm: payload.realm,
                  tenant_id: payload.tenantId,
                  actor_id: payload.sub,
                  scopes: payload.scopes,
                }
              : null,
          },
        },
        { status: payload ? 200 : 401 },
      );
    }
    requests.push({ path: url.pathname, method, headers });
    const request = {
      method,
      url: url.pathname,
      originalUrl: url.pathname,
      headers: Object.fromEntries(headers),
      identity: undefined as BootstrapRequestIdentity | undefined,
    };
    try {
      await guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0]);
      if (url.pathname.endsWith("/driver-contact"))
        return Response.json(
          await x.invoke(
            request.identity ?? null,
            decodeURIComponent(url.pathname.split("/").at(-2)!),
            headers.get("x-tenant-id") ?? "",
          ),
        );
      if (url.pathname === "/api/tenant/dashboard") {
        const b = x.service.getTenantBooking(tenantId, "contact-booking");
        return Response.json({
          data: {
            upcomingBookings: [
              {
                bookingId: b.bookingId,
                orderId: b.orderId,
                status: b.orderStatus,
                passengerName: b.passenger.name,
                pickupAddress: b.pickup.address,
                dropoffAddress: b.dropoff.address,
                reservationWindowStart: b.reservationWindowStart,
                reservationWindowEnd: b.reservationWindowEnd,
                costCenterCode: b.costCenter,
              },
            ],
          },
        });
      }
      return Response.json({ error: "ROUTE_NOT_FOUND" }, { status: 404 });
    } catch (error) {
      if (error instanceof TypeError) failures.push(error.message);
      const e = error as {
        getStatus?: () => number;
        getResponse?: () => unknown;
      };
      return Response.json(e.getResponse?.() ?? { error: "UPSTREAM_FAILED" }, {
        status: e.getStatus?.() ?? 500,
      });
    }
  };
  return {
    jwt,
    issue,
    issued,
    fetcher,
    requests,
    failures,
    get token() {
      return token;
    },
    set token(value) {
      token = value;
    },
    get locale() {
      return locale;
    },
    set locale(value) {
      locale = value;
    },
    cookies: async () => ({
      get: (name: string) =>
        name === "drts_tenant_session" && token
          ? { value: token }
          : name === "drts-locale-v2"
            ? { value: locale }
            : undefined,
    }),
  };
}
