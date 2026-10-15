// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import * as controllers from "../../../apps/api/src/modules/passenger-app/review-demo/review-demo.controller";
import * as bff from "../../../apps/ops-console-web/app/control-plane-proxy/[...path]/route";
import OpsReview from "../../../apps/ops-console-web/app/review/page";
import { reviewCopy } from "../../../apps/ops-console-web/app/review/translations";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const { Reflector } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/core");
vi.mock("../../../apps/ops-console-web/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("the real Ops prepare button/BFF reaches a realm-admitted controller without changing passenger authorization", async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_MODE", "test");
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("JWT_SECRET", "synthetic-ops-prepare-unit-key");
  vi.stubEnv("JWT_ISSUER", "drts-local");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  const accounts = new PassengerAccountService(
    new MemoryPassengerStore(),
    new PassengerJwtService(),
  );
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    new JwtAuthService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    accounts,
  );
  // Supply execution is outside this route/auth regression; its real PG path
  // remains covered by the original hosted companions. Do not mock the guard.
  const supply = {
    prepare: vi.fn(async () => ({ simulated: true, supply: [] })),
  };
  const review = Reflect.construct(controllers.ReviewDemoController, [
    null,
    null,
    null,
    null,
    null,
    null,
    supply,
  ]);
  const responses: { path: string; status: number; code?: string }[] = [];
  let admitted: AuthenticatedRequestLike | undefined;
  const context = (
    request: AuthenticatedRequestLike,
    controller: object,
    handler: () => unknown,
  ) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => controller,
      getHandler: () => handler,
    }) as never;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: string | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.startsWith("/control-plane-proxy/")) {
          const method = (init?.method ?? "GET") as "GET" | "POST";
          return bff[method](
            new NextRequest(`https://ops.example${url}`, {
              method,
              headers: init?.headers,
              ...(init?.body ? { body: init.body } : {}),
            }),
            {
              params: Promise.resolve({
                path: url.slice("/control-plane-proxy/".length).split("/"),
              }),
            },
          );
        }
        expect(new URL(url).origin).toBe("https://api.example");
        const path = new URL(url).pathname;
        const request: AuthenticatedRequestLike = {
          method: init?.method ?? "GET",
          url: path,
          headers: Object.fromEntries(new Headers(init?.headers)),
        };
        const isPrepare = path.endsWith("/prepare");
        const Controller = path.startsWith("/api/ops/")
          ? controllers.ReviewDemoOpsController
          : controllers.ReviewDemoController;
        const instance = path.startsWith("/api/ops/")
          ? Reflect.construct(Controller, [supply])
          : review;
        const handler = instance[isPrepare ? "prepare" : "config"];
        try {
          await guard.canActivate(context(request, Controller, handler));
          const result = await handler.call(instance);
          if (isPrepare) {
            admitted = request;
            responses.push({ path, status: 200 });
          }
          return Response.json(result);
        } catch (error) {
          if (!(error instanceof ApiRequestError)) throw error;
          if (isPrepare)
            responses.push({
              path,
              status: error.getStatus(),
              code: error.code,
            });
          return Response.json(error.getResponse(), {
            status: error.getStatus(),
          });
        }
      },
    ),
  );
  render(<OpsReview />);
  const copy = reviewCopy("en");
  fireEvent.click(await screen.findByRole("button", { name: copy.prepare }));
  await waitFor(() => expect(responses).toHaveLength(1));
  // The old real page/BFF/guard returns 401 unauthorized before supply.prepare.
  expect(responses[0]).toEqual({
    path: "/api/ops/review-demo/prepare",
    status: 200,
  });
  await screen.findByText(copy.prepared);
  expect(supply.prepare).toHaveBeenCalledOnce();
  expect(admitted?.identity).toMatchObject({ realm: "ops" });

  const account = await accounts.findOrCreateByIdentity(
    "phone",
    "+886900000003",
  );
  const session = await accounts.issueSession(account.drtsPassengerId);
  const Controller = controllers.ReviewDemoOpsController;
  for (const headers of [
    {},
    { authorization: `Bearer ${session.accessToken}` },
  ]) {
    const request: AuthenticatedRequestLike = {
      method: "POST",
      url: "/api/ops/review-demo/prepare",
      headers,
    };
    await expect(
      Promise.resolve().then(() =>
        guard.canActivate(
          context(request, Controller, Controller.prototype.prepare),
        ),
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  }
  expect(supply.prepare).toHaveBeenCalledOnce();
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "false");
  await expect(new Controller(supply as never).prepare()).rejects.toMatchObject(
    {
      code: "not_found",
    },
  );
  expect(supply.prepare).toHaveBeenCalledOnce();
});
