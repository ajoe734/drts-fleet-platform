import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "./index";

const canvasBaseSrc = "/drts-design-canvas/Ops%20Console.html";

const opsSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    key: "dispatch",
    title: "Realtime Dispatch",
    items: [
      {
        href: "/dispatch",
        label: "Dispatch",
        badge: "23",
        badgeTone: "accent",
      },
    ],
  },
  {
    key: "master",
    title: "Master Data",
    items: [
      { href: "/drivers", label: "Drivers", badge: "5", badgeTone: "warning" },
      {
        href: "/vehicles",
        label: "Vehicles",
        badge: "4",
        badgeTone: "warning",
      },
      {
        href: "/contracts",
        label: "Contracts",
        badge: "3",
        badgeTone: "warning",
      },
      { href: "/feature-flags", label: "Feature flags" },
    ],
  },
];

const pageStackStyle = {
  maxWidth: "1180px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.95fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const listItemStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
};

const comparisonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
  overflowX: "auto" as const,
};

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "12px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function StoryChrome({
  heading,
  summary,
  built,
  anchor,
}: {
  heading: string;
  summary: string;
  built: React.ReactNode;
  anchor: string;
}) {
  return (
    <div style={{ padding: "24px", background: "#e2e8f0" }}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#475569",
            }}
          >
            {heading}
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
        <div style={comparisonGridStyle}>
          <ComparisonFrame
            title="Built"
            subtitle="`@drts/ui-web` parity target composed with the Wave 2 ops shell."
          >
            <div
              style={{
                minWidth: "720px",
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
              }}
            >
              {built}
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle={`\`docs/05-ui/drts-design-canvas/Ops Console.html#${anchor}\``}
          >
            <iframe
              src={`${canvasBaseSrc}#${anchor}`}
              title={`${anchor} canvas reference`}
              style={{
                width: "100%",
                minWidth: "720px",
                height: "900px",
                border: "1px solid #cbd5e1",
                borderRadius: "22px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

function OpsStoryShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "Operations Console",
        brandSub: "Phase 1 master data",
        brandIcon: (
          <span style={{ fontSize: "11px", fontWeight: 700 }}>OC</span>
        ),
        sections: opsSections,
        currentPath,
      }}
      topbar={{
        breadcrumb: [{ label: "Operations Console" }, { label: breadcrumb }],
        envLabel: "ops",
        envTone: "ops",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function DriversBuiltView() {
  return (
    <OpsStoryShell currentPath="/drivers" breadcrumb="Drivers">
      <PageHeader
        eyebrow="Master data"
        title="Drivers"
        subtitle="Roster, shift state, dispatch eligibility, and location freshness in one view."
        meta={[
          { label: "Drivers", value: "148" },
          { label: "Eligible", value: "136", tone: "success" },
          { label: "Attention", value: "5", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Dispatch eligible"
          value="136"
          detail="12 blocked by gates"
          tone="success"
        />
        <KpiCard
          label="On shift"
          value="121"
          detail="27 offline or paused"
          tone="ops"
        />
        <KpiCard
          label="Live location"
          value="117"
          detail="4 stale snapshots"
          tone="warning"
        />
        <KpiCard
          label="Blocked reasons"
          value="5"
          detail="Manual dispatch follow-up required"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="4 drivers have stale location telemetry"
        description="Dispatch can continue, but ETA confidence and incident trace quality are reduced until devices report again."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Drivers"
          subtitle="148 drivers in the active ops roster."
          tone="ops"
          density="compact"
          summary="136 eligible, 5 blocked, 117 live, 4 stale."
          footer="Review the attention queue before opening the full driver detail pages."
          filters={
            <DataFilterBar
              ariaLabel="Driver views"
              value="all"
              filters={[
                { value: "all", label: "All", count: 148, tone: "ops" },
                {
                  value: "eligible",
                  label: "Eligible",
                  count: 136,
                  tone: "success",
                },
                { value: "shift", label: "On shift", count: 121, tone: "info" },
                {
                  value: "attention",
                  label: "Attention",
                  count: 5,
                  tone: "warning",
                },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Driver ID", width: "220px" },
              { label: "Shift", width: "150px" },
              { label: "Dispatch", width: "140px" },
              { label: "Eligibility blocked" },
              { label: "Location", width: "130px" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>drv_1021</strong>}
                  secondary="Wang Mei"
                  tertiary="airport · premium"
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="shift"
                  label="available"
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="dispatch"
                  label="yes"
                />
              </Td>
              <Td density="compact" muted>
                eligibility clear
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="location"
                  label="live"
                />
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>drv_1088</strong>}
                  secondary="Lin Chia"
                  tertiary="wheelchair · hospital"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="info" authorityLabel="shift" label="busy" />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="danger"
                  authorityLabel="dispatch"
                  label="no"
                />
              </Td>
              <Td density="compact">license renewal / onboarding hold</Td>
              <Td density="compact">
                <StatusChip
                  tone="warning"
                  authorityLabel="location"
                  label="stale"
                />
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Dispatch attention"
          subtitle="Drivers blocked by eligibility, licensing, or stale telemetry."
          tone="warning"
          density="compact"
          summary="Highest-risk rows are surfaced here before the full registry scan."
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              [
                "Lin Chia",
                "drv_1088",
                "Blocked by license renewal and stale telemetry.",
              ],
              [
                "Chen Yu",
                "drv_1099",
                "Missing GPS heartbeat after shift check-in.",
              ],
              [
                "Ho Min",
                "drv_1110",
                "Eligibility manual review still pending.",
              ],
            ].map(([name, id, detail]) => (
              <div key={id} style={listItemStyle}>
                <DataCellStack
                  primary={<strong>{name}</strong>}
                  secondary={id}
                  tertiary="Needs dispatch follow-up"
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <StatusChip
                    tone="warning"
                    authorityLabel="dispatch"
                    label="blocked"
                  />
                  <StatusChip
                    tone="warning"
                    authorityLabel="location"
                    label="stale"
                  />
                </div>
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  {detail}
                </span>
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function VehiclesBuiltView() {
  return (
    <OpsStoryShell currentPath="/vehicles" breadcrumb="Vehicles">
      <PageHeader
        eyebrow="Master data"
        title="Vehicles"
        subtitle="Dispatchability, contract coverage, insurance state, and offboarding debt in one registry."
        meta={[
          { label: "Vehicles", value: "84" },
          { label: "Dispatchable", value: "73", tone: "success" },
          { label: "Offboarding", value: "4", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Dispatchable"
          value="73"
          detail="11 still blocked"
          tone="success"
        />
        <KpiCard
          label="Blocked reasons"
          value="6"
          detail="Dispatch gates still incomplete"
          tone="warning"
        />
        <KpiCard
          label="Offboarding"
          value="4"
          detail="2 still waiting on debrand"
          tone="warning"
        />
        <KpiCard
          label="Attention queue"
          value="8"
          detail="Manual supply follow-up required"
          tone="danger"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="2 vehicles still need debranding"
        description="These units are already on the offboarding path. Confirm asset removal and partner handback before the contract closes."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Vehicles"
          subtitle="84 active registry rows across all operating areas."
          tone="ops"
          density="compact"
          summary="73 dispatchable, 6 blocked, 4 offboarding, 2 debrand pending."
          filters={
            <DataFilterBar
              ariaLabel="Vehicle views"
              value="all"
              filters={[
                { value: "all", label: "All", count: 84, tone: "ops" },
                {
                  value: "dispatchable",
                  label: "Dispatchable",
                  count: 73,
                  tone: "success",
                },
                {
                  value: "blocked",
                  label: "Blocked",
                  count: 6,
                  tone: "warning",
                },
                {
                  value: "offboarding",
                  label: "Offboarding",
                  count: 4,
                  tone: "warning",
                },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Vehicle ID", width: "220px" },
              { label: "Operating area", width: "160px" },
              { label: "Lifecycle", width: "280px" },
              { label: "Dispatchable", width: "220px" },
              { label: "Last change" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>veh_2040</strong>}
                  secondary="ABC-9812"
                  tertiary="airport · premium"
                />
              </Td>
              <Td density="compact">Taipei Airport</Td>
              <Td density="compact">
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <StatusChip
                    tone="success"
                    authorityLabel="contract"
                    label="active"
                  />
                  <StatusChip
                    tone="success"
                    authorityLabel="insurance"
                    label="active"
                  />
                  <StatusChip
                    tone="neutral"
                    authorityLabel="offboarding"
                    label="none"
                  />
                </div>
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <StatusChip
                      tone="success"
                      authorityLabel="dispatch"
                      label="yes"
                    />
                  }
                  secondary="No blocked reasons"
                />
              </Td>
              <Td density="compact">Contract synced 2026-05-10 16:48</Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>veh_2061</strong>}
                  secondary="KLB-1170"
                  tertiary="hospital shuttle"
                />
              </Td>
              <Td density="compact">New Taipei</Td>
              <Td density="compact">
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <StatusChip
                    tone="warning"
                    authorityLabel="contract"
                    label="draft"
                  />
                  <StatusChip
                    tone="success"
                    authorityLabel="insurance"
                    label="active"
                  />
                  <StatusChip
                    tone="warning"
                    authorityLabel="offboarding"
                    label="pending"
                  />
                </div>
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <StatusChip
                      tone="warning"
                      authorityLabel="dispatch"
                      label="no"
                    />
                  }
                  secondary="contract setup / debrand pending"
                />
              </Td>
              <Td density="compact">
                Offboarding queue opened 2026-05-10 15:20
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Supply follow-up"
          subtitle="Vehicles with offboarding, debranding, or dispatch gate debt."
          tone="warning"
          density="compact"
          summary="Use this short queue before scanning the full registry."
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              [
                "ABC-9812",
                "veh_2061",
                "Contract draft and debrand still pending.",
              ],
              [
                "JKT-5520",
                "veh_2094",
                "Insurance renewal waiting on partner paperwork.",
              ],
              [
                "MNN-4408",
                "veh_2101",
                "Offboarding handback target missed by 1 day.",
              ],
            ].map(([plate, id, detail]) => (
              <div key={id} style={listItemStyle}>
                <DataCellStack
                  primary={<strong>{plate}</strong>}
                  secondary={id}
                  tertiary="Needs supply follow-up"
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <StatusChip
                    tone="warning"
                    authorityLabel="dispatch"
                    label="blocked"
                  />
                  <StatusChip
                    tone="warning"
                    authorityLabel="offboarding"
                    label="pending"
                  />
                </div>
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  {detail}
                </span>
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function ContractsBuiltView() {
  return (
    <OpsStoryShell currentPath="/contracts" breadcrumb="Contracts">
      <PageHeader
        eyebrow="Master data"
        title="Contracts"
        subtitle="Vehicle contracts, partner relationships, and manual review debt in one control surface."
        meta={[
          { label: "Contracts", value: "62" },
          { label: "Partners", value: "16" },
          { label: "Manual review", value: "3", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active contracts"
          value="51"
          detail="6 drafts still pending"
          tone="success"
        />
        <KpiCard
          label="Manual review queue"
          value="3"
          detail="7 partner eligibility items"
          tone="warning"
        />
        <KpiCard
          label="Ineligible"
          value="2"
          detail="Partner or policy follow-up required"
          tone="danger"
        />
        <KpiCard
          label="Expired contracts"
          value="4"
          detail="Prevent operational drift into expired rows"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="3 items are waiting on manual partner review"
        description="Keep the queue visible to operations so fallback requests do not disappear behind contract data."
      />
      <DataViewCard
        title="Review queue"
        subtitle="Partner eligibility rows requiring manual review."
        tone="warning"
        density="compact"
        summary="7 total rows, 3 manual review, 2 ineligible."
        filters={
          <DataFilterBar
            ariaLabel="Review queue views"
            value="all"
            filters={[
              { value: "all", label: "All", count: 7, tone: "warning" },
              { value: "manual", label: "Manual", count: 3, tone: "warning" },
              {
                value: "ineligible",
                label: "Ineligible",
                count: 2,
                tone: "danger",
              },
            ]}
          />
        }
      >
        <DataTable
          density="compact"
          tone="warning"
          columns={[
            { label: "Partner entry", width: "220px" },
            { label: "Reason", width: "220px" },
            { label: "Status", width: "130px" },
            { label: "Attempts", width: "130px" },
            { label: "Requested at", width: "190px" },
            { label: "Context" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>airport_limo</strong>}
                secondary="partner-air-01"
              />
            </Td>
            <Td density="compact">vehicle_capacity_mismatch</Td>
            <Td density="compact">
              <StatusChip
                tone="warning"
                authorityLabel="decision"
                label="manual_review"
              />
            </Td>
            <Td density="compact">2</Td>
            <Td density="compact">2026-05-10 16:44</Td>
            <Td density="compact" muted>
              fallback requested by ops after adapter rejection
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
      <DataViewCard
        title="Contracts"
        subtitle="62 contracts across fleet supply and partner channels."
        tone="ops"
        density="compact"
        summary="51 active, 6 draft, 3 review-queue attention items."
        filters={
          <DataFilterBar
            ariaLabel="Contract views"
            value="all"
            filters={[
              { value: "all", label: "All", count: 62, tone: "ops" },
              { value: "active", label: "Active", count: 51, tone: "success" },
              { value: "draft", label: "Draft", count: 6, tone: "warning" },
              { value: "expired", label: "Expired", count: 4, tone: "warning" },
            ]}
          />
        }
      >
        <DataTable
          density="compact"
          tone="ops"
          columns={[
            { label: "Contract ID", width: "220px" },
            { label: "Vehicle", width: "140px" },
            { label: "Partner", width: "180px" },
            { label: "Type", width: "180px" },
            { label: "Status", width: "140px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>ctr_5001</strong>}
                secondary="airport-premium"
                tertiary="taipei-airport"
              />
            </Td>
            <Td density="compact" mono>
              veh_2040
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="partner_airport_limo"
                secondary="operator"
              />
            </Td>
            <Td density="compact">
              <DataCellStack primary="supply" secondary="active" />
            </Td>
            <Td density="compact">
              <StatusChip
                tone="success"
                authorityLabel="status"
                label="active"
              />
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </OpsStoryShell>
  );
}

function FlagsBuiltView() {
  return (
    <OpsStoryShell currentPath="/feature-flags" breadcrumb="Feature flags">
      <PageHeader
        eyebrow="Master data"
        title="Feature Flags"
        subtitle="Read-only visibility into rollout switches governed by platform controls."
        meta={[
          { label: "Flags", value: "14" },
          { label: "Enabled", value: "9", tone: "success" },
          { label: "Scopes", value: "4" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard label="Enabled" value="9" detail="5 disabled" tone="success" />
        <KpiCard
          label="Ops console"
          value="4"
          detail="Operationally visible switches"
          tone="ops"
        />
        <KpiCard
          label="Driver app"
          value="4"
          detail="Mobile rollout dependencies"
          tone="info"
        />
        <KpiCard
          label="Read only"
          value="Yes"
          detail="Published by platform governance, not edited here"
          tone="neutral"
        />
      </KpiRow>
      <CalloutBanner
        tone="info"
        title="Read-only operational mirror"
        description="Flags stay visible in ops so rollout state can be correlated with incidents, dispatch drift, or support load without changing source governance."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Feature Flags"
          subtitle="14 rollout switches mirrored into ops."
          tone="ops"
          density="compact"
          summary="9 enabled, 5 disabled."
          footer="Governance lives upstream; this screen is for operational visibility only."
          filters={
            <DataFilterBar
              ariaLabel="Flag views"
              value="all"
              filters={[
                { value: "all", label: "All", count: 14, tone: "ops" },
                {
                  value: "enabled",
                  label: "Enabled",
                  count: 9,
                  tone: "success",
                },
                {
                  value: "disabled",
                  label: "Disabled",
                  count: 5,
                  tone: "neutral",
                },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Key" },
              { label: "Scope", width: "120px" },
              { label: "Status", width: "100px" },
              { label: "Description" },
            ]}
          >
            <Tr>
              <Td mono density="compact">
                <DataCellStack
                  primary="ops-console.dispatch"
                  secondary="enabled"
                />
              </Td>
              <Td density="compact" muted>
                Ops console
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="state"
                  label="enabled"
                />
              </Td>
              <Td density="compact" muted>
                Dispatch board rollout is visible to operations.
              </Td>
            </Tr>
            <Tr>
              <Td mono density="compact">
                <DataCellStack
                  primary="tenant-portal.reports"
                  secondary="disabled"
                />
              </Td>
              <Td density="compact" muted>
                Tenant portal
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="neutral"
                  authorityLabel="state"
                  label="disabled"
                />
              </Td>
              <Td density="compact" muted>
                Report submission remains off until tenant UAT signoff.
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Scope summary"
          subtitle="How many switches are active per product surface."
          tone="info"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              ["Ops console", "4 enabled of 4"],
              ["Driver app", "3 enabled of 4"],
              ["Tenant portal", "1 enabled of 4"],
              ["Phase 1", "1 enabled of 2"],
            ].map(([scope, summary]) => (
              <div key={scope} style={listItemStyle}>
                <DataCellStack
                  primary={<strong>{scope}</strong>}
                  secondary={summary}
                />
                <StatusChip
                  tone="success"
                  authorityLabel="enabled"
                  label={summary}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

const meta = {
  title: "OpsMasterData",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity targets for the Wave 2 ops master-data redesign. Use each story beside the matching OC master artboard during OPS-UI-RD-008 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Drivers: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Master Data Parity Review"
      summary="Built implementation and the `OC_Drivers` artboard are rendered in the same Storybook view for manual side-by-side review."
      built={<DriversBuiltView />}
      anchor="drivers"
    />
  ),
};

export const Vehicles: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Master Data Parity Review"
      summary="Built implementation and the `OC_Vehicles` artboard are rendered in the same Storybook view for manual side-by-side review."
      built={<VehiclesBuiltView />}
      anchor="vehicles"
    />
  ),
};

export const Contracts: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Master Data Parity Review"
      summary="Built implementation and the `OC_Contracts` artboard are rendered in the same Storybook view for manual side-by-side review."
      built={<ContractsBuiltView />}
      anchor="contracts"
    />
  ),
};

export const Flags: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Master Data Parity Review"
      summary="Built implementation and the `OC_Flags` artboard are rendered in the same Storybook view for manual side-by-side review."
      built={<FlagsBuiltView />}
      anchor="flags"
    />
  ),
};
