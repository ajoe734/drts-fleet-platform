import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataFilterBar,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  type ManagementTone,
} from "./index";

const canvasCallcenterSrc = "/drts-design-canvas/Ops%20Console.html#callcenter";

type CallcenterTab = "sessions" | "callbacks" | "recordings";

const opsSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        badge: "4",
        badgeTone: "warning",
      },
    ],
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
      {
        href: "/callcenter",
        label: "Callcenter",
        badge: "5",
        badgeTone: "info",
      },
    ],
  },
  {
    key: "monitoring",
    title: "Monitoring",
    items: [
      {
        href: "/incidents",
        label: "Incidents",
        badge: "2",
        badgeTone: "danger",
      },
      { href: "/reports", label: "Reports" },
    ],
  },
];

const fixtureSessions = [
  {
    callId: "call_2031",
    callType: "phone_booking",
    callerPhone: "0912-555-401",
    agentId: "YL.linchen",
    status: "active" as const,
    statusLabel: "active",
    recordingState: "ready" as const,
    recordingLabel: "Ready",
    recordingTone: "success" as ManagementTone,
    linkedOrderId: "ord_8221",
    linkedCaseNo: null,
    started: "2026-05-08 14:53",
    recordingId: "rec_88914",
    providerRef: "cti-prov-A",
  },
  {
    callId: "call_2032",
    callType: "callback",
    callerPhone: "0912-555-402",
    agentId: "YL.linchen",
    status: "active" as const,
    statusLabel: "active",
    recordingState: "pending" as const,
    recordingLabel: "Pending",
    recordingTone: "warning" as ManagementTone,
    linkedOrderId: null,
    linkedCaseNo: null,
    started: "2026-05-08 14:55",
    recordingId: null,
    providerRef: "cti-prov-A",
  },
  {
    callId: "call_2030",
    callType: "complaint",
    callerPhone: "0912-555-380",
    agentId: "ZH.huang",
    status: "active" as const,
    statusLabel: "active",
    recordingState: "missing" as const,
    recordingLabel: "Missing",
    recordingTone: "danger" as ManagementTone,
    linkedOrderId: null,
    linkedCaseNo: "cmp_0894",
    started: "2026-05-08 14:30",
    recordingId: null,
    providerRef: null,
  },
  {
    callId: "call_2027",
    callType: "phone_booking",
    callerPhone: "0912-555-310",
    agentId: "WS.wu",
    status: "closed" as const,
    statusLabel: "closed",
    recordingState: "ready" as const,
    recordingLabel: "Ready",
    recordingTone: "success" as ManagementTone,
    linkedOrderId: "ord_8200",
    linkedCaseNo: null,
    started: "2026-05-08 14:00",
    recordingId: "rec_88840",
    providerRef: "cti-prov-A",
  },
];

const fixtureCallbacks = [
  {
    id: "cb_3120",
    callId: "call_2032",
    status: "pending" as const,
    statusLabel: "pending",
    statusTone: "warning" as ManagementTone,
    due: "2026-05-08 17:30",
    relative: "Due in 25 min",
    linkedOrderId: null,
    linkedCaseNo: null,
    summary: "YL.linchen · 客戶要求 17:30 回撥確認上車地點",
  },
  {
    id: "cb_3119",
    callId: "call_2030",
    status: "pending" as const,
    statusLabel: "pending",
    statusTone: "danger" as ManagementTone,
    due: "2026-05-08 14:50",
    relative: "Overdue by 7 min",
    linkedOrderId: null,
    linkedCaseNo: "cmp_0894",
    summary: "ZH.huang · 客訴跟進 fare_dispute · 已逾期",
  },
  {
    id: "cb_3115",
    callId: "call_2025",
    status: "completed" as const,
    statusLabel: "completed",
    statusTone: "success" as ManagementTone,
    due: "2026-05-08 14:10",
    relative: "Completed at 14:12",
    linkedOrderId: "ord_8190",
    linkedCaseNo: null,
    summary: "WS.wu · 已完成 · 已綁定既有訂單",
  },
];

const tableHeadCellStyle = {
  padding: "10px 12px",
  textAlign: "left" as const,
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  fontSize: "10.5px",
  color: "#64748b",
  background: "#f8fafc",
};

const tableBodyCellStyle = {
  padding: "12px",
  color: "#0f172a",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top" as const,
};

const monoStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const buttonStyle = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer" as const,
  whiteSpace: "nowrap" as const,
};

const primaryButtonStyle = {
  ...buttonStyle,
  border: "1px solid #0f766e",
  background: "#0f766e",
  color: "#ffffff",
};

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  background: "#ffffff",
  color: "#0f172a",
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
    <section
      style={{
        display: "grid",
        gap: "12px",
        alignContent: "start",
      }}
    >
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

function StageCard({
  title,
  state,
  tone,
  note,
}: {
  title: string;
  state: string;
  tone: ManagementTone;
  note: string;
}) {
  const accent =
    tone === "danger"
      ? "#fecaca"
      : tone === "warning"
        ? "#fcd34d"
        : tone === "success"
          ? "#bbf7d0"
          : "#dbe2ea";

  return (
    <article
      style={{
        border: `1px solid ${accent}`,
        borderRadius: "14px",
        background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        padding: "14px 16px",
        display: "grid",
        gap: "8px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </span>
      <strong style={{ color: "#0f172a", fontSize: "14px" }}>{state}</strong>
      <span style={{ color: "#475569", fontSize: "12.5px", lineHeight: 1.5 }}>
        {note}
      </span>
    </article>
  );
}

function OpsCallcenterBuiltView() {
  const [activeTab, setActiveTab] = useState<CallcenterTab>("sessions");
  const sessionsCount = fixtureSessions.filter(
    (session) => session.status === "active",
  ).length;
  const pendingCallbacks = fixtureCallbacks.filter(
    (callback) => callback.status === "pending",
  ).length;
  const recordingGate = fixtureSessions.filter(
    (session) =>
      session.recordingState === "pending" ||
      session.recordingState === "missing",
  ).length;

  return (
    <ManagementShell
      sidebar={{
        brand: "Operations Console",
        brandSub: "Phase 1 dispatch ops",
        brandIcon: (
          <span style={{ fontSize: "11px", fontWeight: 700 }}>OC</span>
        ),
        sections: opsSections,
        currentPath: "/callcenter",
      }}
      topbar={{
        breadcrumb: [{ label: "Operations Console" }, { label: "Callcenter" }],
        envLabel: "ops",
        envTone: "ops",
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gap: "20px",
        }}
      >
        <PageHeader
          eyebrow="Callcenter"
          title="Call Center"
          subtitle="Inbound call triage, order creation, and complaint escalation"
          meta={[
            {
              label: "Open sessions",
              value: sessionsCount,
              tone: "success",
            },
            {
              label: "Pending callbacks",
              value: pendingCallbacks,
              tone: "warning",
            },
            {
              label: "Recording gate",
              value: recordingGate,
              tone: "warning",
            },
          ]}
          actions={
            <>
              <span style={buttonStyle}>Open new intake</span>
              <span style={primaryButtonStyle}>Refresh</span>
            </>
          }
        />

        <DataFilterBar
          value={activeTab}
          filters={[
            {
              value: "sessions",
              label: "Sessions",
              count: sessionsCount,
            },
            {
              value: "callbacks",
              label: "Callback queue",
              count: pendingCallbacks,
              tone: "warning",
            },
            {
              value: "recordings",
              label: "Recordings",
              count: recordingGate,
              tone: "warning",
            },
          ]}
          onChange={(value) => setActiveTab(value as CallcenterTab)}
          ariaLabel="Callcenter sections"
        />

        <KpiRow minWidth="180px">
          <KpiCard
            label="Open sessions"
            value={sessionsCount}
            detail="Active inbound calls"
            tone="ops"
          />
          <KpiCard
            label="Linked orders"
            value={fixtureSessions.filter((s) => s.linkedOrderId).length}
            detail="Calls already bound to owned orders"
            tone="info"
          />
          <KpiCard
            label="Recording pending"
            value={recordingGate}
            detail="Calls missing recording callback linkage"
            tone="warning"
          />
          <KpiCard
            label="Hotline transfers"
            value={fixtureSessions.filter((s) => s.linkedCaseNo).length}
            detail="Calls already converted into complaint cases"
            tone="warning"
          />
        </KpiRow>

        {activeTab === "sessions" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 1.4fr)",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <DataViewCard
              title="Sessions"
              subtitle={`${fixtureSessions.length} result(s)`}
              tone="ops"
              filters={
                <input
                  type="search"
                  style={inputStyle}
                  placeholder="Search session ID, caller, or agent"
                  defaultValue=""
                  readOnly
                />
              }
            >
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12.5px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={tableHeadCellStyle}>Call</th>
                      <th style={tableHeadCellStyle}>Type</th>
                      <th style={tableHeadCellStyle}>Caller</th>
                      <th style={tableHeadCellStyle}>Agent</th>
                      <th style={tableHeadCellStyle}>Status</th>
                      <th style={tableHeadCellStyle}>Recording</th>
                      <th style={tableHeadCellStyle}>Order</th>
                      <th style={tableHeadCellStyle}>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixtureSessions.map((session) => (
                      <tr key={session.callId}>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.callId}
                        </td>
                        <td style={tableBodyCellStyle}>{session.callType}</td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.callerPhone}
                        </td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.agentId}
                        </td>
                        <td style={tableBodyCellStyle}>
                          <StatusChip
                            label={session.statusLabel}
                            tone={
                              session.status === "active"
                                ? "success"
                                : "neutral"
                            }
                          />
                        </td>
                        <td style={tableBodyCellStyle}>
                          <StatusChip
                            label={session.recordingLabel}
                            tone={session.recordingTone}
                          />
                        </td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.linkedOrderId ?? "-"}
                        </td>
                        <td style={tableBodyCellStyle}>{session.started}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataViewCard>

            <DataViewCard
              title="Session detail"
              subtitle="call_2031 · phone_booking"
              tone="ops"
              actions={
                <>
                  <span style={buttonStyle}>Mark identity announced</span>
                  <span
                    style={{
                      ...buttonStyle,
                      border: "1px solid #b91c1c",
                      background: "#b91c1c",
                      color: "#ffffff",
                    }}
                  >
                    Close session
                  </span>
                </>
              }
            >
              <div
                style={{
                  border: "1px solid #dbe2ea",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  padding: "14px 16px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Caller / agent
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                      0912-555-401
                    </strong>
                    <span style={{ color: "#475569", fontSize: "12px" }}>
                      YL.linchen
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Recording
                    </span>
                    <StatusChip label="Ready" tone="success" />
                    <span style={{ color: "#475569", fontSize: "12px" }}>
                      rec_88914
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Last ETA reply
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                      12 min
                    </strong>
                    <span style={{ color: "#475569", fontSize: "12px" }}>
                      2026-05-08 14:55
                    </span>
                  </div>
                </div>
              </div>

              <CalloutBanner
                tone="info"
                title="Booking lane ready"
                description="Create one new phone booking or link one existing order, then continue dispatch or callback work from the same session."
              />
            </DataViewCard>
          </div>
        ) : null}

        {activeTab === "callbacks" ? (
          <DataViewCard
            title="Callback Tasks"
            subtitle={`${fixtureCallbacks.length} callback task(s)`}
            tone="warning"
            filters={
              <DataFilterBar
                value="all"
                filters={[
                  {
                    value: "all",
                    label: "All",
                    count: fixtureCallbacks.length,
                  },
                  {
                    value: "pending",
                    label: "Pending",
                    count: pendingCallbacks,
                    tone: "warning",
                  },
                  {
                    value: "overdue",
                    label: "Overdue",
                    count: 1,
                    tone: "danger",
                  },
                  {
                    value: "completed",
                    label: "Completed",
                    count: 1,
                    tone: "success",
                  },
                ]}
                ariaLabel="Callback queue filters"
              />
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12.5px",
                }}
              >
                <thead>
                  <tr>
                    <th style={tableHeadCellStyle}>Callback</th>
                    <th style={tableHeadCellStyle}>Call</th>
                    <th style={tableHeadCellStyle}>Status</th>
                    <th style={tableHeadCellStyle}>Due</th>
                    <th style={tableHeadCellStyle}>Order / Case</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtureCallbacks.map((callback) => (
                    <tr key={callback.id}>
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.id}
                      </td>
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.callId}
                      </td>
                      <td style={tableBodyCellStyle}>
                        <StatusChip
                          label={callback.statusLabel}
                          tone={callback.statusTone}
                        />
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "11.5px",
                            marginTop: "4px",
                          }}
                        >
                          {callback.summary}
                        </div>
                      </td>
                      <td style={tableBodyCellStyle}>
                        <div>{callback.due}</div>
                        <div style={{ color: "#64748b", fontSize: "11.5px" }}>
                          {callback.relative}
                        </div>
                      </td>
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.linkedOrderId ?? callback.linkedCaseNo ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataViewCard>
        ) : null}

        {activeTab === "recordings" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <DataViewCard
              title="Recording evidence"
              subtitle="Each call session must surface its recording state until the binary is callbacked into the workspace."
              tone="warning"
              filters={
                <DataFilterBar
                  value="all"
                  filters={[
                    {
                      value: "all",
                      label: "All",
                      count: fixtureSessions.length,
                    },
                    {
                      value: "ready",
                      label: "Ready",
                      count: 2,
                      tone: "success",
                    },
                    {
                      value: "pending",
                      label: "Pending",
                      count: 1,
                      tone: "warning",
                    },
                    {
                      value: "missing",
                      label: "Missing",
                      count: 1,
                      tone: "danger",
                    },
                  ]}
                  ariaLabel="Recording state filters"
                />
              }
            >
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12.5px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={tableHeadCellStyle}>Call</th>
                      <th style={tableHeadCellStyle}>State</th>
                      <th style={tableHeadCellStyle}>Recording ID</th>
                      <th style={tableHeadCellStyle}>Provider</th>
                      <th style={tableHeadCellStyle}>Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixtureSessions.map((session) => (
                      <tr key={session.callId}>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.callId}
                        </td>
                        <td style={tableBodyCellStyle}>
                          <StatusChip
                            label={session.recordingLabel}
                            tone={session.recordingTone}
                          />
                        </td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.recordingId ?? "-"}
                        </td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.providerRef ?? "-"}
                        </td>
                        <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                          {session.agentId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataViewCard>

            <DataViewCard
              title="Attach recording callback"
              subtitle="call_2032 · callback"
              tone="ops"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Recording ID"
                  readOnly
                />
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Provider recording ref"
                  readOnly
                />
                <input
                  style={inputStyle}
                  type="url"
                  placeholder="Recording URL"
                  readOnly
                />
                <span style={primaryButtonStyle}>Attach recording</span>
              </div>
            </DataViewCard>
          </div>
        ) : null}

        <DataViewCard
          title="Workspace stages"
          subtitle="Booking, callback, and complaint lanes share the same call session — keep recording evidence visible while every lane progresses."
          tone="ops"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <StageCard
              title="Booking lane"
              tone="info"
              state="Ready"
              note="Create one new phone booking or link one existing order, then continue dispatch or callback work from the same session."
            />
            <StageCard
              title="Callback lane"
              tone="warning"
              state="Callback queued"
              note="2026-05-08 17:30 · YL.linchen · 客戶要求 17:30 回撥確認上車地點"
            />
            <StageCard
              title="Complaint lane"
              tone="neutral"
              state="No session selected"
              note="Use complaint handoff when the outcome becomes remediation instead of transport fulfillment."
            />
          </div>
        </DataViewCard>
      </div>
    </ManagementShell>
  );
}

const meta = {
  title: "OpsCallcenter",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity target for the OC_Callcenter redesign. Use beside the design canvas artboard during OPS-UI-RD-005 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Built: Story = {
  render: () => (
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
            Ops Callcenter Parity Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            Built implementation and the `OC_Callcenter` artboard are rendered
            in the same Storybook view for manual side-by-side review.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
            gap: "16px",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
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
              <OpsCallcenterBuiltView />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle="`docs/05-ui/drts-design-canvas/Ops Console.html#callcenter`"
          >
            <iframe
              src={canvasCallcenterSrc}
              title="OC_Callcenter canvas reference"
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
  ),
};
