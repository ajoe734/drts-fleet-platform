import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const splitCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

function SettingsBuiltView() {
  return (
    <TenantStoryShell currentPath="/settings" breadcrumb="Settings">
      <PageHeader
        eyebrow="Tenant settings"
        title="Settings"
        subtitle="Billing contact, notification subscriptions, SLA thresholds, and capability posture are composed into one tenant-admin settings lane."
        meta={[
          { label: "Enabled flags", value: "4", tone: "tenant" },
          { label: "Channels", value: "2" },
          { label: "Checklist items", value: "6", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Enabled flags"
          value="4"
          detail="Current tenant feature posture"
          tone="tenant"
        />
        <KpiCard
          label="Notification routes"
          value="3"
          detail="Published tenant subscriptions"
          tone="info"
        />
        <KpiCard
          label="Webhook baseline"
          value="4"
          detail="Baseline events in governance package"
          tone="tenant"
        />
        <KpiCard
          label="SLA profile"
          value="10 / 15 / 90"
          detail="Wait / arrival / completion min"
          tone="success"
        />
      </KpiRow>
      <div style={splitCardGridStyle}>
        <DataViewCard
          title="General profile"
          subtitle="Artboard-aligned general settings card backed by published profile data."
          tone="tenant"
          density="compact"
          summary="Tenant code, billing profile, contact, and auth mode stay visible without inventing unpublished fields."
          footer="The built view replaces artboard-only locale/timezone controls with contract-safe identity and billing fields."
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              { id: "tenant", label: "Tenant code", value: "tenant-demo-001" },
              { id: "realm", label: "Realm", value: "tenant" },
              {
                id: "invoice-title",
                label: "Invoice title",
                value: "Acme Enterprise Mobility",
              },
              { id: "tax-id", label: "Tax ID", value: "12345678" },
              { id: "contact", label: "Billing contact", value: "林怡安" },
              {
                id: "email",
                label: "Billing email",
                value: "billing@acme.example",
              },
              {
                id: "address",
                label: "Billing address",
                value: "台北市信義區市府路 1 號",
                columnSpan: 2,
              },
              { id: "auth", label: "Auth mode", value: "tenant_session" },
            ]}
          />
        </DataViewCard>
        <DataViewCard
          title="Current posture"
          subtitle="Capability and control summary matching the second artboard card."
          tone="tenant"
          density="compact"
          summary="Baseline integrations, notification policy, SLA thresholds, and API-key/webhook governance stay together."
          footer="This screen stays read-only; mutation remains tied to explicit billing, SLA, and integration commands."
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              { id: "flags", label: "Enabled modules", value: "4 flags" },
              { id: "webhooks", label: "Webhook baseline", value: "4 events" },
              {
                id: "notify",
                label: "Notification baseline",
                value: "3 routes",
              },
              { id: "sla", label: "SLA profile", value: "10/15/90 min" },
              { id: "key", label: "API key lifetime", value: "60 days" },
              { id: "retry", label: "Webhook retry", value: "5 attempts" },
            ]}
          />
        </DataViewCard>
      </div>
      <DataViewCard
        title="Subscriptions and capability posture"
        subtitle="The lower settings section keeps notifications and capability cues visible in one scan."
        tone="tenant"
        density="compact"
        summary="3 subscriptions and 4 enabled flags visible in the current snapshot."
        footer="Checklist items stay as operational guidance, not as synthetic tenant-state fields."
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip
              tone="tenant"
              label="reservation.failed · ops_console"
            />
            <StatusChip
              tone="tenant"
              label="tenant.sla.threshold_breached · webhook"
            />
            <StatusChip
              tone="info"
              label="tenant.webhook.delivery_failed · ops_console"
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip tone="tenant" label="billing_exports" />
            <StatusChip tone="tenant" label="tenant_webhooks" />
            <StatusChip tone="info" label="report_artifacts" />
            <StatusChip tone="neutral" label="audit_read" />
          </div>
          <CalloutBanner
            title="Checklist items still frame integration readiness"
            description="Confirm owner, issue scoped sandbox credentials, validate webhook delivery, and document rotation procedures before cutover."
            tone="warning"
            density="compact"
          />
        </div>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Settings",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Settings` artboard. The Built panel mirrors the composed tenant settings screen, while the Canvas panel embeds `Tenant Console.html#settings` for review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Settings: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Settings Parity Review"
      summary="Built implementation and the `TN_Settings` artboard are rendered together for manual side-by-side review."
      built={<SettingsBuiltView />}
      anchor="settings"
    />
  ),
};
