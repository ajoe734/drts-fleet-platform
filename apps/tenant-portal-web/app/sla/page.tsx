import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getSlaProfile, updateSlaProfile } from "./actions";
import type { TenantSlaProfile } from "@drts/contracts";

export default async function SlaPage() {
  const { profile, error: fetchError } = await getSlaProfile();

  return (
    <main className="app-grid">
      <AppShellCard
        title="SLA Profile"
        description="View and update SLA thresholds for wait, arrival, and completion times across DRTS-operated and externally fulfilled bookings."
      >
        {fetchError && (
          <div className="error-banner">
            <strong>Error loading SLA profile:</strong> {fetchError}
          </div>
        )}

        <div className="source-guidance">
          <strong>How to read these thresholds:</strong> DRTS-operated bookings
          measure dispatch and trip delay inside the platform. Externally
          fulfilled bookings still surface here, but tenant-facing delay can
          come from the external fulfillment handoff rather than a DRTS dispatch
          queue alone.
        </div>

        {profile && <SlaProfileTable profile={profile} />}

        <UpdateSlaForm profile={profile} />

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}

function SlaProfileTable({ profile }: { profile: TenantSlaProfile }) {
  return (
    <div className="data-table" style={{ marginBottom: "1rem" }}>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Threshold (minutes)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Wait Time Threshold</td>
            <td>{profile.waitThresholdMin} min</td>
          </tr>
          <tr>
            <td>Arrival Time Threshold</td>
            <td>{profile.arrivalThresholdMin} min</td>
          </tr>
          <tr>
            <td>Completion Time Threshold</td>
            <td>{profile.completionThresholdMin} min</td>
          </tr>
          <tr>
            <td>Last Updated</td>
            <td>
              {profile.updatedAt
                ? new Date(profile.updatedAt).toLocaleString()
                : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function UpdateSlaForm({ profile }: { profile: TenantSlaProfile | null }) {
  return (
    <form action={updateSlaProfile}>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>New Value (minutes)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <label htmlFor="waitThresholdMin">Wait Time</label>
              </td>
              <td>
                <input
                  type="number"
                  id="waitThresholdMin"
                  name="waitThresholdMin"
                  min={1}
                  defaultValue={profile?.waitThresholdMin ?? 15}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="arrivalThresholdMin">Arrival Time</label>
              </td>
              <td>
                <input
                  type="number"
                  id="arrivalThresholdMin"
                  name="arrivalThresholdMin"
                  min={1}
                  defaultValue={profile?.arrivalThresholdMin ?? 30}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="completionThresholdMin">Completion Time</label>
              </td>
              <td>
                <input
                  type="number"
                  id="completionThresholdMin"
                  name="completionThresholdMin"
                  min={1}
                  defaultValue={profile?.completionThresholdMin ?? 60}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button type="submit" className="btn-primary">
          Update SLA Profile
        </button>
      </div>
    </form>
  );
}
