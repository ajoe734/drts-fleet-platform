import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import { InMemoryDocumentArtifactStore } from "../../apps/api/src/common/document-artifacts";
import type { DocumentArtifactKind } from "../../apps/api/src/common/document-artifacts/document-artifact-kinds";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";
import tenantConfig from "../../apps/tenant-console-web/next.config";
import platformConfig from "../../apps/platform-admin-web/next.config";
import opsConfig from "../../apps/ops-console-web/next.config";
import {
  GET as tenantGet,
  POST as tenantPost,
} from "../../apps/tenant-console-web/app/control-plane-proxy/[...path]/route";
import { GET as platformGet } from "../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";
import { GET as opsGet } from "../../apps/ops-console-web/app/control-plane-proxy/[...path]/route";
import { middleware as tenantMiddleware } from "../../apps/tenant-console-web/middleware";
import { TENANT_SESSION_COOKIE_NAME } from "../../apps/tenant-console-web/lib/auth/constants";

const consoles = [
  {
    name: "tenant",
    config: tenantConfig,
    get: tenantGet,
    kind: "tenant-invoice",
  },
  {
    name: "platform",
    config: platformConfig,
    get: platformGet,
    kind: "placard",
  },
  // Driver statement PDFs are materialised under the report kind.
  { name: "ops", config: opsConfig, get: opsGet, kind: "report" },
] as const;
const bytes = Buffer.from(
  "%PDF-1.4 controlled download routing fixture\n%%EOF",
);

beforeEach(() => {
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("CONTROLLED_DOWNLOAD_HOST", "");
  vi.stubEnv("CONTROLLED_DOWNLOAD_SIGNING_SECRET", "routing-test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture(kind: DocumentArtifactKind) {
  const store = new InMemoryDocumentArtifactStore();
  const record = await store.put({
    kind,
    subjectId: "document-42",
    bytes,
    mimeType: "application/pdf",
  });
  const controller = new ControlledDownloadController(store);
  const metadata = createControlledDownloadMetadata({
    kind,
    subjectId: record.subjectId,
    manifestHash: record.sha256,
  });
  return { controller, metadata };
}

/**
 * Replace only the HTTP boundary: run the real controller and artifact store,
 * serializing its stream/error as Nest would. No server or browser is started.
 * The route is checked against Nest's actual controller/handler metadata.
 */
function connectApi(controller: ControlledDownloadController) {
  const apiFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "metadata.google.internal") {
      expect(init?.headers).toEqual({ "Metadata-Flavor": "Google" });
      return new Response("test-cloud-run-identity");
    }
    expect(url.origin).toBe(process.env.DRTS_API_URL);
    const route = [
      "api", // apps/api/src/main.ts sets the global prefix to api.
      Reflect.getMetadata("path", ControlledDownloadController),
      Reflect.getMetadata(
        "path",
        ControlledDownloadController.prototype.resolve,
      ),
    ].join("/");
    const parts = url.pathname.slice(1).split("/");
    expect(parts).toHaveLength(4);
    expect(`/${parts.slice(0, 2).join("/")}/:kind/:subjectId`).toBe(
      `/${route}`,
    );
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    const query = url.searchParams;
    try {
      const file = await controller.resolve(
        decodeURIComponent(parts[2]!),
        decodeURIComponent(parts[3]!),
        query.get("signed_at") ?? undefined,
        query.get("expires_at") ?? undefined,
        query.get("key_id") ?? undefined,
        query.get("manifest_hash") ?? undefined,
        query.get("sig") ?? undefined,
        query.get("sig_v") ?? undefined,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream()) {
        chunks.push(Buffer.from(chunk));
      }
      const headers = file.getHeaders();
      return new Response(Uint8Array.from(Buffer.concat(chunks)), {
        headers: {
          "content-type": headers.type!,
          ...(headers.disposition
            ? { "content-disposition": headers.disposition }
            : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      return Response.json(error.getResponse(), { status: error.getStatus() });
    }
  });
  vi.stubGlobal("fetch", apiFetch);
  return apiFetch;
}

async function followLink(console: (typeof consoles)[number], link: string) {
  const url = new URL(link, `https://${console.name}.example.test`);
  const headers = { cookie: `${TENANT_SESSION_COOKIE_NAME}=existing-session` };
  if (console.name === "tenant") {
    expect(
      tenantMiddleware(new NextRequest(url, { headers })).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  }
  // Exercise Next's real rewrite matcher, including query preservation.
  const routing = await unstable_getResponseFromNextConfig({
    url: url.href,
    nextConfig: console.config,
  });
  const rewritten = routing.headers.get("x-middleware-rewrite");
  expect(
    rewritten,
    `${console.name} must route the emitted download link`,
  ).not.toBeNull();
  const target = new URL(rewritten!);
  expect(target.origin).toBe(url.origin);
  expect(target.searchParams).toEqual(url.searchParams);
  expect(target.pathname).toBe(`/control-plane-proxy${url.pathname}`);
  return console.get(new NextRequest(target, { headers }), {
    params: Promise.resolve({
      path: target.pathname.split("/").slice(2).map(decodeURIComponent),
    }),
  });
}

describe.each(consoles)("$name controlled download routing", (console) => {
  it.each(["https://api.example.test", "https://routing-api.a.run.app"])(
    "downloads exact bytes through the runtime API origin %s",
    async (origin) => {
      vi.stubEnv("DRTS_API_URL", origin);
      const { controller, metadata } = await fixture(console.kind);
      const apiFetch = connectApi(controller);
      const response = await followLink(console, metadata.downloadUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      const [upstream, init] = apiFetch.mock.calls.at(-1)!;
      expect(new URL(upstream).searchParams).toEqual(
        new URL(metadata.downloadUrl, origin).searchParams,
      );
      if (origin.endsWith(".a.run.app")) {
        expect(
          new Headers(init?.headers).get("x-serverless-authorization"),
        ).toBe("Bearer test-cloud-run-identity");
      }
    },
  );

  it.each([
    ["signature", 403, "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID"],
    ["expired", 410, "CONTROLLED_DOWNLOAD_EXPIRED"],
    ["hash", 409, "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH"],
  ] as const)("preserves API rejection for %s", async (mode, status, code) => {
    const { controller, metadata } = await fixture(console.kind);
    connectApi(controller);
    const link = createControlledDownloadMetadata({
      kind: metadata.kind,
      subjectId: metadata.subjectId,
      manifestHash: mode === "hash" ? "0".repeat(64) : metadata.manifestHash,
      ...(mode === "expired" ? { createdAt: "2020-01-01T00:00:00.000Z" } : {}),
    });
    const url = new URL(link.downloadUrl, "https://console.example.test");
    if (mode === "signature") url.searchParams.set("sig", "00ff");
    const response = await followLink(console, `${url.pathname}${url.search}`);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});

describe("tenant download proxy boundary", () => {
  it.each([
    ["downloads", "tenant-invoice"],
    ["downloads", "tenant-invoice", "document-42", "extra"],
    ["downloads", "..", "document-42"],
    ["downloads", "tenant-invoice", "nested/id"],
    ["platform", "tenants"],
  ])("rejects non-download paths %j", async (...path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await tenantGet(
      new NextRequest(
        "https://tenant.example.test/control-plane-proxy/invalid",
      ),
      { params: Promise.resolve({ path }) },
    );
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not allow download mutations", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await tenantPost(
      new NextRequest(
        "https://tenant.example.test/downloads/tenant-invoice/id",
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({
          path: ["downloads", "tenant-invoice", "id"],
        }),
      },
    );
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the console login gate before rewrites", () => {
    const response = tenantMiddleware(
      new NextRequest(
        "https://tenant.example.test/downloads/tenant-invoice/id",
      ),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});
