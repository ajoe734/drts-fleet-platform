import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import { PageHeader } from "./page-header";
import { StatCard } from "./stat-card";
import { useTheme } from "./management-theme-context";

const meta = {
  title: "Foundation/Smoke",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function SmokeScene() {
  const { density, mode } = useTheme();

  return (
    <ManagementShell>
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <PageHeader
          eyebrow="Storybook"
          title="UI package smoke scene"
          subtitle="Provides a stable target for Storybook startup and static build verification."
          meta={[
            { label: "Package", value: "@drts/ui-web" },
            { label: "Mode", value: mode === "dark" ? "Dark" : "Light" },
            { label: "Density", value: density },
          ]}
          density={density}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <StatCard
            label="Stories ready"
            value="1"
            sub="Wave 1 smoke coverage"
            accent="#0f766e"
          />
          <StatCard
            label="Builder"
            value="Vite"
            sub="Next.js-compatible framework"
            accent="#1d4ed8"
          />
        </div>
      </div>
    </ManagementShell>
  );
}

export const DashboardSlice: Story = {
  render: () => <SmokeScene />,
};
