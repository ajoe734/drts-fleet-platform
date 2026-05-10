import type {
  TenantPassengerMasterRole,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function describeRole(role: TenantPassengerMasterRole) {
  switch (role) {
    case "employee":
      return "Employee";
    case "cardholder":
      return "Cardholder";
    case "vip":
      return "VIP";
    case "passenger":
      return "Passenger";
    default:
      return role;
  }
}

function describeQualityIssue(issue: TenantPassengerQualityIssue) {
  switch (issue) {
    case "missing_contact":
      return "Missing contact";
    case "missing_employee_no":
      return "Missing employee no";
    case "duplicate_employee_no":
      return "Duplicate employee no";
    default:
      return issue;
  }
}

function hasRole(
  passenger: TenantPassengerRecord,
  role: TenantPassengerMasterRole,
) {
  return passenger.roles?.includes(role) ?? false;
}

export default async function PassengersPage() {
  const client = getTenantClient();
  const passengers = (await client.listPassengers()) as TenantPassengerRecord[];

  const activeCount = passengers.filter((row) => row.activeFlag).length;
  const employeeCount = passengers.filter((row) =>
    hasRole(row, "employee"),
  ).length;
  const taggedCount = passengers.filter(
    (row) => (row.roles?.length ?? 0) > 1,
  ).length;
  const flaggedCount = passengers.filter(
    (row) => (row.qualityIssues?.length ?? 0) > 0,
  ).length;
  const disabledCount = passengers.length - activeCount;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Passengers"
        title="Passenger directory now stays grounded in the published tenant contract."
        description="This route reads `/api/tenant/passengers` directly for identity, department, contact, role, and activation state. The sunset portal's consent-version, CSV-import, and visitor-tab behavior are not reintroduced here because `TenantPassengerRecord` does not publish those fields or enums."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Passengers</span>
          <strong>{passengers.length}</strong>
          <p>Tenant-scoped passenger rows currently visible in this realm.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active</span>
          <strong>{activeCount}</strong>
          <p>Passengers currently enabled for booking selection.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Employees</span>
          <strong>{employeeCount}</strong>
          <p>Rows tagged with the published employee passenger role.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Tagged</span>
          <strong>{taggedCount}</strong>
          <p>Passengers carrying more than one published role tag.</p>
        </article>
      </section>

      <SurfaceCard
        kicker="Directory"
        title="Tenant passenger roster"
        description="The artboard's directory framing is preserved as view cues, but the shipped surface stays read-only and contract-safe. Updates remain command-driven through `UpsertTenantPassengerCommand`."
      >
        <div className="chip-row">
          <span className="status-chip is-active">
            All · {passengers.length}
          </span>
          <span className="status-chip">Employee · {employeeCount}</span>
          <span className="status-chip">Flagged · {flaggedCount}</span>
          <span className="status-chip">Disabled · {disabledCount}</span>
        </div>

        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Emp ID</th>
                <th>Department</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Quality</th>
                <th>State</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {passengers.map((row) => {
                const roles = row.roles ?? [];
                const issues = row.qualityIssues ?? [];

                return (
                  <tr key={row.passengerId}>
                    <td>
                      <div className="table-primary">
                        {row.fullName}
                        <span className="table-secondary">
                          {row.passengerId}
                        </span>
                      </div>
                    </td>
                    <td>
                      {row.employeeNo ?? <span className="muted-copy">—</span>}
                    </td>
                    <td>
                      {row.departmentName ?? (
                        <span className="muted-copy">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {row.mobile ?? <span className="muted-copy">—</span>}
                    </td>
                    <td>
                      {row.email ?? <span className="muted-copy">—</span>}
                    </td>
                    <td>
                      {roles.length > 0 ? (
                        <div className="chip-row">
                          {roles.map((role) => (
                            <span key={role} className="status-chip">
                              {describeRole(role)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-copy">No roles</span>
                      )}
                    </td>
                    <td>
                      {issues.length > 0 ? (
                        <div className="chip-row">
                          {issues.map((issue) => (
                            <span
                              key={issue}
                              className="status-chip is-warning"
                            >
                              {describeQualityIssue(issue)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-copy">Clean</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.activeFlag
                            ? "status-chip is-active"
                            : "status-chip"
                        }
                      >
                        {row.activeFlag ? "active" : "disabled"}
                      </span>
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <CalloutPanel
        title="Contract boundary"
        description="CSV import, consent version history, and inline mutations are intentionally absent here. The current backend surface publishes passenger listing plus `UpsertTenantPassengerCommand`, so this route stops short of inventing unsupported directory automation."
      />
    </div>
  );
}
