import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementSidebar } from "./management-sidebar";
import type { ManagementSidebarSection } from "./management-sidebar";

const canvasSidebarSrc = "/drts-design-canvas/Platform%20Admin.html#home";

const sidebarSections: ManagementSidebarSection[] = [
  {
    key: "overview",
    title: "Overview",
    items: [
      { href: "/", label: "工作首頁" },
      {
        href: "/health",
        label: "Platform Health",
        badge: "2",
        badgeTone: "warning",
      },
    ],
  },
  {
    key: "tenant-flow",
    title: "Tenant Flow",
    items: [
      { href: "/tenants", label: "Tenants", badge: "14", badgeTone: "info" },
      {
        href: "/tenants/ctbc-world-elite",
        label: "Rollout detail",
        matchPaths: ["/tenants/ctbc-world-elite"],
      },
    ],
  },
  {
    key: "platform-layer",
    title: "Platform Layer",
    items: [
      { href: "/audit", label: "Audit & evidence" },
      {
        href: "/adapters",
        label: "Adapter registry",
        badge: "degraded",
        badgeTone: "danger",
      },
      {
        href: "/flags",
        label: "Feature flags",
        badge: "7",
        badgeTone: "neutral",
      },
    ],
  },
];

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "10px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <strong
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#0f172a",
          }}
        >
          {title}
        </strong>
        <span style={{ fontSize: "12.5px", color: "#475569", lineHeight: 1.5 }}>
          {subtitle}
        </span>
      </div>
      {children}
    </section>
  );
}

function BuiltSidebarView() {
  return (
    <div
      style={{
        minWidth: "720px",
        height: "900px",
        borderRadius: "22px",
        overflow: "hidden",
        border: "1px solid #cbd5e1",
        background: "#e2e8f0",
        display: "grid",
        gridTemplateColumns: "248px minmax(0, 1fr)",
      }}
    >
      <ManagementSidebar
        brand="DRTS"
        brandSub="Platform Admin"
        brandIcon={
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            PA
          </span>
        }
        sections={sidebarSections}
        currentPath="/tenants/ctbc-world-elite"
        footer={
          <div style={{ display: "grid", gap: "6px", lineHeight: 1.5 }}>
            <div>
              Grouped sections, per-item badges, and sticky shell navigation.
            </div>
            <div>Visual target for DSY-UI-003 sidebar adoption.</div>
          </div>
        }
        style={{
          width: "248px",
          minHeight: "900px",
          height: "900px",
          position: "relative",
        }}
      />
      <div
        style={{
          padding: "28px",
          background:
            "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)",
          display: "grid",
          alignContent: "start",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Context Panel
          </div>
          <h2 style={{ margin: 0, fontSize: "24px", color: "#0f172a" }}>
            Sidebar review surface
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "13.5px",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            The right pane is intentionally quiet so grouped hierarchy, active
            route treatment, and badge tones remain the focus.
          </p>
        </div>
        <div
          style={{
            borderRadius: "18px",
            border: "1px dashed #94a3b8",
            background: "rgba(255,255,255,0.72)",
            padding: "20px",
            color: "#475569",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          Match the sidebar’s section breaks, active-row emphasis, and badge
          balance against the Platform Admin home artboard.
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Management/Sidebar",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side Storybook review target for the DSY-UI-003 grouped management sidebar. The built shell slice is compared against the Platform Admin home artboard.",
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
            Management Sidebar Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            The built grouped sidebar is rendered beside the Platform Admin home
            canvas artboard for manual shell comparison.
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
            subtitle="Grouped navigation, active state, and badge treatment from `ManagementSidebar`."
          >
            <BuiltSidebarView />
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#home`"
          >
            <iframe
              src={canvasSidebarSrc}
              title="Management sidebar design reference"
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
