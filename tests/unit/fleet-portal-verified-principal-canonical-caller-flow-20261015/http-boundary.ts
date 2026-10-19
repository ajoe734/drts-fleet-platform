import { Readable } from "node:stream";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import type { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import type { createFixture } from "./services";

export function createApiBoundary({
  fixture,
  guard,
  jwt,
  calls,
  failPath,
}: {
  fixture: ReturnType<typeof createFixture>;
  guard: BootstrapAuthGuard;
  jwt: JwtAuthService;
  calls: Array<{ path: string; headers: Headers; init: RequestInit }>;
  failPath?: string | undefined;
}) {
  // Socket-free HTTP boundary: discover actual Nest route and argument metadata,
  // including CurrentIdentity's real factory. No controller, guard, session,
  // Supply/Case service, document bytes or response normalization is mocked.
  return async function apiBoundary(
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "metadata.google.internal")
      return new Response("independent-invocation-token");
    calls.push({
      path: url.pathname,
      headers: new Headers(init.headers),
      init,
    });
    if (url.pathname === failPath) throw new Error("upstream unavailable");
    const isSession = url.pathname === "/api/auth/session";
    const klass = isSession ? AuthController : FleetPartnerController;
    const instance = isSession
      ? new AuthController(jwt, {} as never, {} as never)
      : fixture.controller;
    const routePath = url.pathname.replace(/^\/api\//, "");
    const methods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "ALL",
      "OPTIONS",
      "HEAD",
    ];
    for (const name of Object.getOwnPropertyNames(klass.prototype)) {
      const handler = Object.getOwnPropertyDescriptor(klass.prototype, name)
        ?.value as ((...args: unknown[]) => unknown) | undefined;
      if (typeof handler !== "function") continue;
      const path = Reflect.getMetadata("path", handler) as string | undefined;
      if (
        !path ||
        methods[Reflect.getMetadata("method", handler) as number] !==
          (init.method ?? "GET")
      )
        continue;
      const params: Record<string, string> = {};
      const mountedPath = [Reflect.getMetadata("path", klass), path]
        .filter(Boolean)
        .map((segment) => String(segment).replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/");
      const pattern = mountedPath
        .split("/")
        .map((segment) => (segment.startsWith(":") ? "([^/]+)" : segment))
        .join("/");
      const match = new RegExp(`^${pattern}$`).exec(routePath);
      if (!match) continue;
      let capture = 1;
      for (const segment of mountedPath.split("/"))
        if (segment.startsWith(":"))
          params[segment.slice(1)] = decodeURIComponent(match[capture++]!);
      const headers = Object.fromEntries(new Headers(init.headers));
      const bytes =
        init.body instanceof ArrayBuffer
          ? Buffer.from(init.body)
          : Buffer.from(String(init.body ?? ""));
      const request = Object.assign(Readable.from([bytes]), {
        headers,
        method: init.method ?? "GET",
        url: url.pathname + url.search,
      }) as unknown as AuthenticatedRequestLike;
      const responseHeaders = new Headers();
      let responseBody: Buffer | string | undefined;
      const res = {
        setHeader: (key: string, value: string | number) =>
          responseHeaders.set(key, String(value)),
        send: (body: Buffer | string) => {
          responseBody = body;
        },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => res,
        }),
        getHandler: () => handler,
        getClass: () => klass,
      };
      try {
        await guard.canActivate(context as never);
        const metadata = Reflect.getMetadata(
          "__routeArguments__",
          klass,
          name,
        ) as Record<
          string,
          {
            index: number;
            data?: string;
            factory?: (data: unknown, context: unknown) => unknown;
          }
        >;
        const args: unknown[] = [];
        for (const [key, arg] of Object.entries(metadata ?? {})) {
          const type = key.split(":")[0];
          if (arg.factory) args[arg.index] = arg.factory(arg.data, context);
          else if (type === "0") args[arg.index] = request;
          else if (type === "1") args[arg.index] = res;
          else if (type === "3")
            args[arg.index] = bytes.length ? JSON.parse(bytes.toString()) : {};
          else if (type === "4")
            args[arg.index] = arg.data
              ? (url.searchParams.get(arg.data) ?? undefined)
              : Object.fromEntries(url.searchParams);
          else if (type === "5")
            args[arg.index] = arg.data ? params[arg.data] : params;
          else if (type === "6")
            args[arg.index] = arg.data ? headers[arg.data] : headers;
          else throw new Error(`Unhandled Nest argument type: ${key}`);
        }
        const result = await handler.apply(instance, args);
        return responseBody !== undefined
          ? new Response(new Uint8Array(Buffer.from(responseBody)), {
              headers: responseHeaders,
            })
          : Response.json(deepToSnakeCase(result));
      } catch (e) {
        const error = e as {
          getStatus?: () => number;
          getResponse?: () => unknown;
        };
        if (!error.getStatus) throw e;
        return Response.json(error.getResponse!(), {
          status: error.getStatus(),
        });
      }
    }
    throw new Error(
      `No production route matched ${init.method ?? "GET"} ${routePath}`,
    );
  };
}
