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
              <Td muted>{f.description ?? "—"}</Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
