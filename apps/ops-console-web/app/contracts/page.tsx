import type { VehicleContractRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

function contractStatusVariant(status: string) {
  if (status === "active") return "green" as const;
  if (status === "terminated" || status === "expired") return "red" as const;
  if (status === "pending") return "yellow" as const;
  return "gray" as const;
}

function contractStatusLabel(locale: string, status: string | undefined) {
  if (locale !== "zh" || !status) return status ?? "—";
  switch (status) {
    case "active":
      return "生效中";
    case "terminated":
      return "已終止";
    case "expired":
      return "已到期";
    case "pending":
      return "待生效";
    default:
      return status;
  }
}

function contractTypeLabel(locale: string, contractType: string | undefined) {
  if (locale !== "zh" || !contractType) return contractType ?? "—";
  switch (contractType) {
    case "service_fleet_contract":
      return "服務車隊合約";
    case "fleet":
      return "車隊合約";
    case "affiliate":
      return "合作加盟";
    case "lease":
      return "租賃合約";
    case "owner_operator":
      return "自營駕駛";
    default:
      return contractType;
  }
}

export default async function ContractsPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  let contracts: VehicleContractRecord[] = [];
  let error: string | null = null;

  try {
    contracts = await client.listContracts();
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  return (
    <>
      <PageHeader
        title={t("contracts.title", locale)}
        subtitle={t("contracts.subtitle", locale, { count: contracts.length })}
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
            { label: t("contracts.col.contractId", locale) },
            { label: t("contracts.col.vehicle", locale) },
            { label: t("contracts.col.partner", locale) },
            { label: t("contracts.col.type", locale) },
            { label: t("contracts.col.status", locale) },
          ]}
          empty={t("contracts.empty", locale)}
        >
          {contracts.map((c) => (
            <Tr key={c.contractId}>
              <Td mono>{c.contractId}</Td>
              <Td mono>{c.vehicleId}</Td>
              <Td mono>{c.partnerId}</Td>
              <Td>{contractTypeLabel(locale, c.contractType)}</Td>
              <Td>
                <Badge variant={contractStatusVariant(c.status)}>
                  {contractStatusLabel(locale, c.status)}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
