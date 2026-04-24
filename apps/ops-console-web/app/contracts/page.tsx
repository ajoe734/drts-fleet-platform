import type { VehicleContractRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
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

export default async function ContractsPage() {
  const client = await getServerOpsClient();
  let contracts: VehicleContractRecord[] = [];
  let error: string | null = null;

  try {
    contracts = await client.listContracts();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <>
      <PageHeader
        title="Contracts Registry"
        subtitle={`${contracts.length} contract(s)`}
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
            { label: "Contract ID" },
            { label: "Vehicle" },
            { label: "Partner" },
            { label: "Type" },
            { label: "Status" },
          ]}
          empty="No contracts registered."
        >
          {contracts.map((c) => (
            <Tr key={c.contractId}>
              <Td mono>{c.contractId}</Td>
              <Td mono>{c.vehicleId}</Td>
              <Td mono>{c.partnerId}</Td>
              <Td>{c.contractType}</Td>
              <Td>
                <Badge variant={contractStatusVariant(c.status)}>
                  {c.status}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
