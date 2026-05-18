import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import {
  getPartnerBookingStateScreenMeta,
  partnerBookingStateScreens,
  PartnerBookingStateGate,
  type PartnerBookingStateScreenId,
} from "./partner-booking-funnel";

const ctbcBrand = BRAND_TEMPLATES.CTBC;
const demoBasePath = "/ctbc";

const meta = {
  title: "Partner Booking/Authority-safe Gates",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "PBK-UI-004 parity stories. These gates preserve the legacy `tenant-console-web/app/partner/*` authority semantics: only `eligible` can continue to booking, while `ineligible`, `manual_review`, `inactive`, and `eligibility_required` stay explicit hard stops.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function createStory(state: PartnerBookingStateScreenId): Story {
  const meta = getPartnerBookingStateScreenMeta(state);

  return {
    render: () => (
      <div
        style={{
          padding: "24px",
          background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        }}
      >
        <PartnerBookingStateGate
          brand={ctbcBrand}
          state={state}
          basePath={demoBasePath}
        />
      </div>
    ),
    name: meta.label,
    parameters: {
      docs: {
        description: {
          story: `${meta.title}. Route: \`${demoBasePath}/${meta.routeSegment}\`.`,
        },
      },
    },
  };
}

export const Eligible = createStory("eligible");
export const Ineligible = createStory("ineligible");
export const ManualReview = createStory("manual_review");
export const Inactive = createStory("inactive");
export const EligibilityRequired = createStory("eligibility_required");

export const AllGates: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gap: "24px",
        padding: "24px",
        background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
      }}
    >
      {partnerBookingStateScreens.map((state) => (
        <PartnerBookingStateGate
          key={state}
          brand={ctbcBrand}
          state={state}
          basePath={demoBasePath}
        />
      ))}
    </div>
  ),
  name: "All gates",
};
