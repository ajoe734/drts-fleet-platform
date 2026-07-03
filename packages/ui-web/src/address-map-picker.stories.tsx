import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card as CanvasCard, buildCanvasTheme } from "./canvas-primitives";
import { AddressMapPicker } from "./address-map-picker";
import {
  candidateToAddressPayload,
  createMockAddressProvider,
  type AddressPayload,
} from "./address-map-picker-core";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const selected: AddressPayload = candidateToAddressPayload(
  {
    candidateId: "mock-taipei-101",
    provider: "mock-geo",
    providerCandidateId: "place-101",
    placeId: "place-101",
    displayName: "Taipei 101",
    address: "No. 7, Section 5, Xinyi Road, Xinyi District, Taipei",
    location: { lat: 25.033964, lng: 121.564468 },
    confidence: "exact",
    accuracyM: 8,
  },
  { surface: "callcenter" },
) as AddressPayload;

const meta = {
  title: "Shared/Address Map Picker",
  component: AddressMapPicker,
  render: (args) => (
    <div style={{ padding: 24, background: theme.bg, maxWidth: 560 }}>
      <CanvasCard
        theme={theme}
        title="Address & location"
        subtitle="Search, pin, confidence, and service-area preview"
        padding={0}
      >
        <div style={{ padding: 16 }}>
          <AddressMapPicker {...args} />
        </div>
      </CanvasCard>
    </div>
  ),
} satisfies Meta<typeof AddressMapPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SearchAndPin: Story = {
  args: {
    theme,
    provider: createMockAddressProvider(),
    surface: "callcenter",
    serviceProductType: "taxi",
  },
};

export const SelectedServiceablePreview: Story = {
  args: {
    theme,
    provider: createMockAddressProvider(),
    surface: "callcenter",
    serviceProductType: "taxi",
    value: selected,
  },
};

export const ProviderOutageFallback: Story = {
  args: {
    theme,
    provider: createMockAddressProvider({ unavailable: true }),
    surface: "callcenter",
    providerHealth: { mode: "disabled", status: "unhealthy", failClosed: true },
  },
};

export const DegradedProvider: Story = {
  args: {
    theme,
    provider: createMockAddressProvider({ degraded: true }),
    surface: "callcenter",
    serviceProductType: "taxi",
    providerHealth: { mode: "external", status: "degraded" },
  },
};
