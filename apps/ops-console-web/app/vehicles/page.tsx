import type { VehicleRegistryRecord } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

export default async function VehiclesPage() {
  const client = getOpsClient();
  let vehicles: VehicleRegistryRecord[] = [];
  let error: string | null = null;

  try {
    vehicles = await client.listVehicles();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <>
      <PageHeader
        title="Vehicles Registry"
        subtitle={`${vehicles.length} vehicle(s) registered`}
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
            { label: "Vehicle ID" },
            { label: "Plate" },
            { label: "Operating Area" },
            { label: "Insurance" },
            { label: "Dispatchable" },
          ]}
          empty="No vehicles registered."
        >
          {vehicles.map((v) => (
            <Tr key={v.vehicleId}>
              <Td mono>{v.vehicleId}</Td>
              <Td>{v.plateNo}</Td>
              <Td>{v.operatingArea}</Td>
              <Td>
                <Badge
                  variant={v.insuranceStatus === "valid" ? "green" : "red"}
                >
                  {v.insuranceStatus}
                </Badge>
              </Td>
              <Td>
                <Badge variant={v.dispatchableFlag ? "green" : "gray"}>
                  {v.dispatchableFlag ? "Yes" : "No"}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
