// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signTestIapJwtAssertion } from "@drts/control-plane-auth";
import type {
  IamSessionInventoryQuery,
  PlatformAdminUserRecord,
} from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import { ApiClient, ApiClientError } from "../../../packages/api-client/src";
import { createPlatformAdminIamClient } from "../../../apps/platform-admin-web/lib/platform-admin-iam-client";
import { t as translate } from "../../../apps/platform-admin-web/lib/translations";
import { GET as issue } from "../../../apps/platform-admin-web/app/api/identity-session-csrf/route";
import {
  GET,
  POST,
} from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { StepUpProofService } from "../../../apps/api/src/common/auth/step-up-proof.service";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth/auth.types";
import { IdentityController } from "../../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { IAPSubjectAdapter } from "../../../apps/api/src/modules/auth/iap-subject.adapter";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const apiRequire = createRequire(resolve("apps/api/package.json"));
const { Reflector } = apiRequire("@nestjs/core");
const origin = "https://platform.example";
const audience = "/projects/123/apps/controlled-test";
const iapSecret = "controlled-iap-test-key-not-a-provider-key";
const user: PlatformAdminUserRecord = {
  userId: "test-own-admin",
  email: "session-admin@example.test",
  displayName: "Session test admin",
  roleCode: "superadmin",
  status: "active",
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "true");
  vi.stubEnv("IAP_JWT_SECRET_OR_PUBLIC_KEY", iapSecret);
  vi.stubEnv("IAP_EXPECTED_AUDIENCE", audience);
  vi.stubEnv("JWT_SECRET", "controlled-existing-server-secret");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function harness(
  options: {
    listDenied?: boolean;
    writeDenied?: boolean;
    proofDenied?: boolean;
    repositoryFailure?: boolean;
  } = {},
) {
  const repository = new IdentityRepository();
  const now = new Date().toISOString();
  await repository.upsertWorkforceIdentity(
    {
      principalId: user.userId,
      sourceRef: "test:session-admin",
      issuer: "google_iap",
      subject: "accounts.google.com:test-session-admin",
      principalType: "human",
      email: user.email,
      emailVerified: true,
      displayName: user.displayName,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      membershipId: "test-admin-membership",
      sourceRef: "test:session-admin-membership",
      principalId: user.userId,
      realm: "platform",
      scopeRef: "platform:control_plane",
      tenantId: null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    },
    [
      {
        roleBindingId: "test-admin-role",
        sourceRef: "test:session-admin-role",
        membershipId: "test-admin-membership",
        roleCode: "superadmin",
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: now,
        validTo: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  );
  for (const sessionId of ["test-own-session", "test-unselected-session"]) {
    await repository.createSession({
      sessionId,
      sourceRef: `test:${sessionId}`,
      principalId: user.userId,
      actorId: user.userId,
      membershipId: "test-admin-membership",
      realm: "platform",
      status: "active",
      authTime: now,
      authMethods: ["mfa"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2099-01-01T00:00:00Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });
  }
  await repository.createRefreshFamily({
    familyId: "test-own-refresh-family",
    sourceRef: "test:refresh-family",
    sessionId: "test-own-session",
    currentTokenHash: "test-hashed-token",
    counter: 0,
    status: "active",
    expiresAt: "2099-01-01T00:00:00Z",
    compromisedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const controller = new IdentityController(repository);
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    undefined,
    undefined,
    undefined,
    new IAPSubjectAdapter(repository),
    undefined,
    new StepUpProofService(),
  );
  const assertion = signTestIapJwtAssertion(
    {
      sub: "accounts.google.com:test-session-admin",
      email: user.email,
      iss: "https://cloud.google.com/iap",
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 300,
      auth_time: Math.floor(Date.now() / 1000),
      amr: ["mfa", "totp"],
      acr: "aal2",
    },
    iapSecret,
  );
  let cookie = "";
  const calls: { url: string; method: string; headers: Headers }[] = [];
  const upstream: {
    url: URL;
    headers: Headers;
    identity?: BootstrapRequestIdentity;
  }[] = [];
  const revoke = vi.spyOn(repository, "revokeSession");
  if (options.repositoryFailure)
    revoke.mockRejectedValue(
      new ApiRequestError(
        503,
        "TEST_STORAGE_UNAVAILABLE",
        "Controlled storage failure",
      ),
    );

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      origin,
    );
    const method = init?.method || "GET";
    const headers = new Headers(init?.headers);
    if (url.origin === origin) {
      calls.push({ url: url.pathname, method, headers });
      // Only the socket/browser edge is doubled: browser Origin/Referer/cookie
      // handling and the load balancer's controlled signed IAP test assertion.
      if (cookie) headers.set("cookie", cookie);
      headers.set("referer", `${origin}/users`);
      if (method === "POST") headers.set("origin", origin);
      headers.set("x-goog-iap-jwt-assertion", assertion);
      const request = new NextRequest(url, {
        method,
        headers,
        ...(init?.body ? { body: init.body } : {}),
      });
      if (url.pathname === "/api/identity-session-csrf") {
        if (options.proofDenied)
          return Response.json({ error: {} }, { status: 503 });
        const response = await issue(request);
        cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
        return response;
      }
      const path = url.pathname.replace("/control-plane-proxy/", "").split("/");
      return (method === "POST" ? POST : GET)(request, {
        params: Promise.resolve({ path }),
      });
    }
    expect(url.origin).toBe("https://api.example");
    const captured: (typeof upstream)[number] = { url, headers };
    upstream.push(captured);
    const request: AuthenticatedRequestLike = {
      headers: Object.fromEntries(headers.entries()),
      method,
      url: url.pathname,
      originalUrl: url.pathname,
    };
    try {
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getClass: () => IdentityController,
        getHandler: () =>
          method === "POST"
            ? controller.revokeAdminSession
            : controller.listAdminSessions,
      } as unknown as Parameters<typeof guard.canActivate>[0]);
      const identity = request.identity as BootstrapRequestIdentity;
      captured.identity = identity;
      if (
        (options.listDenied && method === "GET") ||
        (options.writeDenied && method === "POST")
      ) {
        throw new ApiRequestError(
          403,
          "AUTH_SCOPE_DENIED",
          "Controlled permission denial",
        );
      }
      const data =
        method === "POST"
          ? await controller.revokeAdminSession(
              identity,
              decodeURIComponent(url.pathname.split("/")[4]!),
              JSON.parse(new TextDecoder().decode(init?.body as ArrayBuffer)),
              { headers: request.headers },
            )
          : await controller.listAdminSessions(
              identity,
              Object.fromEntries(url.searchParams) as IamSessionInventoryQuery,
            );
      return Response.json(deepToSnakeCase(data));
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      return Response.json(error.getResponse(), { status: error.getStatus() });
    }
  });
  const rawClient = new ApiClient({ baseUrl: "/control-plane-proxy" });
  const appRoot = resolve("apps/platform-admin-web");
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@drts/api-client": { ApiClient, ApiClientError },
    "@/lib/admin-client": {
      usePlatformAdminClient: () => rawClient,
      formatDateTime: (v: string) => v,
    },
    "@/lib/i18n": {
      useTranslation: () => ({
        locale: "en",
        t: (key: string) => translate(key, "en"),
      }),
    },
    "@/components/break-glass-context": { useBreakGlass: () => ({}) },
    "@/lib/platform-admin-iam-client": { createPlatformAdminIamClient },
  });
  const { UserDetailDrawer } = load<{
    UserDetailDrawer: React.ComponentType<{
      user: PlatformAdminUserRecord;
      onClose: () => void;
    }>;
  }>(resolve(appRoot, "app/users/users-governance-components.tsx"));
  return { repository, calls, upstream, revoke, rawClient, UserDetailDrawer };
}

it("mounted drawer acquires proof, revokes its selected real repository session and reads the same session back", async () => {
  const h = await harness();
  render(React.createElement(h.UserDetailDrawer, { user, onClose: () => {} }));
  const row = await screen.findByText("test-own-session");
  fireEvent.click(
    within(row.closest("tr")!).getByRole("button", { name: "Revoke" }),
  );
  await waitFor(() => expect(h.revoke).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      within(screen.getByText("test-own-session").closest("tr")!).queryByRole(
        "button",
        { name: "Revoke" },
      ),
    ).toBeNull(),
  );
  expect(h.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
    "GET /control-plane-proxy/identity/sessions",
    "GET /api/identity-session-csrf",
    "POST /control-plane-proxy/identity/sessions/test-own-session/revoke",
    "GET /control-plane-proxy/identity/sessions",
  ]);
  expect(h.calls[2]!.headers.get("x-csrf-token")).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );
  expect(h.upstream[1]!.headers.has("cookie")).toBe(false);
  expect(h.upstream[1]!.identity?.principalId).toBe(user.userId);
  expect(h.revoke).toHaveBeenCalledWith(
    "test-own-session",
    "admin_manual_revoke",
    user.userId,
  );
  expect(await h.repository.getSession("test-own-session")).toMatchObject({
    status: "revoked",
    revokedByPrincipalId: user.userId,
  });
  expect(
    await h.repository.getRefreshFamily("test-own-refresh-family"),
  ).toMatchObject({ status: "revoked" });
  expect(
    await h.repository.getSession("test-unselected-session"),
  ).toMatchObject({ status: "active" });
  expect(screen.queryByText(/Access Denied|Failed/)).toBeNull();
});

it("mounted 403 inventory failure ends loading and rerender does not retry", async () => {
  const h = await harness({ listDenied: true });
  const view = render(
    React.createElement(h.UserDetailDrawer, { user, onClose: () => {} }),
  );
  await screen.findAllByText(/Access Denied.*403/);
  view.rerender(
    React.createElement(h.UserDetailDrawer, { user, onClose: () => {} }),
  );
  expect(h.calls).toHaveLength(1);
  expect(screen.queryByText(/Loading/)).toBeNull();
  expect(h.revoke).not.toHaveBeenCalled();
});

it.each(["writeDenied", "proofDenied", "repositoryFailure"] as const)(
  "mounted %s keeps the selected session active and reports actual failure without automatic retry",
  async (failure) => {
    const h = await harness({ [failure]: true });
    render(
      React.createElement(h.UserDetailDrawer, { user, onClose: () => {} }),
    );
    const row = await screen.findByText("test-own-session");
    fireEvent.click(
      within(row.closest("tr")!).getByRole("button", { name: "Revoke" }),
    );
    await screen.findAllByText(
      failure === "writeDenied"
        ? /Access Denied.*403/
        : failure === "proofDenied"
          ? /Unable to acquire/
          : /Controlled storage failure/,
    );
    expect(screen.queryByText("Revoking…")).toBeNull();
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(
      failure === "proofDenied" ? 0 : 1,
    );
    expect(
      h.calls.filter((c) => c.url === "/control-plane-proxy/identity/sessions"),
    ).toHaveLength(1);
    expect(await h.repository.getSession("test-own-session")).toMatchObject({
      status: "active",
    });
    // The drawer deliberately replaces the table with the failure banner. Only
    // an explicit Refresh recovers the inventory; it never retries the mutation.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("test-own-session");
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(
      failure === "proofDenied" ? 0 : 1,
    );
  },
);
