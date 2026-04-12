import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function HomePage() {
  const client = getOpsClient();

  let apiStatus = "unknown";
  let flagsEnabled = false;
  let moduleStatus = {
    dispatch: false,
    complaint: false,
    callcenter: false,
    reports: false,
    registry: false,
  };

  try {
    const identity = await client.getIdentityContext();
    apiStatus = identity ? "connected" : "error";
  } catch {
    apiStatus = "disconnected";
  }

  try {
    const flags = await client.getFeatureFlags();
    flagsEnabled = true;
    moduleStatus = {
      dispatch:
        flags.flags.find((f) => f.key === "ops-console.dispatch")?.enabled ??
        false,
      complaint:
        flags.flags.find((f) => f.key === "ops-console.complaint")?.enabled ??
        false,
      callcenter:
        flags.flags.find((f) => f.key === "ops-console.callcenter")?.enabled ??
        false,
      reports:
        flags.flags.find((f) => f.key === "ops-console.reports")?.enabled ??
        false,
      registry:
        flags.flags.find((f) => f.key === "phase1.read-models")?.enabled ??
        false,
    };
  } catch {
    moduleStatus = {
      dispatch: true,
      complaint: true,
      callcenter: true,
      reports: true,
      registry: true,
    };
  }

  return (
    <main className="app-grid">
      <span className="pill">Phase 1 ops integration</span>
      <AppShellCard
        title="Ops Console Web"
        description={`API status: ${apiStatus}. Feature flags: ${flagsEnabled ? "active" : "fallback"}.`}
      >
        <div className="module-status">
          <h3>Module Status</h3>
          <ul>
            <li>
              <strong>Dispatch:</strong>{" "}
              {moduleStatus.dispatch ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Complaint:</strong>{" "}
              {moduleStatus.complaint ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Callcenter:</strong>{" "}
              {moduleStatus.callcenter ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Reports:</strong>{" "}
              {moduleStatus.reports ? "✅ Enabled" : "❌ Disabled"}
            </li>
            <li>
              <strong>Registry:</strong>{" "}
              {moduleStatus.registry ? "✅ Enabled" : "❌ Disabled"}
            </li>
          </ul>
        </div>
        <div className="route-list">
          <Link className="route-link" href="/dashboard">
            <strong>Dashboard</strong>
            Operational overview and system health.
          </Link>
          {moduleStatus.dispatch && (
            <Link className="route-link" href="/dispatch">
              <strong>Dispatch</strong>
              View dispatch jobs and assignments.
            </Link>
          )}
          {moduleStatus.complaint && (
            <Link className="route-link" href="/complaints">
              <strong>Complaints</strong>
              View and manage complaint cases.
            </Link>
          )}
          {moduleStatus.callcenter && (
            <Link className="route-link" href="/callcenter">
              <strong>Callcenter</strong>
              View call sessions and recording status.
            </Link>
          )}
          {moduleStatus.reports && (
            <Link className="route-link" href="/reports">
              <strong>Reports</strong>
              Operational reporting and filing.
            </Link>
          )}
          {moduleStatus.registry && (
            <>
              <Link className="route-link" href="/vehicles">
                <strong>Vehicles</strong>
                Regulatory vehicle registry.
              </Link>
              <Link className="route-link" href="/drivers">
                <strong>Drivers</strong>
                Regulatory driver registry.
              </Link>
              <Link className="route-link" href="/contracts">
                <strong>Contracts</strong>
                Regulatory contract registry.
              </Link>
            </>
          )}
          <Link className="route-link" href="/feature-flags">
            <strong>Feature Flags</strong>
            View rollout flag status.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
