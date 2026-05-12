import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowSplitLayout,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const actionStyle = (primary = false) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "34px",
  padding: "0 12px",
  borderRadius: "999px",
  border: primary ? "1px solid #0f766e" : "1px solid #cbd5e1",
  background: primary ? "#0f766e" : "#ffffff",
  color: primary ? "#ffffff" : "#0f172a",
  fontSize: "12.5px",
  fontWeight: 700,
});

const endpointRows = [
  {
    webhookId: "wh_tn_001",
    url: "https://ops.acme.example/hooks/drts",
    events: ["booking.created", "booking.assigned", "invoice.issued"],
    status: "active",
    secret: "v4 · whsec_••••84d2",
    runtime: "84 deliveries · last success 2026-05-10 17:28",
    retry: "5 attempts · 30s backoff · 410/429/500/503",
  },
  {
    webhookId: "wh_tn_002",
    url: "https://sandbox.acme.example/drts/webhooks",
    events: ["booking.cancelled", "report.completed"],
    status: "test_pending",
    secret: "v1 · whsec_••••11ab",
    runtime: "6 deliveries · last success pending",
    retry: "5 attempts · 30s backoff · 410/429/500/503",
  },
] as const;

const deliveryRows = [
  {
    deliveryId: "dlv_0091",
    webhookId: "wh_tn_001",
    eventType: "invoice.issued",
    status: "delivered",
    httpStatus: "202",
    attempt: "1",
    createdAt: "2026-05-10 17:28",
  },
  {
    deliveryId: "dlv_0090",
    webhookId: "wh_tn_001",
    eventType: "booking.assigned",
    status: "delivery_failed",
    httpStatus: "503",
    attempt: "3",
    createdAt: "2026-05-10 17:12",
  },
  {
    deliveryId: "dlv_0089",
    webhookId: "wh_tn_002",
    eventType: "report.completed",
    status: "queued",
    httpStatus: "pending",
    attempt: "1",
    createdAt: "2026-05-10 16:55",
  },
] as const;

function WebhooksBuiltView() {
  return (
    <TenantStoryShell currentPath="/webhooks" breadcrumb="Webhooks">
      <PageHeader
        eyebrow="Integrations"
        title="Webhooks"
        subtitle="Endpoint inventory, event coverage, and delivery evidence stay together on the formal tenant webhook surface."
        meta={[
          { label: "Endpoints", value: "2", tone: "tenant" },
          { label: "Active", value: "1", tone: "success" },
          { label: "Recent deliveries", value: "3" },
        ]}
        actions={
          <>
            <span style={actionStyle()}>Payload schema</span>
            <span style={actionStyle(true)}>Add endpoint</span>
          </>
        }
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="Endpoints"
          value="2"
          detail="Production plus sandbox receiver"
          tone="tenant"
        />
        <KpiCard
          label="Covered events"
          value="5 / 6"
          detail="1 baseline event still unsubscribed"
          tone="info"
        />
        <KpiCard
          label="Failures"
          value="1"
          detail="One recent `delivery_failed` row"
          tone="warning"
        />
        <KpiCard
          label="Rotations"
          value="5"
          detail="Secret rotations recorded across endpoints"
          tone="tenant"
        />
      </KpiRow>

      <CalloutBanner
        title="Mutation semantics stay backend-owned"
        description="The parity target shows endpoint and delivery posture without inventing replay or secret-mutation controls that are not already covered by contract."
        tone="warning"
        density="compact"
      />

      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Endpoint inventory"
            subtitle="The main pane mirrors the `TN_Webhooks` artboard with endpoint rows first and delivery evidence directly below."
            tone="tenant"
            density="compact"
            summary="URL, events, state, secret posture, and retry policy stay on the same row."
          >
            <DataTable
              density="compact"
              tone="tenant"
              columns={[
                { label: "Endpoint", width: "260px" },
                { label: "Events", width: "260px" },
                { label: "State", width: "120px" },
                { label: "Secret", width: "170px" },
                { label: "Runtime", width: "220px" },
                { label: "Retry", width: "220px" },
              ]}
            >
              {endpointRows.map((row) => (
                <Tr key={row.webhookId}>
                  <Td density="compact">
                    <DataCellStack
                      primary={<strong>{row.url}</strong>}
                      secondary={row.webhookId}
                    />
                  </Td>
                  <Td density="compact">
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {row.events.map((eventType) => (
                        <StatusChip
                          key={eventType}
                          tone="info"
                          label={eventType}
                        />
                      ))}
                    </div>
                  </Td>
                  <Td density="compact">
                    <StatusChip
                      tone={row.status === "active" ? "success" : "warning"}
                      label={row.status}
                    />
                  </Td>
                  <Td density="compact" mono>
                    {row.secret}
                  </Td>
                  <Td density="compact">{row.runtime}</Td>
                  <Td density="compact">{row.retry}</Td>
                </Tr>
              ))}
            </DataTable>

            <DataViewCard
              title="Recent deliveries"
              subtitle="Delivery logs remain adjacent rather than hidden behind a separate diagnostics route."
              tone="tenant"
              density="compact"
            >
              <DataTable
                density="compact"
                tone="tenant"
                columns={[
                  { label: "Delivery", width: "120px" },
                  { label: "Endpoint", width: "110px" },
                  { label: "Event", width: "180px" },
                  { label: "State", width: "130px" },
                  { label: "HTTP", width: "90px" },
                  { label: "Attempt", width: "90px" },
                  { label: "Created", width: "150px" },
                ]}
              >
                {deliveryRows.map((row) => (
                  <Tr key={row.deliveryId}>
                    <Td density="compact" mono>
                      {row.deliveryId}
                    </Td>
                    <Td density="compact" mono>
                      {row.webhookId}
                    </Td>
                    <Td density="compact" mono>
                      {row.eventType}
                    </Td>
                    <Td density="compact">
                      <StatusChip
                        tone={
                          row.status === "delivered"
                            ? "success"
                            : row.status === "delivery_failed"
                              ? "warning"
                              : "neutral"
                        }
                        label={row.status}
                      />
                    </Td>
                    <Td density="compact" mono>
                      {row.httpStatus}
                    </Td>
                    <Td density="compact" mono>
                      {row.attempt}
                    </Td>
                    <Td density="compact" mono>
                      {row.createdAt}
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </DataViewCard>
        }
        side={
          <>
            <DataViewCard
              title="Policy posture"
              subtitle="Retry and validation rules are inspectable but not editable here."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="170px"
                items={[
                  {
                    id: "test-event",
                    label: "Test event",
                    value: "tenant.webhook.test",
                  },
                  {
                    id: "auto-disable",
                    label: "Auto-disable",
                    value: "4 consecutive failures",
                  },
                  {
                    id: "retry",
                    label: "Retry policy",
                    value: "5 attempts · 30s → 8m",
                  },
                  {
                    id: "notify",
                    label: "Failure channel",
                    value: "ops_console",
                  },
                  {
                    id: "create",
                    label: "Create validation",
                    value: "required",
                  },
                  {
                    id: "rotate",
                    label: "Secret rotation",
                    value: "revalidation required",
                  },
                ]}
              />
            </DataViewCard>
            <DataViewCard
              title="Coverage"
              subtitle="Baseline events versus live subscriptions."
              tone="tenant"
              density="compact"
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <StatusChip tone="success" label="booking.created" />
                <StatusChip tone="success" label="booking.assigned" />
                <StatusChip tone="success" label="booking.cancelled" />
                <StatusChip tone="success" label="invoice.issued" />
                <StatusChip tone="success" label="report.completed" />
                <StatusChip tone="warning" label="tenant.notice.updated" />
              </div>
            </DataViewCard>
          </>
        }
      />
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Webhooks",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Webhooks` artboard. The Built panel mirrors the endpoint-plus-deliveries tenant webhook surface, while the Canvas panel embeds `Tenant Console.html#webhooks` for review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Webhooks: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Webhooks Parity Review"
      summary="Built implementation and the `TN_Webhooks` artboard are rendered together for manual side-by-side review."
      built={<WebhooksBuiltView />}
      anchor="webhooks"
    />
  ),
};
