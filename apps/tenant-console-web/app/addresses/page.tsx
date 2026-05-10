import type { TenantAddressRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function describeQualityIssue(issue: string) {
  switch (issue) {
    case "missing_geocode":
      return "Missing geocode";
    case "duplicate_normalized_address":
      return "Duplicate normalized text";
    default:
      return issue;
  }
}

export default async function AddressesPage() {
  const client = getTenantClient();
  const addresses = (await client.listAddresses()) as TenantAddressRecord[];

  const activeCount = addresses.filter((row) => row.activeFlag).length;
  const sensitiveCount = addresses.filter((row) => row.sensitiveFlag).length;
  const flaggedCount = addresses.filter(
    (row) => (row.qualityIssues?.length ?? 0) > 0,
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Address book"
        title="Tenant addresses now read directly from the published address contract."
        description="Saved pickup and drop-off locations live behind `/api/tenant/addresses`. Rows here keep the backend's masking, geocode source, and quality-issue framing rather than inventing a UI-local directory."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Saved</span>
          <strong>{addresses.length}</strong>
          <p>Addresses currently visible in the tenant scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active</span>
          <strong>{activeCount}</strong>
          <p>Active addresses available for booking selection.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Sensitive</span>
          <strong>{sensitiveCount}</strong>
          <p>Addresses flagged sensitive — masked text is read-only here.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Quality flagged</span>
          <strong>{flaggedCount}</strong>
          <p>
            Rows with at least one geocode or normalization issue to review.
          </p>
        </article>
      </section>

      <SurfaceCard
        kicker="Directory"
        title="Tenant address roster"
        description="Tags, owner, and active state come straight from the contract record. Edits remain command-driven through `UpsertTenantAddressCommand` and are not exposed in this read-only surface."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Tags</th>
                <th>Owner</th>
                <th>Quality</th>
                <th>State</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map((row) => {
                const visibleText = row.sensitiveFlag
                  ? (row.maskedAddressText ?? row.addressText)
                  : row.addressText;
                const issues = row.qualityIssues ?? [];

                return (
                  <tr key={row.addressId}>
                    <td>
                      <div className="table-primary">
                        {row.addressName}
                        <span className="table-secondary">{row.addressId}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {visibleText}
                        <span className="table-secondary">
                          {row.sensitiveFlag
                            ? "Masked · sensitive flag"
                            : `Geocode: ${row.geocodeSource ?? "none"}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      {row.tags.length > 0 ? (
                        <div className="chip-row">
                          {row.tags.map((tag) => (
                            <span key={tag} className="status-chip">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-copy">No tags</span>
                      )}
                    </td>
                    <td>
                      {row.ownerPassengerId ? (
                        <span className="status-chip">
                          {row.ownerPassengerId}
                        </span>
                      ) : (
                        <span className="muted-copy">Tenant-shared</span>
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
        title="Command boundary"
        description="Add, edit, and disable still flow through `UpsertTenantAddressCommand`. This route stops short of inventing inline mutation, geocode rewriting, or sensitive-flag toggles outside of the published command surface."
      />
    </div>
  );
}
