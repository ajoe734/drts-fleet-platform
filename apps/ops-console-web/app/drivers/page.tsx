import type { DriverRegistryRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

export default async function DriversPage() {
  const client = await getServerOpsClient();
  let drivers: DriverRegistryRecord[] = [];
  let error: string | null = null;

  try {
    drivers = await client.listDrivers();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <>
      <PageHeader
        title="Drivers Registry"
        subtitle={`${drivers.length} driver(s) registered`}
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
            { label: "Driver ID" },
            { label: "Name" },
            { label: "Work State" },
            { label: "License Valid" },
          ]}
          empty="No drivers registered."
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
                  {d.licensesValid ? "Valid" : "Invalid"}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
