import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Writable } from "node:stream";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import { AGENCY_LOCALE_COOKIE } from "@/lib/locale-config";

const APP_ROOT = path.resolve(__dirname, "../..");
const appRequire = createRequire(path.join(APP_ROOT, "package.json"));

type FlightStreamResult = {
  payload: string;
  errors: unknown[];
};

type RscRuntime = {
  createClientModuleProxy: (moduleId: string) => Record<string, unknown>;
  renderFlightPayload: (element: React.ReactNode) => Promise<FlightStreamResult>;
};

function loadNextRscRuntime(): RscRuntime {
  const nextPkgPath = appRequire.resolve("next/package.json");
  const nextDir = path.dirname(nextPkgPath);
  const reactServer = appRequire(
    path.join(nextDir, "dist/compiled/react/react.react-server.js"),
  );
  const rsdwFile = path.join(
    nextDir,
    "dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js",
  );
  const rsdwSource = fs.readFileSync(rsdwFile, "utf8");
  const rsdwExports: Record<string, unknown> = {};
  const rsdwModule = { exports: rsdwExports };
  const rsdwRequire = (id: string) =>
    id === "react" ? reactServer : appRequire(id);

  const evaluateRsdw = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    rsdwSource,
  );
  evaluateRsdw(
    rsdwExports,
    rsdwRequire,
    rsdwModule,
    rsdwFile,
    path.dirname(rsdwFile),
  );

  const { createClientModuleProxy, renderToPipeableStream } =
    rsdwModule.exports as {
      createClientModuleProxy: (moduleId: string) => Record<string, unknown>;
      renderToPipeableStream: (
        model: React.ReactNode,
        webpackMap: Record<
          string,
          { id: string; chunks: string[]; name: string }
        >,
        options?: { onError?: (error: unknown) => string | undefined },
      ) => { pipe: <T extends NodeJS.WritableStream>(destination: T) => T };
    };

  const clientManifest = new Proxy(
    {} as Record<string, { id: string; chunks: string[]; name: string }>,
    {
      get(_target, prop) {
        const raw = String(prop);
        const [id, name = ""] = raw.split("#");
        return { id, chunks: [], name };
      },
    },
  );

  function renderFlightPayload(
    element: React.ReactNode,
  ): Promise<FlightStreamResult> {
    return new Promise((resolve, reject) => {
      const errors: unknown[] = [];
      let payload = "";
      const { pipe } = renderToPipeableStream(element, clientManifest, {
        onError(err) {
          errors.push(err);
          return err instanceof Error ? err.message : String(err);
        },
      });
      const sink = new Writable({
        write(chunk, _encoding, callback) {
          payload += Buffer.isBuffer(chunk)
            ? chunk.toString("utf8")
            : String(chunk);
          callback();
        },
        final(callback) {
          callback();
          resolve({ payload, errors });
        },
      });
      sink.on("error", reject);
      pipe(sink);
    });
  }

  return { createClientModuleProxy, renderFlightPayload };
}

function hasUseClientDirective(source: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      if (statement.expression.text === "use client") {
        return true;
      }
    } else {
      break;
    }
  }
  return false;
}

function resolveSourceFile(basePath: string): string {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module at ${basePath}`);
}

function createRscBoundaryServerLoader(options: {
  rscRuntime: RscRuntime;
  getCookieValue: () => string | undefined;
  sourceOverrides?: Record<string, string>;
}) {
  const { rscRuntime, getCookieValue, sourceOverrides = {} } = options;
  const cache = new Map<string, unknown>();

  const externalMocks: Record<string, unknown> = {
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "next/headers": {
      cookies: vi.fn(async () => ({
        get: (name: string) => {
          const val = getCookieValue();
          return name === AGENCY_LOCALE_COOKIE && val !== undefined
            ? { name, value: val }
            : undefined;
        },
      })),
    },
    "next/navigation": {
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    },
    "@/lib/session.server": {
      firstParam: (value: string | string[] | undefined) => {
        const first = Array.isArray(value) ? value[0] : value;
        return typeof first === "string" && first.trim()
          ? first.trim()
          : undefined;
      },
    },
  };

  function loadServerModule(specifier: string, fromDir = APP_ROOT): unknown {
    if (specifier in externalMocks) {
      return externalMocks[specifier];
    }
    if (specifier === "react") {
      return React;
    }
    if (
      specifier === "react/jsx-runtime" ||
      specifier === "react/jsx-dev-runtime"
    ) {
      return jsxRuntime;
    }

    let targetPath: string;
    if (specifier.startsWith("@/")) {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, specifier.slice(2)),
      );
    } else if (specifier === "@drts/ui-web") {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, "../../packages/ui-web/src/index.tsx"),
      );
    } else if (specifier.startsWith(".")) {
      targetPath = resolveSourceFile(path.resolve(fromDir, specifier));
    } else {
      throw new Error(
        `Unmocked external module in RSC boundary loader: ${specifier}`,
      );
    }

    const existing = cache.get(targetPath);
    if (existing !== undefined) {
      return existing;
    }

    const relativePath = path
      .relative(APP_ROOT, targetPath)
      .split(path.sep)
      .join("/");
    const source =
      sourceOverrides[relativePath] ?? fs.readFileSync(targetPath, "utf8");

    // Enforce actual Next.js / React Server Components "use client" module proxy boundary:
    // Client exports are Client Reference proxies that can be rendered as JSX elements
    // or passed as props, but throw if invoked directly as functions from a Server Component.
    if (hasUseClientDirective(source, targetPath)) {
      const clientProxy = rscRuntime.createClientModuleProxy(relativePath);
      cache.set(targetPath, clientProxy);
      return clientProxy;
    }

    const exportsObj: Record<string, unknown> = {};
    const moduleObj = { exports: exportsObj };
    cache.set(targetPath, exportsObj);

    const { outputText } = ts.transpileModule(source, {
      fileName: targetPath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const localRequire = (childSpecifier: string) =>
      loadServerModule(childSpecifier, path.dirname(targetPath));
    const evaluateServerModule = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText,
    );
    evaluateServerModule(
      moduleObj.exports,
      localRequire,
      moduleObj,
      targetPath,
      path.dirname(targetPath),
    );
    cache.set(targetPath, moduleObj.exports);
    return moduleObj.exports;
  }

  return { loadServerModule };
}

describe("Agency portal Server/Client RSC locale boundary (AGENCY-SERVER-CLIENT-LOCALE-BOUNDARY-20261025)", () => {
  const rscRuntime = loadNextRscRuntime();
  let mockedLocaleCookie: string | undefined;

  beforeEach(() => {
    mockedLocaleCookie = undefined;
  });

  it("reproduces the pre-fix 2755ce2ed644 RSC failure when a Server Component layout invokes client-exported toHtmlLang(locale)", async () => {
    const preFixLayoutSource = [
      'import type { ReactNode } from "react";',
      'import { LanguageProvider, toHtmlLang } from "@/lib/i18n";',
      'import { getServerLocale } from "@/lib/server-locale";',
      "export default async function BrokenRootLayout({ children }: { children: ReactNode }) {",
      "  const locale = await getServerLocale();",
      "  return (",
      "    <html lang={toHtmlLang(locale)}>",
      "      <body>",
      "        <LanguageProvider defaultLocale={locale}>{children}</LanguageProvider>",
      "      </body>",
      "    </html>",
      "  );",
      "}",
    ].join("\n");

    const brokenLoader = createRscBoundaryServerLoader({
      rscRuntime,
      getCookieValue: () => mockedLocaleCookie,
      sourceOverrides: {
        "app/layout.tsx": preFixLayoutSource,
      },
    });

    const brokenLayoutMod = brokenLoader.loadServerModule("@/app/layout") as {
      default: (props: {
        children: React.ReactNode;
      }) => Promise<React.ReactElement>;
    };

    mockedLocaleCookie = "zh";
    await expect(
      brokenLayoutMod.default({
        children: React.createElement("main", null, "login"),
      }),
    ).rejects.toThrow(
      /Attempted to call toHtmlLang\(\) from the server but toHtmlLang is on the client/,
    );

    mockedLocaleCookie = "en";
    await expect(
      brokenLayoutMod.default({
        children: React.createElement("main", null, "invite"),
      }),
    ).rejects.toThrow(
      /Attempted to call toHtmlLang\(\) from the server but toHtmlLang is on the client/,
    );
  });

  it("renders RootLayout and generateMetadata across the RSC client-reference boundary for zh, en, and fallback cookies without calling client functions", async () => {
    const loader = createRscBoundaryServerLoader({
      rscRuntime,
      getCookieValue: () => mockedLocaleCookie,
    });

    const layoutMod = loader.loadServerModule("@/app/layout") as {
      default: (props: {
        children: React.ReactNode;
      }) => Promise<React.ReactElement<{ lang?: string; children?: React.ReactNode }>>;
      generateMetadata: () => Promise<{
        title?: string;
        description?: string;
        robots?: { index?: boolean; follow?: boolean };
      }>;
    };

    // 1. Default (missing cookie) -> zh / zh-Hant
    mockedLocaleCookie = undefined;
    const defaultMeta = await layoutMod.generateMetadata();
    expect(defaultMeta.title).toBe("DRTS 主管機關唯讀查詢");
    expect(defaultMeta.description).toBe("主管機關唯讀查詢介面（BUREAU-R13）");
    expect(defaultMeta.robots).toEqual({ index: false, follow: false });

    const zhRootElement = await layoutMod.default({
      children: React.createElement("main", null, "agency-content-zh"),
    });
    expect(zhRootElement.type).toBe("html");
    expect(zhRootElement.props.lang).toBe("zh-Hant");

    const zhFlight = await rscRuntime.renderFlightPayload(zhRootElement);
    expect(zhFlight.errors).toEqual([]);
    expect(zhFlight.payload).toContain('"lang":"zh-Hant"');
    expect(zhFlight.payload).toContain('"defaultLocale":"zh"');
    expect(zhFlight.payload).toContain("lib/i18n.tsx");
    expect(zhFlight.payload).toContain("LanguageProvider");

    // 2. English cookie (drts-locale-v2=en) -> en / en
    mockedLocaleCookie = "en";
    const enMeta = await layoutMod.generateMetadata();
    expect(enMeta.title).toBe("DRTS Regulatory Agency Read-Only Portal");
    expect(enMeta.description).toBe(
      "Regulatory agency read-only query portal (BUREAU-R13)",
    );

    const enRootElement = await layoutMod.default({
      children: React.createElement("main", null, "agency-content-en"),
    });
    expect(enRootElement.type).toBe("html");
    expect(enRootElement.props.lang).toBe("en");

    const enFlight = await rscRuntime.renderFlightPayload(enRootElement);
    expect(enFlight.errors).toEqual([]);
    expect(enFlight.payload).toContain('"lang":"en"');
    expect(enFlight.payload).toContain('"defaultLocale":"en"');
    expect(enFlight.payload).toContain("lib/i18n.tsx");
    expect(enFlight.payload).toContain("LanguageProvider");

    // 3. Invalid cookie value falls back to zh / zh-Hant
    mockedLocaleCookie = "unsupported-locale";
    const fallbackRootElement = await layoutMod.default({
      children: React.createElement("main", null, "agency-content-fallback"),
    });
    expect(fallbackRootElement.props.lang).toBe("zh-Hant");
  });

  it("renders public /login and /invite entry trees inside RootLayout across the RSC client-reference boundary in both zh and en", async () => {
    const loader = createRscBoundaryServerLoader({
      rscRuntime,
      getCookieValue: () => mockedLocaleCookie,
    });

    const layoutMod = loader.loadServerModule("@/app/layout") as {
      default: (props: {
        children: React.ReactNode;
      }) => Promise<React.ReactElement>;
    };
    const loginMod = loader.loadServerModule("@/app/login/page") as {
      default: (props: {
        searchParams: Promise<Record<string, string | string[] | undefined>>;
      }) => Promise<React.ReactElement>;
    };
    const inviteMod = loader.loadServerModule("@/app/invite/page") as {
      default: (props: {
        searchParams: Promise<Record<string, string | string[] | undefined>>;
      }) => Promise<React.ReactElement>;
    };

    for (const [locale, expectedHtmlLang, expectedLoginTitle, expectedInviteTitle] of [
      [
        "zh",
        "zh-Hant",
        "主管機關唯讀查詢",
        "接受機關帳號邀請",
      ],
      [
        "en",
        "en",
        "Regulatory Agency Read-Only Portal",
        "Accept Agency Account Invitation",
      ],
    ] as const) {
      mockedLocaleCookie = locale;

      const loginPageElement = await loginMod.default({
        searchParams: Promise.resolve({
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          redirect_uri: "/trip-records",
        }),
      });
      const loginRootTree = await layoutMod.default({
        children: loginPageElement,
      });
      const loginFlight = await rscRuntime.renderFlightPayload(loginRootTree);
      expect(loginFlight.errors).toEqual([]);
      expect(loginFlight.payload).toContain(`"lang":"${expectedHtmlLang}"`);
      expect(loginFlight.payload).toContain(`"defaultLocale":"${locale}"`);
      expect(loginFlight.payload).toContain("components/language-switch.tsx");
      expect(loginFlight.payload).toContain("LanguageSwitch");
      expect(loginFlight.payload).toContain(expectedLoginTitle);
      expect(loginFlight.payload).toContain(
        "/api/auth/agency/login?redirect_uri=%2Ftrip-records",
      );

      const invitePageElement = await inviteMod.default({
        searchParams: Promise.resolve({
          token: "inv_tok_20261025",
        }),
      });
      const inviteRootTree = await layoutMod.default({
        children: invitePageElement,
      });
      const inviteFlight = await rscRuntime.renderFlightPayload(inviteRootTree);
      expect(inviteFlight.errors).toEqual([]);
      expect(inviteFlight.payload).toContain(`"lang":"${expectedHtmlLang}"`);
      expect(inviteFlight.payload).toContain(`"defaultLocale":"${locale}"`);
      expect(inviteFlight.payload).toContain("components/language-switch.tsx");
      expect(inviteFlight.payload).toContain("LanguageSwitch");
      expect(inviteFlight.payload).toContain(expectedInviteTitle);
      expect(inviteFlight.payload).toContain(
        "/api/auth/agency/login?token=inv_tok_20261025",
      );
    }
  });
});
