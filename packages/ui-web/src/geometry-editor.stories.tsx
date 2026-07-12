import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card as CanvasCard, buildCanvasTheme } from "./canvas-primitives";
import { GeometryEditor, type GeometryDraft } from "./geometry-editor";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const initialDraft: GeometryDraft = {
  kind: "polygon",
  points: [
    { lat: 25.033, lng: 121.5654 },
    { lat: 25.041, lng: 121.5784 },
    { lat: 25.026, lng: 121.5862 },
    { lat: 25.019, lng: 121.5535 },
  ],
};

const baselineDraft: GeometryDraft = {
  kind: "polygon",
  points: [
    { lat: 25.033, lng: 121.5654 },
    { lat: 25.039, lng: 121.5761 },
    { lat: 25.024, lng: 121.5831 },
    { lat: 25.02, lng: 121.5568 },
  ],
};

const meta = {
  title: "Platform Admin/Geometry Editor",
  component: GeometryEditor,
  render: (args) => (
    <div style={{ padding: 24, background: theme.bg }}>
      <CanvasCard
        theme={theme}
        title="Operating area / route editor"
        subtitle="PostGIS polygon / circle / route corridor with GeoJSON import/export"
        padding={0}
      >
        <div style={{ padding: 16 }}>
          <GeometryEditor {...args} />
        </div>
      </CanvasCard>
    </div>
  ),
} satisfies Meta<typeof GeometryEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    theme,
    initialDraft,
    baselineDraft,
  },
};
