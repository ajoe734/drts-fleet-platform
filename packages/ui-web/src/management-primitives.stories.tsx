import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  AuthorityBadge,
  AuthorityBanner,
  PlatformBadge,
  SectionHeader,
  StatusChip,
} from "./management-primitives";

const canvasPrimitivesSrc =
  "/drts-design-canvas/Ops%20Console.html#dispatch-forwarded";

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
    <section
      style={{
        display: "grid",
        gap: "10px",
        alignContent: "start",
      }}
    >
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

function BuiltPrimitivesView() {
  return (
    <div
      style={{
        minWidth: "720px",
        padding: "24px",
        borderRadius: "22px",
        border: "1px solid #cbd5e1",
        background:
          "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)",
        display: "grid",
        gap: "20px",
      }}
    >
      <SectionHeader
        eyebrow="Authority + Status"
        title="Management primitives parity target"
        subtitle="Authority chips, platform badges, lifecycle status, and callout banners exposed by `@drts/ui-web`."
      />

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
          Authority badges
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <AuthorityBadge authority="owned" locale="zhTW" />
          <AuthorityBadge
            authority="forwarded"
            category="mirror"
            status="received"
            locale="zhTW"
          />
          <AuthorityBadge
            authority="forwarded"
            category="sync"
            status="confirmed"
            locale="zhTW"
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
          Platform badges
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <PlatformBadge surface="platform" locale="zhTW" />
          <PlatformBadge surface="ops" locale="zhTW" />
          <PlatformBadge surface="tenant" locale="zhTW" />
          <PlatformBadge surface="partner" locale="zhTW" />
        </div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
          Forwarded lifecycle tones
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <StatusChip authority="forwarded" status="received" locale="zhTW" />
          <StatusChip
            authority="forwarded"
            status="broadcasted"
            locale="zhTW"
          />
          <StatusChip
            authority="forwarded"
            status="accept_pending"
            locale="zhTW"
          />
          <StatusChip authority="forwarded" status="confirmed" locale="zhTW" />
          <StatusChip
            authority="forwarded"
            status="sync_failed"
            locale="zhTW"
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
          Authority banners
        </div>
        <AuthorityBanner
          authority="owned"
          title="Owned dispatch flow"
          description="The DRTS operator remains the write authority for queue sequencing, candidate ranking, and manual override decisions."
          meta={<PlatformBadge surface="ops" locale="zhTW" />}
        />
        <AuthorityBanner
          authority="forwarded"
          status="broadcasted"
          title="Forwarded mirror flow"
          description="The partner platform remains lifecycle authority while DRTS tracks sync posture, escalation, and reconciliation evidence."
          meta={<PlatformBadge surface="partner" locale="zhTW" />}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Management/Primitives",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side Storybook review target for DSY-UI-002 authority and status primitives. The built primitives are shown beside the Ops Console forwarded dispatch artboard for manual parity review.",
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
            Management Primitives Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            Built authority and status primitives are rendered beside the canvas
            artboard that exercises forwarded dispatch posture.
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
            subtitle="`@drts/ui-web` DSY-UI-002 primitives composed as a focused review surface."
          >
            <BuiltPrimitivesView />
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle="`docs/05-ui/drts-design-canvas/Ops Console.html#dispatch-forwarded`"
          >
            <iframe
              src={canvasPrimitivesSrc}
              title="Management primitives design reference"
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
