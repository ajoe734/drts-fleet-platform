import type { FeatureFlag } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as Kpi,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

type FlagRow = Record<string, unknown> & {
  key: string;
  scope: string;
  description: string;
  updatedAtLabel: string;
  enabled: boolean;
};

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
      divider: locale === "en" ? "Operations" : "營運觀測",
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

function formatFlagScope(flag: FeatureFlag) {
  if (flag.tenantId) {
    return `tenant:${flag.tenantId}`;
  }

  return flag.key.split(".")[0] ?? "global";
}

function formatDateTime(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function featureFlagDescription(locale: Locale, flag: FeatureFlag) {
  if (locale !== "zh") {
    return flag.description || "—";
  }

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

  return descriptions[flag.key] || flag.description || "—";
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
    flags = summary.flags;
    notes = summary.notes;
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const enabled = flags.filter((flag) => flag.enabled).length;
  const disabled = flags.length - enabled;
  const globalFlags = flags.filter((flag) => !flag.tenantId).length;
  const overrideFlags = flags.length - globalFlags;
  const latestUpdatedAt =
    flags.length > 0
      ? flags.reduce((latest, flag) =>
          new Date(flag.updatedAt).getTime() >
          new Date(latest.updatedAt).getTime()
            ? flag
            : latest,
        ).updatedAt
      : null;
  const rows: FlagRow[] = flags.map((flag) => ({
    key: flag.key,
    scope: formatFlagScope(flag),
    description: featureFlagDescription(locale, flag),
    updatedAtLabel: formatDateTime(locale, flag.updatedAt),
    enabled: flag.enabled,
  }));

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: t("flags.col.key", locale),
      k: "key",
      w: 380,
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 11.5,
              color: theme.text,
            }}
          >
            {row.key}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              lineHeight: 1.45,
              whiteSpace: "normal",
            }}
          >
            {row.description}
          </div>
        </div>
      ),
    },
    {
      h: "Scope",
      k: "scope",
      w: 160,
      mono: true,
    },
    {
      h: t("flags.col.status", locale),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={row.enabled ? "success" : "neutral"} dot>
          {row.enabled
            ? t("common.enabled", locale)
            : t("common.disabled", locale)}
        </Pill>
      ),
    },
    {
      h: "At",
      k: "updatedAtLabel",
      w: 160,
      mono: true,
    },
  ];

  const governanceItems = [
    {
      k: locale === "en" ? "Mode" : "模式",
      v: locale === "en" ? "Read-only registry" : "唯讀旗標登錄",
    },
    {
      k: locale === "en" ? "Publishing" : "發佈方式",
      v: locale === "en" ? "Platform governance" : "由平台治理流程發佈",
    },
    {
      k: locale === "en" ? "Scope coverage" : "範圍覆蓋",
      v:
        locale === "en"
          ? `${globalFlags} global · ${overrideFlags} tenant override`
          : `${globalFlags} 個全域 · ${overrideFlags} 個租戶覆寫`,
    },
    {
      k: locale === "en" ? "Last sync" : "最後同步",
      v:
        (latestUpdatedAt ? formatDateTime(locale, latestUpdatedAt) : null) ??
        (locale === "en" ? "No published flags" : "尚無已發佈旗標"),
      mono: true,
    },
  ];

  return (
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
        subtitle={
          locale === "en"
            ? "Read-only · published through platform governance"
            : "唯讀 · 由平台治理發佈"
        }
        actions={
          <Btn theme={theme} variant="secondary" disabled>
            {locale === "en" ? "Read-only" : "唯讀"}
          </Btn>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("common.error", locale)}
            body={error}
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi
            theme={theme}
            label={locale === "en" ? "Published flags" : "已發佈旗標"}
            value={flags.length}
            sub={t("flags.subtitle", locale, { total: flags.length, enabled })}
            hint={locale === "en" ? "registry.total" : "registry.total"}
          />
          <Kpi
            theme={theme}
            label={locale === "en" ? "Enabled" : "已啟用"}
            value={enabled}
            delta={`${Math.round((enabled / Math.max(flags.length, 1)) * 100)}%`}
            deltaTone="up"
            sub={t("flags.registrySummary", locale, { enabled, disabled })}
            hint={locale === "en" ? "state.enabled" : "state.enabled"}
          />
          <Kpi
            theme={theme}
            label={locale === "en" ? "Tenant overrides" : "租戶覆寫"}
            value={overrideFlags}
            sub={
              locale === "en"
                ? `${globalFlags} global definitions remain authoritative`
                : `${globalFlags} 個全域定義維持權威來源`
            }
            hint={locale === "en" ? "scope.tenant" : "scope.tenant"}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <Card
            theme={theme}
            title={locale === "en" ? "Registry governance" : "登錄治理"}
            subtitle={
              locale === "en"
                ? "Published notes and authority context"
                : "已發佈備註與權威來源"
            }
          >
            <div style={{ display: "grid", gap: 16 }}>
              <DL theme={theme} cols={1} items={governanceItems} />
              <Field
                theme={theme}
                label={locale === "en" ? "Published notes" : "發佈備註"}
                hint={t("flags.registryFooter", locale)}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.surfaceLo,
                  }}
                >
                  {(notes.length > 0 ? notes : [t("flags.empty", locale)]).map(
                    (note, index) => (
                      <div
                        key={`${note}-${index}`}
                        style={{
                          fontSize: 12,
                          color: theme.text,
                          lineHeight: 1.45,
                        }}
                      >
                        {note}
                      </div>
                    ),
                  )}
                </div>
              </Field>
            </div>
          </Card>

          <Card
            theme={theme}
            padding={0}
            title={t("flags.registrySummary", locale, {
              enabled,
              disabled,
            })}
            subtitle={t("flags.registryFooter", locale)}
            actions={
              <Pill theme={theme} tone="info">
                {locale === "en" ? "Read-only table" : "唯讀表格"}
              </Pill>
            }
          >
            {rows.length > 0 ? (
              <Table theme={theme} columns={columns} rows={rows} />
            ) : (
              <div
                style={{
                  padding: 24,
                  color: theme.textMuted,
                  fontSize: 12.5,
                  textAlign: "center",
                }}
              >
                {t("flags.empty", locale)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
