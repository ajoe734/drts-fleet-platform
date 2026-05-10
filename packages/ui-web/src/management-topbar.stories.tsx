import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementTopbar } from "./management-topbar";

const canvasTopbarSrc = "/drts-design-canvas/Platform%20Admin.html#home";

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

function BuiltTopbarView() {
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
        gridTemplateRows: "64px minmax(0, 1fr)",
      }}
    >
      <div
        style={{
          gridRow: "1 / 3",
          background: "#0f172a",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      />
      <ManagementTopbar
        breadcrumb={[{ label: "Platform Admin" }, { label: "工作首頁" }]}
        envLabel="production"
        envTone="success"
        user={{
          name: "Yun Lin",
          detail: "platform_admin",
          avatar: "YL",
        }}
        actions={
          <button
            type="button"
            style={{
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              padding: "8px 12px",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            Export
          </button>
        }
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
            Topbar review surface
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "13.5px",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            The shell frame keeps focus on breadcrumb rhythm, search field
            weight, environment chip, and user block spacing.
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
          Compare the built topbar against the Platform Admin home artboard for
          overall shell density and chrome hierarchy.
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Management/Topbar",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side Storybook review target for the DSY-UI-003 management topbar. The built shell slice is compared against the Platform Admin home artboard.",
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
            Management Topbar Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            The built topbar is rendered beside the Platform Admin home canvas
            artboard for manual shell comparison.
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
            subtitle="Breadcrumb, search, environment chip, actions, and user block from `ManagementTopbar`."
          >
            <BuiltTopbarView />
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#home`"
          >
            <iframe
              src={canvasTopbarSrc}
              title="Management topbar design reference"
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
