import { getOpsClient } from "@/lib/api-client";
import { PageHeader } from "@drts/ui-web";
import { Card, CardHeader } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

function formatDt(value: string | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default async function AttendancePage() {
  const client = getOpsClient();
  let shifts: unknown[] = [];
  let attendance: unknown[] = [];
  let error: string | null = null;

  try {
    const [shiftsResult, attendanceResult] = await Promise.all([
      client.listShifts(),
      client.listAttendance(),
    ]);
    shifts = (shiftsResult as any)?.items ?? shiftsResult ?? [];
    attendance = (attendanceResult as any)?.items ?? attendanceResult ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const activeShifts = shifts.filter((s: any) => s.status === "active");
  const completedShifts = shifts.filter((s: any) => s.status !== "active");

  return (
    <>
      <PageHeader
        title="Shift & Attendance"
        subtitle="Driver shift tracking and attendance records"
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

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <Card>
          <CardHeader>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              Active Shifts
              <Badge variant="blue" style={{ marginLeft: "8px" }}>
                {activeShifts.length}
              </Badge>
            </div>
          </CardHeader>
          <DataTable
            columns={[
              { label: "Shift ID" },
              { label: "Driver" },
              { label: "Vehicle" },
              { label: "Clocked In" },
              { label: "Location" },
            ]}
            empty="No active shifts."
          >
            {activeShifts.map((s: any, i: number) => (
              <Tr key={i}>
                <Td mono>{s.shiftId ?? "—"}</Td>
                <Td>{s.driverId ?? "—"}</Td>
                <Td>{s.vehicleId ?? "—"}</Td>
                <Td muted>{formatDt(s.clockedInAt)}</Td>
                <Td muted>{s.startLocation ?? "—"}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              Attendance Records
              <Badge variant="gray" style={{ marginLeft: "8px" }}>
                {attendance.length}
              </Badge>
            </div>
          </CardHeader>
          <DataTable
            columns={[
              { label: "Attendance ID" },
              { label: "Driver" },
              { label: "Date" },
              { label: "Status" },
              { label: "Hours" },
            ]}
            empty="No attendance records."
          >
            {(attendance as any[]).slice(0, 20).map((a: any, i: number) => (
              <Tr key={i}>
                <Td mono>{a.attendanceId ?? "—"}</Td>
                <Td>{a.driverId ?? "—"}</Td>
                <Td muted>{a.date ?? "—"}</Td>
                <Td>
                  <Badge
                    variant={
                      a.status === "present"
                        ? "green"
                        : a.status === "absent"
                          ? "red"
                          : "yellow"
                    }
                  >
                    {a.status ?? "—"}
                  </Badge>
                </Td>
                <Td muted>{a.totalHours != null ? `${a.totalHours}h` : "—"}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              Completed Shifts
              <Badge variant="gray" style={{ marginLeft: "8px" }}>
                {completedShifts.length}
              </Badge>
            </div>
          </CardHeader>
          <DataTable
            columns={[
              { label: "Shift ID" },
              { label: "Driver" },
              { label: "Status" },
              { label: "Clocked In" },
              { label: "Clocked Out" },
              { label: "Hours" },
            ]}
            empty="No completed shifts."
          >
            {(completedShifts as any[])
              .slice(0, 10)
              .map((s: any, i: number) => (
                <Tr key={i}>
                  <Td mono>{s.shiftId ?? "—"}</Td>
                  <Td>{s.driverId ?? "—"}</Td>
                  <Td>
                    <Badge variant="gray">{s.status ?? "—"}</Badge>
                  </Td>
                  <Td muted>{formatDt(s.clockedInAt)}</Td>
                  <Td muted>{formatDt(s.clockedOutAt)}</Td>
                  <Td muted>
                    {s.totalHours != null ? `${s.totalHours}h` : "—"}
                  </Td>
                </Tr>
              ))}
          </DataTable>
        </Card>
      </div>
    </>
  );
}
