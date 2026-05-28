import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { CSSProperties } from "react";

type SurfaceStory = {
  taskId: string;
  route: string;
  title: string;
  canvasAnchor: string;
  commit: string;
  branch: string;
  notes: string;
};

const stories: Record<string, SurfaceStory> = {
  Dashboard: {
    taskId: "UI-FE-OPS-DSH",
    route: "/dashboard",
    title: "Operations Dashboard",
    canvasAnchor: "dashboard",
    commit: "35ae4509",
    branch: "origin/codex2/ui-fe-ops-dsh",
    notes: "Dashboard rebuild shipped as the ops landing surface.",
  },
  Dispatch: {
    taskId: "UI-FE-OPS-DSP",
    route: "/dispatch",
    title: "Dispatch multi-board",
    canvasAnchor: "dispatch-ready",
    commit: "7be06a44",
    branch: "origin/codex/ui-fe-ops-dsp",
    notes:
      "Canvas parity covers the six first-class dispatch boards under the dispatch route.",
  },
  DispatchDetail: {
    taskId: "UI-FE-OPS-DSPID",
    route: "/dispatch/[dispatchId]",
    title: "Dispatch workspace detail",
    canvasAnchor: "dispatch-detail",
    commit: "c60c7113",
    branch: "origin/codex/ui-fe-ops-dspid",
    notes: "Detail workspace preserves owned and forwarded dispatch variants.",
  },
  CallCenter: {
    taskId: "UI-FE-OPS-CC",
    route: "/callcenter",
    title: "Call center workspace",
    canvasAnchor: "callcenter",
    commit: "ea233a00",
    branch: "origin/codex/ui-fe-ops-cc",
    notes: "Call center flow stays aligned to packet §5.4.",
  },
  Complaints: {
    taskId: "UI-FE-OPS-CMP",
    route: "/complaints",
    title: "Complaint center",
    canvasAnchor: "complaints",
    commit: "36e314d4",
    branch: "origin/codex2/ui-fe-ops-cmp",
    notes:
      "Complaint queue surface remains read-only except availableActions-driven CTAs.",
  },
  ComplaintDetail: {
    taskId: "UI-FE-OPS-CMPID",
    route: "/complaints/[caseNo]",
    title: "Complaint detail",
    canvasAnchor: "complaint-detail",
    commit: "43f1f457",
    branch: "origin/codex/ui-fe-ops-cmpid",
    notes:
      "New complaint detail route ships with artifact proxy and action workspace.",
  },
  Incidents: {
    taskId: "UI-FE-OPS-INC",
    route: "/incidents",
    title: "Incident center",
    canvasAnchor: "incidents",
    commit: "66b43ccd",
    branch: "origin/codex2/ui-fe-ops-inc",
    notes: "Incident registry mirrors packet §5.7 and shared shell chrome.",
  },
  IncidentDetail: {
    taskId: "UI-FE-OPS-INCID",
    route: "/incidents/[incidentId]",
    title: "Incident coordination detail",
    canvasAnchor: "incident-detail",
    commit: "33e3eca3",
    branch: "origin/codex2/ui-fe-ops-incid",
    notes: "Detail route preserves coordination timeline and response state.",
  },
  Approvals: {
    taskId: "UI-FE-OPS-APR",
    route: "/approval-requests",
    title: "Cross-tenant approval queue",
    canvasAnchor: "approvals",
    commit: "26587e81",
    branch: "origin/codex2/ui-fe-ops-apr",
    notes: "Approvals page stays read-only and approval-action driven.",
  },
  Reports: {
    taskId: "UI-FE-OPS-RPT",
    route: "/reports",
    title: "Reporting",
    canvasAnchor: "reports",
    commit: "14b19bb0",
    branch: "origin/codex2/ui-fe-ops-rpt",
    notes: "Reports page stays bound to published reporting contracts.",
  },
  Revenue: {
    taskId: "UI-FE-OPS-REV",
    route: "/revenue",
    title: "Revenue review",
    canvasAnchor: "revenue",
    commit: "18ecca75",
    branch: "origin/codex2/ui-fe-ops-rev",
    notes: "Revenue page preserves shadow-ledger and reconciliation framing.",
  },
  Attendance: {
    taskId: "UI-FE-OPS-ATT",
    route: "/attendance",
    title: "Attendance and shifts",
    canvasAnchor: "attendance",
    commit: "b86636b5",
    branch: "origin/codex/ui-fe-ops-att",
    notes:
      "Attendance surface stays aligned to shift registry and exception views.",
  },
  Maintenance: {
    taskId: "UI-FE-OPS-MNT",
    route: "/maintenance",
    title: "Maintenance",
    canvasAnchor: "maintenance",
    commit: "f87e5362",
    branch: "origin/codex/ui-fe-ops-mnt",
    notes: "Maintenance dashboard remains mutation-free in ops console.",
  },
  Drivers: {
    taskId: "UI-FE-OPS-DRV",
    route: "/drivers",
    title: "Driver registry",
    canvasAnchor: "drivers",
    commit: "68643cba",
    branch: "origin/codex2/ui-fe-ops-drv",
    notes: "Driver registry keeps availableActions- and status-driven rows.",
  },
  DriverDetail: {
    taskId: "UI-FE-OPS-DRVID",
    route: "/drivers/[driverId]",
    title: "Driver detail and earnings",
    canvasAnchor: "driver-detail",
    commit: "880c4345",
    branch: "origin/codex2/ui-fe-ops-drvid",
    notes: "Driver detail preserves earnings and platform-binding read model.",
  },
  Vehicles: {
    taskId: "UI-FE-OPS-VEH",
    route: "/vehicles",
    title: "Vehicle registry",
    canvasAnchor: "vehicles",
    commit: "c42ac488",
    branch: "origin/codex2/ui-fe-ops-veh",
    notes: "Vehicle registry route stays paired with the new detail deep link.",
  },
  VehicleDetail: {
    taskId: "UI-FE-OPS-VEHID",
    route: "/vehicles/[vehicleId]",
    title: "Vehicle detail",
    canvasAnchor: "vehicle-detail",
    commit: "b9fe9412",
    branch: "origin/codex2/ui-fe-ops-vehid",
    notes:
      "New vehicle detail route preserves registry, readiness, and deep-link context.",
  },
  Contracts: {
    taskId: "UI-FE-OPS-CON",
    route: "/contracts",
    title: "Contracts and partner relations",
    canvasAnchor: "contracts",
    commit: "2be190a2",
    branch: "origin/codex/ui-fe-ops-con",
    notes:
      "Contracts list keeps read-only ops posture and partner relation context.",
  },
  ContractDetail: {
    taskId: "UI-FE-OPS-CONID",
    route: "/contracts/[contractId]",
    title: "Contract detail",
    canvasAnchor: "contract-detail",
    commit: "a22ab80e",
    branch: "origin/codex2/ui-fe-ops-conid",
    notes:
      "New contract detail route remains read-only and deep-links to owner apps.",
  },
  Flags: {
    taskId: "UI-FE-OPS-FF",
    route: "/feature-flags",
    title: "Feature flags",
    canvasAnchor: "flags",
    commit: "b4b69202",
    branch: "origin/codex/ui-fe-ops-ff",
    notes: "Feature flags surface remains read-only by design.",
  },
};

const meta = {
  title: "Ops Console/Closeout Review",
  parameters: {
    layout: "fullscreen",
  },
  args: {
    story: stories.Dashboard,
  },
  render: ({ story }: { story: SurfaceStory }) => (
    <SurfaceParityReview story={story} />
  ),
} satisfies Meta<{ story: SurfaceStory }>;

export default meta;

type Story = StoryObj<typeof meta>;

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "24px",
  background:
    "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(30,41,59,1) 100%)",
  color: "#e2e8f0",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(360px, 420px) minmax(720px, 1fr)",
  alignItems: "start",
};

const panelStyle: CSSProperties = {
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 18px 48px rgba(2, 6, 23, 0.35)",
};

const iframeStyle: CSSProperties = {
  width: "100%",
  minHeight: "920px",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: "20px",
  background: "#fff",
};

function SurfaceParityReview({ story }: { story: SurfaceStory }) {
  return (
    <div style={pageStyle}>
      <div
        style={{
          display: "grid",
          gap: "16px",
          maxWidth: "1440px",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#fca5a5",
              fontWeight: 700,
            }}
          >
            Ops Console parity review
          </div>
          <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.2 }}>
            {story.title}
          </h1>
          <p
            style={{
              margin: 0,
              color: "#cbd5e1",
              maxWidth: "920px",
              lineHeight: 1.6,
            }}
          >
            Closeout review story for {story.taskId}. The shipped surface is
            tracked by route, branch, and commit, while the design pane anchors
            the matching artboard in{" "}
            <code>docs/05-ui/drts-design-canvas/Ops Console.html</code>.
          </p>
        </div>

        <div style={gridStyle}>
          <section style={panelStyle}>
            <div style={{ display: "grid", gap: "14px" }}>
              <DetailRow label="Task" value={story.taskId} />
              <DetailRow label="Route" value={story.route} />
              <DetailRow label="Branch" value={story.branch} />
              <DetailRow label="Commit" value={story.commit} />
              <DetailRow
                label="Canvas anchor"
                value={`#${story.canvasAnchor}`}
              />
              <DetailRow label="Closeout note" value={story.notes} />
              <div
                style={{
                  marginTop: "8px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "rgba(248, 113, 113, 0.12)",
                  border: "1px solid rgba(252, 165, 165, 0.28)",
                  color: "#fecaca",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                This review story is a closeout artifact: it binds each shipped
                route to its task evidence and the matching canvas artboard so
                Storybook can participate in umbrella verification.
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <iframe
              src={`/drts-design-canvas/Ops%20Console.html#${story.canvasAnchor}`}
              title={`Ops Console canvas ${story.canvasAnchor}`}
              style={iframeStyle}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div
        style={{
          fontSize: "11px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#94a3b8",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ color: "#f8fafc", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

export const Dashboard: Story = { args: { story: stories.Dashboard } };
export const Dispatch: Story = { args: { story: stories.Dispatch } };
export const DispatchDetail: Story = {
  args: { story: stories.DispatchDetail },
};
export const CallCenter: Story = { args: { story: stories.CallCenter } };
export const Complaints: Story = { args: { story: stories.Complaints } };
export const ComplaintDetail: Story = {
  args: { story: stories.ComplaintDetail },
};
export const Incidents: Story = { args: { story: stories.Incidents } };
export const IncidentDetail: Story = {
  args: { story: stories.IncidentDetail },
};
export const Approvals: Story = { args: { story: stories.Approvals } };
export const Reports: Story = { args: { story: stories.Reports } };
export const Revenue: Story = { args: { story: stories.Revenue } };
export const Attendance: Story = { args: { story: stories.Attendance } };
export const Maintenance: Story = { args: { story: stories.Maintenance } };
export const Drivers: Story = { args: { story: stories.Drivers } };
export const DriverDetail: Story = { args: { story: stories.DriverDetail } };
export const Vehicles: Story = { args: { story: stories.Vehicles } };
export const VehicleDetail: Story = { args: { story: stories.VehicleDetail } };
export const Contracts: Story = { args: { story: stories.Contracts } };
export const ContractDetail: Story = {
  args: { story: stories.ContractDetail },
};
export const Flags: Story = { args: { story: stories.Flags } };
