import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { BRAND_TEMPLATES, type PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  getPartnerBookingArtboardAnchor,
  getPartnerBookingScenarioMeta,
  getPartnerBookingScenarioScreen,
  getPartnerBookingScreenMeta,
  PartnerBookingPhoneScreen,
  type PartnerBookingScenarioId,
  type PartnerBookingScreenId,
} from "./partner-booking-funnel";

const canvasBaseSrc = "/drts-design-canvas/Partner%20Booking.html";
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
  scenario,
}: {
  brand: PartnerBrandTemplate;
  screen: PartnerBookingScreenId;
  scenario?: PartnerBookingScenarioId;
}) {
  const resolvedScreen = scenario
    ? getPartnerBookingScenarioScreen(scenario)
    : screen;
  const anchor = getPartnerBookingArtboardAnchor(resolvedScreen);
  const meta = getPartnerBookingScreenMeta(resolvedScreen);
  const scenarioMeta = scenario
    ? getPartnerBookingScenarioMeta(scenario)
    : null;

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
          {scenarioMeta ? (
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: ctbcBrand.primary,
              }}
            >
              route: {scenarioMeta.id}
            </div>
          ) : null}
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {scenarioMeta
              ? `${scenarioMeta.summary} Reuses the ${meta.eyebrow} artboard.`
              : meta.summary}
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
              <PartnerBookingPhoneScreen
                brand={brand}
                screen={resolvedScreen}
                {...(scenario ? { scenario } : {})}
              />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle={
              scenarioMeta
                ? `Route \`/${ctbcBrand.tenantCode.toLowerCase()}/${scenarioMeta.id}\` reuses \`docs/05-ui/drts-design-canvas/Partner Booking.html#${anchor}\``
                : `\`docs/05-ui/drts-design-canvas/Partner Booking.html#${anchor}\``
            }
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
          "PBK-UI-003 and PBK-UI-004 parity stories. Funnel screens and authority-safe scenario routes compare the built CTBC white-label surface against the matching `Partner Booking.html` artboard anchors.",
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

function createScenarioStory(scenario: PartnerBookingScenarioId): Story {
  const meta = getPartnerBookingScenarioMeta(scenario);
  const screen = getPartnerBookingScenarioScreen(scenario);

  return {
    render: () => (
      <PartnerBookingStoryChrome
        brand={ctbcBrand}
        screen={screen}
        scenario={scenario}
      />
    ),
    name: `${meta.id} route`,
  };
}

export const Landing = createStory("landing");
export const Eligibility = createStory("eligibility");
export const Book = createStory("book");
export const Confirmed = createStory("confirmed");
export const Trips = createStory("trips");
export const Receipt = createStory("receipt");
export const Help = createStory("help");
export const EligibleRoute = createScenarioStory("eligible");
export const IneligibleRoute = createScenarioStory("ineligible");
export const ManualReviewRoute = createScenarioStory("manual_review");
export const InactiveRoute = createScenarioStory("inactive");
export const EligibilityRequiredRoute = createScenarioStory(
  "eligibility-required",
);
