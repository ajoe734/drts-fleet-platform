import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getServerOpsClient } from "@/lib/api-client.server";

export default async function AttendancePage() {
  const client = await getServerOpsClient();

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
    <main className="app-grid">
      <AppShellCard
        title="Shift & Attendance"
        description="Driver shift tracking and attendance records."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginTop: "16px",
            marginBottom: "8px",
          }}
        >
          Active Shifts ({activeShifts.length})
        </h2>
        {activeShifts.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Shift ID</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Clocked In</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {activeShifts.map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.shiftId ?? "-"}</td>
                    <td>{s.driverId ?? "-"}</td>
                    <td>{s.vehicleId ?? "-"}</td>
                    <td>
                      {s.clockedInAt
                        ? new Date(s.clockedInAt).toLocaleString()
                        : "-"}
                    </td>
                    <td>{s.startLocation ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No active shifts.</p>
        )}

        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginTop: "24px",
            marginBottom: "8px",
          }}
        >
          Attendance Records ({attendance.length})
        </h2>
        {attendance.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Attendance ID</th>
                  <th>Driver</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {attendance.slice(0, 20).map((a: any, i: number) => (
                  <tr key={i}>
                    <td>{a.attendanceId ?? "-"}</td>
                    <td>{a.driverId ?? "-"}</td>
                    <td>{a.date ?? "-"}</td>
                    <td>
                      <span
                        style={{
                          color:
                            a.status === "present"
                              ? "#34C759"
                              : a.status === "absent"
                                ? "#FF3B30"
                                : "#FF9500",
                          fontWeight: 600,
                        }}
                      >
                        {a.status ?? "-"}
                      </span>
                    </td>
                    <td>{a.totalHours != null ? `${a.totalHours}h` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No attendance records.</p>
        )}

        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginTop: "24px",
            marginBottom: "8px",
          }}
        >
          Completed Shifts ({completedShifts.length})
        </h2>
        {completedShifts.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Shift ID</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {completedShifts.slice(0, 10).map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.shiftId ?? "-"}</td>
                    <td>{s.driverId ?? "-"}</td>
                    <td>{s.status ?? "-"}</td>
                    <td>
                      {s.clockedInAt
                        ? new Date(s.clockedInAt).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {s.clockedOutAt
                        ? new Date(s.clockedOutAt).toLocaleString()
                        : "-"}
                    </td>
                    <td>{s.totalHours != null ? `${s.totalHours}h` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No completed shifts.</p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
