import type { DriverRegistryRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

export default async function DriversPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  let drivers: DriverRegistryRecord[] = [];
  let error: string | null = null;

  try {
    drivers = await client.listDrivers();
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  return (
    <>
      <PageHeader
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale, { count: drivers.length })}
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
            { label: t("drivers.col.driverId", locale) },
            { label: t("drivers.col.name", locale) },
            { label: t("drivers.col.workState", locale) },
            { label: t("drivers.col.licenseValid", locale) },
          ]}
          empty={t("drivers.empty", locale)}
        >
          {drivers.map((d) => (
            <Tr key={d.driverId}>
              <Td mono>{d.driverId}</Td>
              <Td>{d.name}</Td>
              <Td>
                <Badge
                  variant={
                    d.workState === "available"
                      ? "green"
                      : d.workState === "suspended"
                        ? "red"
                        : "gray"
                  }
                >
                  {d.workState}
                </Badge>
              </Td>
              <Td>
                <Badge variant={d.licensesValid ? "green" : "red"}>
                  {d.licensesValid
                    ? t("common.valid", locale)
                    : t("common.invalid", locale)}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
