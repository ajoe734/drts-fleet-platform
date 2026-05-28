import type { CSSProperties, ReactNode } from "react";
import type { FeatureFlag } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

type FlagRow = Record<string, unknown> & {
  flagKey: ReactNode;
  scope: ReactNode;
  state: ReactNode;
  updatedBy: ReactNode;
  updatedAt: ReactNode;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: theme.bg,
};

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const keyCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 11,
  color: theme.textMuted,
  lineHeight: 1.35,
  whiteSpace: "normal",
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const emptyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 16,
};

const tableColumns: CanvasTableColumn<FlagRow>[] = [
  { h: "KEY", k: "flagKey", w: 380 },
  { h: "SCOPE", k: "scope", w: 160 },
  { h: "STATE", k: "state", w: 110 },
  { h: "UPDATED BY", k: "updatedBy", w: 200 },
  { h: "AT", k: "updatedAt", w: 170 },
];

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

function featureFlagDescription(locale: Locale, flag: FeatureFlag) {
  if (locale !== "zh") return flag.description ?? "-";

  const descriptions: Record<string, string> = {
    "driver-app.earnings": "啟用司機 App 收益讀模型",
    "driver-app.incidents": "啟用司機 App 事故回報",
    "driver-app.shift": "啟用司機 App 班次與出勤追蹤",
    "driver-app.tasks": "啟用司機 App 任務生命週期",
    "ops-console.callcenter": "啟用營運後台客服中心工作階段檢視",
    "ops-console.complaint": "啟用營運後台客訴案件管理",
    "ops-console.dispatch": "啟用營運後台派車調度板",
    "ops-console.reports": "啟用營運後台報表任務管理",
    "phase1.read-models": "啟用 Phase 1 讀模型介面",
    "phase1.smoke-paths": "啟用 Phase 1 smoke test 端點",
    "tenant-portal.billing": "啟用租戶入口帳務檢視",
    "tenant-portal.booking": "啟用租戶入口訂車管理",
    "tenant-portal.reports": "啟用租戶入口報表任務提交",
    "tenant-portal.webhooks": "啟用租戶入口 Webhook 管理",
  };

  return descriptions[flag.key] || flag.description || "-";
}

function formatCanvasDate(value: string | undefined, locale: Locale) {
  if (!value) {
    return t("common.dash", locale);
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  const yyyy = String(parsed.getUTCFullYear());
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const hh = String(parsed.getUTCHours()).padStart(2, "0");
  const min = String(parsed.getUTCMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function buildFlagRows(locale: Locale, flags: FeatureFlag[]): FlagRow[] {
  return flags.map((flag) => {
    const scopeLabel = flag.tenantId ? "tenant_override" : "platform";
    const scopeMeta = flag.tenantId
      ? flag.tenantId
      : locale === "en"
        ? "shared default"
        : "共享預設";
    const updatedByLabel = flag.tenantId
      ? `tenant:${flag.tenantId}`
      : locale === "en"
        ? "platform governance"
        : "平台治理";

    return {
      flagKey: (
        <div style={keyCellStyle}>
          <span style={monoTextStyle}>{flag.key}</span>
          <span style={secondaryTextStyle}>
            {featureFlagDescription(locale, flag)}
          </span>
        </div>
      ),
      scope: (
        <div style={keyCellStyle}>
          <span style={monoTextStyle}>{scopeLabel}</span>
          <span style={secondaryTextStyle}>{scopeMeta}</span>
        </div>
      ),
      state: (
        <Pill theme={theme} tone={flag.enabled ? "success" : "neutral"} dot>
          {flag.enabled ? "enabled" : "disabled"}
        </Pill>
      ),
      updatedBy: (
        <span style={flag.tenantId ? monoTextStyle : undefined}>
          {updatedByLabel}
        </span>
      ),
      updatedAt: (
        <span style={monoTextStyle}>
          {formatCanvasDate(flag.updatedAt, locale)}
        </span>
      ),
    };
  });
}

function readOnlySubtitle(locale: Locale, total: number, enabled: number) {
  const governanceCopy =
    locale === "en"
      ? "Read-only · published by platform governance"
      : "只讀 · 由平台治理發佈";

  return `${governanceCopy} · ${t("flags.subtitle", locale, {
    total,
    enabled,
  })}`;
}

export default async function FeatureFlagsPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let flags: FeatureFlag[] = [];
  let notes: string[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags as FeatureFlag[];
    notes = summary.notes ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const enabled = flags.filter((flag) => flag.enabled).length;
  const disabled = flags.length - enabled;
  const rows = buildFlagRows(locale, flags);

  return (
    <div style={overlayStyle}>
      <Shell
        theme={theme}
        nav={buildShellNav(locale)}
        active="feature-flags"
        currentPath="/feature-flags"
        breadcrumb={[t("nav.featureFlags", locale)]}
        searchPlaceholder={
          locale === "en"
            ? "Search order, tenant, or driver..."
            : "搜尋訂單、租戶或司機..."
        }
        brandLabel={t("app.name", locale)}
        brandSubLabel={t("app.sub", locale)}
        env={locale === "en" ? "staging" : "測試"}
        versionLabel="OC"
        avatarLabel="OC"
      >
        <PageHeader
          theme={theme}
          title={t("flags.title", locale)}
          subtitle={readOnlySubtitle(locale, flags.length, enabled)}
        />

        <div style={pageStackStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={
                locale === "en"
                  ? "Flag registry unavailable"
                  : "旗標清單暫時無法讀取"
              }
              body={error}
            />
          ) : null}

          <Card theme={theme} padding={0}>
            {rows.length > 0 ? (
              <Table theme={theme} columns={tableColumns} rows={rows} />
            ) : (
              <div style={{ padding: 16 }}>
                <Banner
                  theme={theme}
                  tone="info"
                  icon="flags"
                  title={t("flags.empty", locale)}
                  body={t("flags.registryFooter", locale)}
                />

                <div style={emptyGridStyle}>
                  <KPI
                    theme={theme}
                    label={locale === "en" ? "Flags" : "旗標"}
                    value={String(flags.length)}
                  />
                  <KPI
                    theme={theme}
                    label={locale === "en" ? "Enabled" : "已啟用"}
                    value={String(enabled)}
                  />
                  <KPI
                    theme={theme}
                    label={locale === "en" ? "Disabled" : "已停用"}
                    value={String(disabled)}
                  />
                </div>

                {notes.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <Field
                      theme={theme}
                      label={locale === "en" ? "Governance Notes" : "治理備註"}
                      hint={t("flags.subtitle", locale, {
                        total: flags.length,
                        enabled,
                      })}
                    >
                      <DL
                        theme={theme}
                        cols={1}
                        items={notes.map((note, index) => ({
                          label:
                            locale === "en"
                              ? `Note ${index + 1}`
                              : `備註 ${index + 1}`,
                          value: note,
                        }))}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </Shell>
    </div>
  );
}
