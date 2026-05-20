import type { CSSProperties } from "react";
import type {
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { TenantBookingCreateForm } from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const introGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 12,
  alignItems: "start",
};

const compactCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const mutedCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.6,
  color: th.textMuted,
};

export default async function NewBookingPage() {
  const client = getTenantClient();
  const [passengers, addresses, costCenters] = await Promise.all([
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
    client.listAddresses() as Promise<TenantAddressRecord[]>,
    client.listCostCenters({ activeOnly: true }) as Promise<
      TenantCostCenterRecord[]
    >,
  ]);

  const activePassengers = passengers.filter((row) => row.activeFlag);
  const activeAddresses = addresses.filter((row) => row.activeFlag);
  const activeCostCenters = costCenters.filter((row) => row.activeFlag);
  const primaryPassenger = activePassengers[0] ?? null;
  const primaryCostCenter = activeCostCenters[0] ?? null;

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={th}
        title="Create a booking"
        subtitle="Booking-on-behalf, canonical cost center, approval posture, and quota impact are handled in one route without inventing a local draft system."
        sticky={false}
        actions={
          <>
            <CanvasBtn theme={th} size="sm" disabled>
              No draft action
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" size="sm" disabled>
              Submit for approval
            </CanvasBtn>
          </>
        }
      />

      <CanvasBanner
        theme={th}
        tone="warn"
        icon="warn"
        title="Estimated spend is preview-only"
        body="The built route can preview quota and approval impact from a tenant-entered estimate, but booking create still leaves canonical quoted fare to the backend pricing authority."
      />

      <div style={introGridStyle}>
        <CanvasCard
          theme={th}
          title="New booking"
          subtitle="Trip details and approval-sensitive governance stay visible before submit."
        >
          <div style={compactCardGridStyle}>
            <CanvasKPI
              theme={th}
              label="Passengers"
              value={String(activePassengers.length)}
              sub="Directory-backed booking-on-behalf"
            />
            <CanvasKPI
              theme={th}
              label="Saved addresses"
              value={String(activeAddresses.length)}
              sub="Pickup and drop-off presets"
            />
            <CanvasKPI
              theme={th}
              label="Cost centers"
              value={String(activeCostCenters.length)}
              sub="Approval and quota scope"
            />
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Route posture"
          subtitle="The page keeps the published backend preview vocabulary visible."
        >
          <div style={pillRowStyle}>
            <CanvasPill theme={th} tone="warn">
              Approval posture
            </CanvasPill>
            <CanvasPill theme={th} tone="accent">
              Auto refresh preview
            </CanvasPill>
            {primaryCostCenter ? (
              <CanvasPill theme={th} tone="info">
                {primaryCostCenter.code}
              </CanvasPill>
            ) : null}
          </div>
          <div style={{ height: 12 }} />
          <CanvasDL
            theme={th}
            cols={1}
            items={[
              {
                k: "Primary passenger",
                v: primaryPassenger?.fullName ?? "Manual passenger entry",
              },
              {
                k: "Default cost center",
                v: primaryCostCenter
                  ? `${primaryCostCenter.code} · ${primaryCostCenter.name}`
                  : "No active directory row",
              },
              {
                k: "Estimated spend",
                v: "Preview-only before backend pricing",
              },
            ]}
          />
          <p style={mutedCopyStyle}>
            Use the left-side trip form and the right-side governance panel
            below to complete the request in one pass.
          </p>
        </CanvasCard>
      </div>

      <div style={actionRowStyle}>
        <CanvasPill theme={th} tone="accent">
          Trip + governance
        </CanvasPill>
        <CanvasPill theme={th} tone="info">
          2-column TN layout
        </CanvasPill>
      </div>

      <TenantBookingCreateForm
        addresses={activeAddresses}
        costCenters={activeCostCenters}
        passengers={activePassengers}
      />
    </div>
  );
}
