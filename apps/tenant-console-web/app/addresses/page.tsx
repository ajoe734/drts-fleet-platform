import type { TenantAddressRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function compareAddresses(
  left: TenantAddressRecord,
  right: TenantAddressRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }

  return left.addressName.localeCompare(right.addressName, "zh-Hant");
}

export default async function AddressesPage() {
  const client = getTenantClient();
  const addresses = [
    ...((await client.listAddresses()) as TenantAddressRecord[]),
  ].sort(compareAddresses);
  const activeCount = addresses.filter((address) => address.activeFlag).length;
  const sensitiveCount = addresses.filter(
    (address) => address.sensitiveFlag,
  ).length;
  const attentionCount = addresses.filter(
    (address) => (address.qualityIssues?.length ?? 0) > 0,
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Addresses"
        title="Address governance now has its own tenant route instead of hiding under parity placeholders."
        description="The rebuild exposes reusable pickup and drop-off records, masking posture, geocode quality, and passenger ownership from the canonical `/addresses` route."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Active records</span>
          <strong>{formatCount(activeCount)}</strong>
          <p>{formatCount(addresses.length)} total address record(s) loaded.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Sensitive</span>
          <strong>{formatCount(sensitiveCount)}</strong>
          <p>Masked or privacy-sensitive address book entries.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Attention</span>
          <strong>{formatCount(attentionCount)}</strong>
          <p>Records with geocode or duplicate-normalization quality issues.</p>
        </article>
      </section>

      <SurfaceCard
        kicker="Directory"
        title={`Showing ${formatCount(addresses.length)} address row(s)`}
        description="The list keeps operational labels readable while retaining quality flags and owner references that feed booking intake."
      >
        {addresses.length > 0 ? (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Owner</th>
                  <th>Visibility</th>
                  <th>Geocode</th>
                  <th>Tags</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((address) => (
                  <tr key={address.addressId}>
                    <td>
                      <div className="table-primary">
                        <span>{address.addressName}</span>
                        <span className="table-secondary">
                          {address.maskedAddressText ??
                            address.normalizedAddressText ??
                            address.addressText}
                        </span>
                      </div>
                    </td>
                    <td>{address.ownerPassengerId ?? "Shared"}</td>
                    <td>
                      <div className="table-primary">
                        <span
                          className={`status-chip${address.activeFlag ? " is-active" : ""}`}
                        >
                          {address.activeFlag ? "active" : "inactive"}
                        </span>
                        <span className="table-secondary">
                          {address.sensitiveFlag
                            ? "masked / sensitive"
                            : "standard"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        <span>{address.geocodeSource ?? "none"}</span>
                        <span className="table-secondary">
                          {address.lat !== null && address.lng !== null
                            ? `${address.lat.toFixed(4)}, ${address.lng.toFixed(4)}`
                            : "No coordinates"}
                        </span>
                      </div>
                    </td>
                    <td>
                      {address.tags.length > 0 ||
                      address.qualityIssues?.length ? (
                        <div className="chip-row">
                          {address.tags.map((tag) => (
                            <span className="status-chip" key={tag}>
                              {tag}
                            </span>
                          ))}
                          {(address.qualityIssues ?? []).map((issue) => (
                            <span className="status-badge" key={issue}>
                              {issue}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDateTime(address.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            No tenant address records were returned for this workspace.
          </div>
        )}
      </SurfaceCard>

      <CalloutPanel
        title="Booking intake stays downstream of address governance"
        description="Address records remain reusable inputs for `/bookings/new`; this surface keeps quality and masking state visible before an operator reuses a saved stop."
      />
    </div>
  );
}
