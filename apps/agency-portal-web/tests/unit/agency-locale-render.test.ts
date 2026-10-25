import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import { AGENCY_LOCALE_COOKIE } from "@/lib/locale-config";
import type { Locale } from "@/lib/translations";

const APP_ROOT = path.resolve(__dirname, "../..");

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

function createAppLoader(mocks: Record<string, unknown>) {
  const cache = new Map<string, Record<string, unknown>>();

  function loadModule(specifier: string, fromDir = APP_ROOT): unknown {
    if (specifier in mocks) {
      return mocks[specifier];
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
      targetPath = resolveSourceFile(path.resolve(APP_ROOT, specifier.slice(2)));
    } else if (specifier === "@drts/ui-web") {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, "../../packages/ui-web/src/index.tsx"),
      );
    } else if (specifier.startsWith(".")) {
      targetPath = resolveSourceFile(path.resolve(fromDir, specifier));
    } else {
      throw new Error(`Unmocked external module in test loader: ${specifier}`);
    }

    const existing = cache.get(targetPath);
    if (existing) {
      return existing;
    }

    const exportsObj: Record<string, unknown> = {};
    const moduleObj = { exports: exportsObj };
    cache.set(targetPath, exportsObj);

    const source = fs.readFileSync(targetPath, "utf8");
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
      loadModule(childSpecifier, path.dirname(targetPath));
    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText,
    );
    fn(
      moduleObj.exports,
      localRequire,
      moduleObj,
      targetPath,
      path.dirname(targetPath),
    );
    cache.set(targetPath, moduleObj.exports);
    return moduleObj.exports;
  }

  return { loadModule };
}

function stripIntentionalLanguageToggleCopy(html: string): string {
  return html.replaceAll("繁體中文", "").replaceAll("文/A", "");
}

describe("Agency portal server and component rendering in zh and en", () => {
  let mockedLocaleCookie: Locale = "zh";
  let mockedAgencyDataQueue: Array<{
    ok: boolean;
    status: number;
    data: unknown;
    error: { code: string | null; message: string | null } | null;
  }> = [];

  const loader = createAppLoader({
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "next/link": {
      default: ({
        href,
        children,
        ...rest
      }: {
        href: string;
        children?: React.ReactNode;
      }) => React.createElement("a", { href, ...rest }, children),
    },
    "next/headers": {
      cookies: vi.fn(async () => ({
        get: (name: string) =>
          name === AGENCY_LOCALE_COOKIE
            ? { name, value: mockedLocaleCookie }
            : undefined,
      })),
    },
    "next/navigation": {
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
      useRouter: () => ({
        refresh: vi.fn(),
      }),
    },
    "@drts/tenant-auth/api-fetch": {
      resolveTenantApiUrl: () => "http://localhost:3001",
    },
    "@drts/agency-auth/verified-agency-session.server": {
      verifyAgencySession: vi.fn(async () => ({
        session: {
          agencyId: "AGY-TPE-001",
          principalId: "usr-agency-01",
          roles: ["agency_exporter"],
        },
      })),
    },
    "@/lib/session.server": {
      firstParam: (value: string | string[] | undefined) => {
        const first = Array.isArray(value) ? value[0] : value;
        return typeof first === "string" && first.trim()
          ? first.trim()
          : undefined;
      },
      requireAgencyToken: vi.fn(async () => "tok-agency-valid"),
      readAgencyProfile: vi.fn(async () => ({
        agencyId: "AGY-TPE-001",
        agencyDisplayName: "Taipei City DOT",
        roleCode: "agency_exporter",
        accessValidTo: "2027-12-31T15:59:59.000Z",
      })),
      loadAgencyData: vi.fn(async () => {
        const next = mockedAgencyDataQueue.shift();
        return (
          next ?? {
            ok: true,
            status: 200,
            data: null,
            error: null,
          }
        );
      }),
    },
  });

  const layoutMod = loader.loadModule("@/app/layout") as {
    default: (props: { children: React.ReactNode }) => Promise<React.ReactElement>;
    generateMetadata: () => Promise<{ title?: string; description?: string }>;
  };
  const loginMod = loader.loadModule("@/app/login/page") as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };
  const inviteMod = loader.loadModule("@/app/invite/page") as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };
  const homeMod = loader.loadModule("@/app/page") as {
    default: () => Promise<React.ReactElement>;
  };
  const driversMod = loader.loadModule("@/app/qualifications/drivers/page") as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };
  const vehiclesMod = loader.loadModule(
    "@/app/qualifications/vehicles/page",
  ) as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };
  const complaintsMod = loader.loadModule("@/app/reports/complaints/page") as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };
  const dailyDispatchMod = loader.loadModule(
    "@/app/reports/daily-dispatch/page",
  ) as {
    default: (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<React.ReactElement>;
  };

  beforeEach(() => {
    mockedLocaleCookie = "zh";
    mockedAgencyDataQueue = [];
  });

  it("renders localized RootLayout html lang and metadata for zh and en", async () => {
    mockedLocaleCookie = "zh";
    const zhMeta = await layoutMod.generateMetadata();
    const zhLayoutHtml = renderToStaticMarkup(
      await layoutMod.default({
        children: React.createElement("div", null, "body"),
      }),
    );
    expect(zhMeta.title).toBe("DRTS 主管機關唯讀查詢");
    expect(zhLayoutHtml).toContain('<html lang="zh-Hant">');

    mockedLocaleCookie = "en";
    const enMeta = await layoutMod.generateMetadata();
    const enLayoutHtml = renderToStaticMarkup(
      await layoutMod.default({
        children: React.createElement("div", null, "body"),
      }),
    );
    expect(enMeta.title).toBe("DRTS Regulatory Agency Read-Only Portal");
    expect(enMeta.description).toBe(
      "Regulatory agency read-only query portal (BUREAU-R13)",
    );
    expect(enLayoutHtml).toContain('<html lang="en">');
  });

  it("renders unauthenticated LoginPage and InvitePage with language switch and localized alerts in zh and en", async () => {
    mockedLocaleCookie = "zh";
    const zhLoginHtml = renderToStaticMarkup(
      await loginMod.default({
        searchParams: Promise.resolve({
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          redirect_uri: "/trip-records",
        }),
      }),
    );
    expect(zhLoginHtml).toContain("主管機關唯讀查詢");
    expect(zhLoginHtml).toContain("使用 Google 帳號登入");
    expect(zhLoginHtml).toContain("此 Google 帳號未綁定有效的機關帳號");
    expect(zhLoginHtml).toContain("切換語言至 English");

    mockedLocaleCookie = "en";
    const enLoginHtml = renderToStaticMarkup(
      await loginMod.default({
        searchParams: Promise.resolve({
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          redirect_uri: "/trip-records",
        }),
      }),
    );
    expect(enLoginHtml).toContain("Regulatory Agency Read-Only Portal");
    expect(enLoginHtml).toContain("Sign in with Google");
    expect(enLoginHtml).toContain(
      "This Google account is not bound to an active agency membership",
    );
    expect(enLoginHtml).toContain("Switch language to Traditional Chinese");
    expect(enLoginHtml).toContain(
      'href="/api/auth/agency/login?redirect_uri=%2Ftrip-records"',
    );
    expect(
      /[\u4e00-\u9fff]/u.test(stripIntentionalLanguageToggleCopy(enLoginHtml)),
    ).toBe(false);

    mockedLocaleCookie = "en";
    const enInviteValidHtml = renderToStaticMarkup(
      await inviteMod.default({
        searchParams: Promise.resolve({ token: "inv_tok_123" }),
      }),
    );
    expect(enInviteValidHtml).toContain("Accept Agency Account Invitation");
    expect(enInviteValidHtml).toContain("Accept invitation with Google");
    expect(enInviteValidHtml).toContain(
      'href="/api/auth/agency/login?token=inv_tok_123"',
    );
    expect(
      /[\u4e00-\u9fff]/u.test(
        stripIntentionalLanguageToggleCopy(enInviteValidHtml),
      ),
    ).toBe(false);

    const enInviteInvalidHtml = renderToStaticMarkup(
      await inviteMod.default({
        searchParams: Promise.resolve({}),
      }),
    );
    expect(enInviteInvalidHtml).toContain(
      "Invalid invitation link. Please contact the platform administrator.",
    );
  });

  it("renders HomePage and PortalShell in zh and en while keeping dynamic agency identifiers intact", async () => {
    mockedLocaleCookie = "zh";
    const zhHomeHtml = renderToStaticMarkup(await homeMod.default());
    expect(zhHomeHtml).toContain("DRTS 主管機關唯讀查詢");
    expect(zhHomeHtml).toContain("唯讀");
    expect(zhHomeHtml).toContain("個資已遮罩");
    expect(zhHomeHtml).toContain("不可竄改的存取紀錄");
    expect(zhHomeHtml).toContain("唯讀查詢與受控匯出");
    expect(zhHomeHtml).toContain("AGY-TPE-001");
    expect(zhHomeHtml).toContain("Taipei City DOT");

    mockedLocaleCookie = "en";
    const enHomeHtml = renderToStaticMarkup(await homeMod.default());
    expect(enHomeHtml).toContain("DRTS Regulatory Agency Read-Only Portal");
    expect(enHomeHtml).toContain("Read-only");
    expect(enHomeHtml).toContain("PII Masked");
    expect(enHomeHtml).toContain("immutable access audit log");
    expect(enHomeHtml).toContain("Read-only viewer &amp; controlled exporter");
    expect(enHomeHtml).toContain("AGY-TPE-001");
    expect(enHomeHtml).toContain("Taipei City DOT");
    expect(
      /[\u4e00-\u9fff]/u.test(stripIntentionalLanguageToggleCopy(enHomeHtml)),
    ).toBe(false);
  });

  it("renders R14 Driver and Vehicle qualification pages, R09 complaints, and R12 daily dispatch in zh and en (normal, empty, and 403/503 error states)", async () => {
    const driverPageData = {
      items: [
        {
          driverIdMasked: "DRV-***88",
          nameMasked: "Chen*",
          licensesValid: false,
          licenseExpiry: "2026-10-31T16:30:00.000Z",
          licenseExpiryStatus: "expired",
          professionalDriverLicenseExpiry: "2027-05-01T00:00:00.000Z",
          professionalDriverLicenseExpiryStatus: "valid",
          taxiDriverRegistrationExpiry: null,
          taxiDriverRegistrationExpiryStatus: "unavailable",
          lifecycleStatus: "active",
          dispatchEligible: false,
          eligibilityBlockedReasons: ["expired"],
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    };

    mockedLocaleCookie = "en";
    mockedAgencyDataQueue.push({
      ok: true,
      status: 200,
      data: driverPageData,
      error: null,
    });
    const enDriversHtml = renderToStaticMarkup(
      await driversMod.default({
        searchParams: Promise.resolve({ status: "expired", windowDays: "30" }),
      }),
    );
    expect(enDriversHtml).toContain("R14 Driver Qualifications &amp; Expiry");
    expect(enDriversHtml).toContain("Driver License Expiry");
    expect(enDriversHtml).toContain("DRV-***88");
    expect(enDriversHtml).toContain("11/01/2026");
    expect(enDriversHtml).toContain("(Expired)");
    expect(enDriversHtml).toContain("Not provided (Not provided)");
    expect(enDriversHtml).toContain("Active");
    expect(enDriversHtml).toContain("No (Expired)");
    expect(enDriversHtml).toContain("Total 1 records · Page 1 of 1");
    expect(
      /[\u4e00-\u9fff]/u.test(
        stripIntentionalLanguageToggleCopy(enDriversHtml),
      ),
    ).toBe(false);

    // Vehicle qualifications empty state in English
    mockedAgencyDataQueue.push({
      ok: true,
      status: 200,
      data: { items: [], page: 1, pageSize: 20, total: 0 },
      error: null,
    });
    const enVehiclesEmptyHtml = renderToStaticMarkup(
      await vehiclesMod.default({
        searchParams: Promise.resolve({}),
      }),
    );
    expect(enVehiclesEmptyHtml).toContain(
      "R14 Vehicle Qualifications &amp; Expiry",
    );
    expect(enVehiclesEmptyHtml).toContain("Periodic Inspection");
    expect(enVehiclesEmptyHtml).toContain("No records found");
    expect(
      /[\u4e00-\u9fff]/u.test(
        stripIntentionalLanguageToggleCopy(enVehiclesEmptyHtml),
      ),
    ).toBe(false);

    // R09 Complaint Monthly Statistics in English
    mockedAgencyDataQueue.push({
      ok: true,
      status: 200,
      data: {
        statisticsAsOf: "2026-10-31T16:30:00.000Z",
        unavailableMetrics: ["resolvedCount", "slaBreachCount"],
        items: [
          {
            periodMonth: "2026-11",
            businessArea: "TPE",
            serviceProductCode: "MULTI_TAXI",
            complaintCount: 2,
            complaintsByCategory: { late_arrival: 2 },
            lowRatingAuto: { createdCount: 1, closedCount: 1, overdueCount: 0 },
            manual: null,
          },
        ],
      },
      error: null,
    });
    const enComplaintsHtml = renderToStaticMarkup(
      await complaintsMod.default({
        searchParams: Promise.resolve({
          periodMonthFrom: "2026-06",
          periodMonthTo: "2026-11",
        }),
      }),
    );
    expect(enComplaintsHtml).toContain("R09 Monthly Complaint Statistics");
    expect(enComplaintsHtml).toContain(
      "Resolved count, Historical SLA breach count: Not provided",
    );
    expect(enComplaintsHtml).toContain(
      "Low-Rating Auto (Created/Closed/Overdue)",
    );
    expect(enComplaintsHtml).toContain("1 / 1 / 0");
    expect(enComplaintsHtml).toContain("MULTI_TAXI");
    expect(
      /[\u4e00-\u9fff]/u.test(
        stripIntentionalLanguageToggleCopy(enComplaintsHtml),
      ),
    ).toBe(false);

    // R12 Daily Dispatch 403 permission error in English
    mockedAgencyDataQueue.push({
      ok: false,
      status: 403,
      data: null,
      error: { code: "FORBIDDEN", message: null },
    });
    const enDaily403Html = renderToStaticMarkup(
      await dailyDispatchMod.default({
        searchParams: Promise.resolve({
          serviceDateFrom: "2026-10-25",
          serviceDateTo: "2026-10-25",
        }),
      }),
    );
    expect(enDaily403Html).toContain("R12 Daily Dispatch Report");
    expect(enDaily403Html).toContain(
      "This account is not authorized to access this data (access attempt logged).",
    );
    expect(
      /[\u4e00-\u9fff]/u.test(
        stripIntentionalLanguageToggleCopy(enDaily403Html),
      ),
    ).toBe(false);
  });
});
