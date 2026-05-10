import type { CSSProperties } from "react";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

interface FlagRecord {
  key: string;
  enabled: boolean;
  description?: string;
}

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const scopeItemStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
};

function featureFlagDescription(locale: string, flag: FlagRecord) {
  if (locale !== "zh") return flag.description ?? "—";

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

function getFlagScope(flag: FlagRecord, locale: "en" | "zh") {
  const prefix = flag.key.split(".")[0] ?? flag.key;

  if (locale === "en") {
    if (prefix === "ops-console") return "Ops console";
    if (prefix === "driver-app") return "Driver app";
    if (prefix === "tenant-portal") return "Tenant portal";
    if (prefix === "phase1") return "Phase 1";
    return prefix;
  }

  if (prefix === "ops-console") return "營運後台";
  if (prefix === "driver-app") return "司機 App";
  if (prefix === "tenant-portal") return "租戶入口";
  if (prefix === "phase1") return "Phase 1";
  return prefix;
}

export default async function FeatureFlagsPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  let flags: FlagRecord[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags as FlagRecord[];
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const enabled = flags.filter((flag) => flag.enabled).length;
  const disabled = flags.length - enabled;
  const scopeGroups = Array.from(
    flags.reduce((acc, flag) => {
      const scope = getFlagScope(flag, locale);
      const current = acc.get(scope) ?? { total: 0, enabled: 0 };
      current.total += 1;
      if (flag.enabled) current.enabled += 1;
      acc.set(scope, current);
      return acc;
    }, new Map<string, { total: number; enabled: number }>()),
  );

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Master data" : "主資料"}
        title={t("flags.title", locale)}
        subtitle={
          locale === "en"
            ? "Read-only visibility into rollout switches governed by platform controls."
            : "只讀檢視由平台治理發佈的 rollout switches。"
        }
        meta={[
          {
            label: locale === "en" ? "Flags" : "旗標數",
            value: flags.length,
          },
          {
            label: locale === "en" ? "Enabled" : "啟用中",
            value: enabled,
            tone: "success",
          },
          {
            label: locale === "en" ? "Scopes" : "範圍",
            value: scopeGroups.length,
          },
        ]}
      />

      <KpiRow minWidth="170px">
        <KpiCard
          label={locale === "en" ? "Enabled" : "啟用中"}
          value={enabled}
          detail={
            locale === "en" ? `${disabled} disabled` : `${disabled} 個目前停用`
          }
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "Ops console" : "營運後台"}
          value={
            flags.filter((flag) => flag.key.startsWith("ops-console.")).length
          }
          detail={
            locale === "en"
              ? "Operationally visible switches"
              : "營運面可見的控制開關"
          }
          tone="ops"
        />
        <KpiCard
          label={locale === "en" ? "Driver app" : "司機 App"}
          value={
            flags.filter((flag) => flag.key.startsWith("driver-app.")).length
          }
          detail={
            locale === "en"
              ? "Mobile rollout dependencies"
              : "行動端 rollout 依賴"
          }
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Read only" : "唯讀"}
          value={locale === "en" ? "Yes" : "是"}
          detail={
            locale === "en"
              ? "Published by platform governance, not edited here"
              : "由平台治理發佈，不能在此頁直接修改"
          }
          tone="neutral"
        />
      </KpiRow>

      {error ? (
        <CalloutBanner
          tone="danger"
          title={t("flags.title", locale)}
          description={error}
        />
      ) : (
        <CalloutBanner
          tone="info"
          title={
            locale === "en"
              ? "Read-only operational mirror"
              : "營運鏡像唯讀檢視"
          }
          description={
            locale === "en"
              ? "Flags stay visible in ops so rollout state can be correlated with incidents, dispatch drift, or support load without changing source governance."
              : "營運可以在這裡對照 rollout 狀態與 incident、dispatch 漂移或客服負載，但不能改寫旗標來源治理。"
          }
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <DataViewCard
          title={t("flags.title", locale)}
          subtitle={t("flags.subtitle", locale, {
            total: flags.length,
            enabled,
          })}
          tone="ops"
          density="compact"
          summary={t("flags.registrySummary", locale, {
            enabled,
            disabled,
          })}
          footer={t("flags.registryFooter", locale)}
          filters={
            <DataFilterBar
              ariaLabel={locale === "en" ? "Flag views" : "旗標檢視"}
              value="all"
              filters={[
                {
                  value: "all",
                  label: locale === "en" ? "All" : "全部",
                  count: flags.length,
                  tone: "ops",
                },
                {
                  value: "enabled",
                  label: locale === "en" ? "Enabled" : "啟用",
                  count: enabled,
                  tone: "success",
                },
                {
                  value: "disabled",
                  label: locale === "en" ? "Disabled" : "停用",
                  count: disabled,
                  tone: "neutral",
                },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: t("flags.col.key", locale) },
              { label: locale === "en" ? "Scope" : "範圍", width: "120px" },
              { label: t("flags.col.status", locale), width: "100px" },
              { label: t("flags.col.description", locale) },
            ]}
            empty={t("flags.empty", locale)}
          >
            {flags.map((flag) => (
              <Tr key={flag.key}>
                <Td mono density="compact">
                  <DataCellStack
                    primary={flag.key}
                    secondary={flag.enabled ? "enabled" : "disabled"}
                  />
                </Td>
                <Td density="compact" muted>
                  {getFlagScope(flag, locale)}
                </Td>
                <Td density="compact">
                  <StatusChip
                    tone={flag.enabled ? "success" : "neutral"}
                    authorityLabel={locale === "zh" ? "狀態" : "state"}
                    label={
                      flag.enabled
                        ? t("common.enabled", locale)
                        : t("common.disabled", locale)
                    }
                  />
                </Td>
                <Td muted density="compact">
                  {featureFlagDescription(locale, flag)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={locale === "en" ? "Scope summary" : "範圍摘要"}
          subtitle={
            locale === "en"
              ? "How many switches are active per product surface."
              : "依產品面統計目前有多少開關與啟用項。"
          }
          tone="info"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {scopeGroups.map(([scope, summary]) => (
              <div key={scope} style={scopeItemStyle}>
                <DataCellStack
                  primary={<strong>{scope}</strong>}
                  secondary={
                    locale === "en"
                      ? `${summary.enabled} enabled of ${summary.total}`
                      : `${summary.total} 個中有 ${summary.enabled} 個啟用`
                  }
                />
                <StatusChip
                  tone={summary.enabled > 0 ? "success" : "neutral"}
                  authorityLabel={locale === "zh" ? "啟用" : "enabled"}
                  label={`${summary.enabled}/${summary.total}`}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </div>
  );
}
