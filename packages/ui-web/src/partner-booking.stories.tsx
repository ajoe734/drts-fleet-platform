import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { BRAND_TEMPLATES, type PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  getPartnerBookingArtboardAnchor,
  getPartnerBookingScreenMeta,
  PartnerBookingPhoneScreen,
  type PartnerBookingScreenId,
} from "./partner-booking-funnel";

const canvasBaseSrc = "/drts-design-canvas/Partner%20Booking%20Artboard.html";
const ctbcBrand = BRAND_TEMPLATES.CTBC;

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

function PartnerBookingStoryChrome({
  brand,
  screen,
}: {
  brand: PartnerBrandTemplate;
  screen: PartnerBookingScreenId;
}) {
  const anchor = getPartnerBookingArtboardAnchor(screen);
  const meta = getPartnerBookingScreenMeta(screen);

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
            {meta.eyebrow}
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {meta.summary}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(420px, 1fr))",
            gap: "16px",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
          <ComparisonFrame
            title="Built"
            subtitle="Shared white-label component rendered with the CTBC brand token set."
          >
            <div
              style={{
                minWidth: "420px",
                minHeight: "920px",
                display: "grid",
                placeItems: "center",
                borderRadius: "24px",
                border: "1px solid #cbd5e1",
                background:
                  "radial-gradient(circle at top, rgba(255,255,255,0.95), rgba(226,232,240,0.85))",
                padding: "24px",
              }}
            >
              <PartnerBookingPhoneScreen brand={brand} screen={screen} />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle={`\`docs/05-ui/drts-design-canvas/Partner Booking Artboard.html#${anchor}\``}
          >
            <iframe
              src={`${canvasBaseSrc}#${anchor}`}
              title={`${anchor} canvas reference`}
              style={{
                width: "100%",
                minWidth: "420px",
                height: "920px",
                border: "1px solid #cbd5e1",
                borderRadius: "24px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Partner Booking/CTBC Funnel",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "PBK-UI-003 parity stories. Each story compares the built white-label CTBC funnel screen against the matching `Partner Booking Artboard.html#<screen>` reference artboard (per-screen host that lands directly on the requested PB_* component).",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function createStory(screen: PartnerBookingScreenId): Story {
  return {
    render: () => (
      <PartnerBookingStoryChrome brand={ctbcBrand} screen={screen} />
    ),
    name: getPartnerBookingScreenMeta(screen).label,
  };
}

export const Landing = createStory("landing");
export const Eligibility = createStory("eligibility");
export const Book = createStory("book");
export const Confirmed = createStory("confirmed");
export const Trips = createStory("trips");
export const Receipt = createStory("receipt");
export const Help = createStory("help");
