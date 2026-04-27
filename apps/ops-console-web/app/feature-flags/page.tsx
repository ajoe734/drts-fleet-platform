import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

interface FlagRecord {
  key: string;
  enabled: boolean;
  description?: string;
}

function featureFlagDescription(locale: string, flag: FlagRecord) {
  if (locale !== "zh") return flag.description ?? "—";

  const descriptions: Record<string, string> = {
    "driver-app.earnings": "啟用司機 App 收益讀模型",
    "driver-app.incidents": "啟用司機 App 事故回報",
    "driver-app.shift": "啟用司機 App 班次與出勤追蹤",
    "driver-app.tasks": "啟用司機 App 任務生命週期",
    "ops-console.callcenter": "啟用營運後台客服中心工作階段檢視",
    "ops-console.complaint": "啟用營運後台投訴案件管理",
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
  let flags: FlagRecord[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags as FlagRecord[];
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const enabled = flags.filter((f) => f.enabled).length;

  return (
    <>
      <PageHeader
        title={t("flags.title", locale)}
        subtitle={t("flags.subtitle", locale, { total: flags.length, enabled })}
      />

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#b91c1c",
            fontSize: "13.5px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      <Card>
        <DataTable
          columns={[
            { label: t("flags.col.key", locale) },
            { label: t("flags.col.status", locale), width: "100px" },
            { label: t("flags.col.description", locale) },
          ]}
          empty={t("flags.empty", locale)}
        >
          {flags.map((f, i) => (
            <Tr key={i}>
              <Td mono>{f.key}</Td>
              <Td>
                <Badge variant={f.enabled ? "green" : "gray"}>
                  {f.enabled
                    ? t("common.enabled", locale)
                    : t("common.disabled", locale)}
                </Badge>
              </Td>
              <Td muted>{featureFlagDescription(locale, f)}</Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
