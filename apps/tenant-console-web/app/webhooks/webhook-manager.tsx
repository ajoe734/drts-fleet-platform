"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  TenantIntegrationGovernancePackage,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  WebhookDeliveryRecord,
  WebhookRetryPolicyRecord,
} from "@drts/contracts";
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
  WorkflowEmptyState,
  WorkflowSplitLayout,
  managementPageStackStyle,
} from "@drts/ui-web";
import { formatCount, formatDateTime } from "@/lib/formatters";
import type { WebhookFlashPayload } from "./constants";
import {
  createTenantWebhookAction,
  deleteTenantWebhookAction,
  rotateTenantWebhookSecretAction,
  sendTenantWebhookTestAction,
  updateTenantWebhookAction,
} from "./actions";

type DeliveryGroup = {
  webhook: TenantWebhookEndpoint;
  deliveries: WebhookDeliveryRecord[];
};

type WebhookManagerProps = {
  webhooks: TenantWebhookEndpoint[];
  governance: TenantIntegrationGovernancePackage | null;
  deliveries: DeliveryGroup[];
  errors: string[];
};

const pageStackStyle = {
  ...managementPageStackStyle(),
  maxWidth: "1180px",
  margin: "0 auto",
};

const pillButtonStyle = (primary = false) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: "999px",
  border: primary ? "1px solid transparent" : "1px solid #99f6e4",
  background: primary ? "#0f766e" : "#f0fdfa",
  color: primary ? "#ffffff" : "#115e59",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
});

const formGridStyle = {
  display: "grid",
  gap: "14px",
};

const fieldGridStyle = {
  display: "grid",
  gap: "6px",
};

const fieldLabelStyle = {
  fontSize: "11.5px",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const inputStyle = {
  width: "100%",
  minHeight: "42px",
  borderRadius: "14px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "10px 12px",
  fontSize: "13px",
};

const hintStyle = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

const checkboxGridStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
};

const checkboxStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 10px",
  borderRadius: "12px",
  border: "1px solid #dbe5ef",
  background: "#ffffff",
  fontSize: "12.5px",
  color: "#0f172a",
};

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "10px",
};

function actionButtonLabel(pending: boolean, idle: string, active: string) {
  return pending ? active : idle;
}

function getStatusTone(status: TenantWebhookEndpointStatus) {
  switch (status) {
    case "active":
      return "success" as const;
    case "test_pending":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function getDeliveryTone(status: WebhookDeliveryRecord["status"]) {
  switch (status) {
    case "delivered":
      return "success" as const;
    case "delivery_failed":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function formatRetryPolicy(
  policy: WebhookRetryPolicyRecord | null | undefined,
): string {
  if (!policy) {
    return "Unavailable";
  }

  return `${policy.maxAttempts} attempts · ${policy.initialBackoffSeconds}s backoff · x${policy.backoffMultiplier}`;
}

function collectRecentDeliveries(deliveries: DeliveryGroup[]) {
  return deliveries
    .flatMap((group) =>
      group.deliveries.map((delivery) => ({
        delivery,
        webhook: group.webhook,
      })),
    )
    .sort((left, right) =>
      right.delivery.createdAt.localeCompare(left.delivery.createdAt),
    );
}

function renderUnknown(value: string | number | null | undefined) {
  return value ?? "Unknown";
}

function renderBooleanState(
  value: boolean | null | undefined,
  whenTrue: string,
  whenFalse: string,
) {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  return value ? whenTrue : whenFalse;
}

function uniqueEvents(items: string[]) {
  return [...new Set(items)];
}

function EventChecklist({
  events,
  selectedEvents,
}: {
  events: string[];
  selectedEvents: string[];
}) {
  if (events.length === 0) {
    return (
      <div style={hintStyle}>
        Governance did not return a baseline event catalog. Enter event names in
        the custom event field instead of assuming zero published events.
      </div>
    );
  }

  return (
    <div style={checkboxGridStyle}>
      {events.map((eventType) => (
        <label key={eventType} style={checkboxStyle}>
          <input
            defaultChecked={selectedEvents.includes(eventType)}
            name="events"
            type="checkbox"
            value={eventType}
          />
          <span>{eventType}</span>
        </label>
      ))}
    </div>
  );
}

export function WebhookManager({
  webhooks,
  governance,
  deliveries,
  errors,
}: WebhookManagerProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<WebhookFlashPayload | null>(null);
  const [selectedWebhookId, setSelectedWebhookId] = useState(
    webhooks[0]?.webhookId ?? "",
  );
  const [pending, startTransition] = useTransition();

  const sortedWebhooks = [...webhooks].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const activeWebhookId = sortedWebhooks.some(
    (webhook) => webhook.webhookId === selectedWebhookId,
  )
    ? selectedWebhookId
    : (sortedWebhooks[0]?.webhookId ?? "");
  const selectedWebhook =
    sortedWebhooks.find((webhook) => webhook.webhookId === activeWebhookId) ??
    null;

  const baselineEvents = governance?.baselineWebhookEvents ?? [];
  const selectedEventCatalog = uniqueEvents([
    ...baselineEvents,
    ...(selectedWebhook?.events ?? []),
  ]);
  const selectedExtraEvents = (selectedWebhook?.events ?? [])
    .filter((eventType) => !baselineEvents.includes(eventType))
    .join(", ");
  const recentDeliveries = collectRecentDeliveries(deliveries).slice(0, 20);
  const failedDeliveries = recentDeliveries.filter(
    ({ delivery }) => delivery.status === "delivery_failed",
  ).length;
  const activeEndpoints = sortedWebhooks.filter(
    (webhook) => webhook.status === "active",
  ).length;
  const subscribedEvents = new Set(
    sortedWebhooks.flatMap((webhook) => webhook.events),
  );
  const uncoveredEvents = governance
    ? baselineEvents.filter((eventType) => !subscribedEvents.has(eventType))
    : null;
  const rotationCount = sortedWebhooks.reduce(
    (sum, webhook) =>
      sum + (webhook.runtimeMetadata?.secretRotation.rotationCount ?? 0),
    0,
  );

  function runAction(
    action: (formData: FormData) => Promise<WebhookFlashPayload>,
    formData: FormData,
    options?: {
      resetForm?: HTMLFormElement | null;
    },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);

      if (result.tone === "default") {
        options?.resetForm?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow="Integrations"
        title="Webhooks"
        subtitle="Endpoint inventory, governance posture, and delivery evidence stay on one runtime surface, with contract-backed endpoint management wired directly into the tenant shell."
        meta={[
          {
            label: "Endpoints",
            value: formatCount(sortedWebhooks.length),
            tone: "tenant",
          },
          {
            label: "Active",
            value: formatCount(activeEndpoints),
            tone: "success",
          },
          {
            label: "Recent deliveries",
            value: formatCount(recentDeliveries.length),
          },
        ]}
        actions={
          <>
            <a href="#webhook-manage" style={pillButtonStyle()}>
              Manage endpoint
            </a>
            <a href="#webhook-create" style={pillButtonStyle(true)}>
              Add endpoint
            </a>
          </>
        }
      />

      {flash ? (
        <CalloutBanner
          title={flash.title}
          description={flash.description}
          tone={flash.tone === "default" ? "success" : "warning"}
        />
      ) : null}

      {errors.length > 0 ? (
        <CalloutBanner
          title="Webhook data loaded partially"
          description="One or more webhook reads failed. Unknown governance values remain explicitly unknown below; the UI does not silently turn transport gaps into false negatives."
          tone="warning"
        >
          <ul style={{ margin: 0, paddingInlineStart: "18px" }}>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutBanner>
      ) : null}

      <KpiRow minWidth="180px">
        <KpiCard
          label="Endpoints"
          value={formatCount(sortedWebhooks.length)}
          detail="Published tenant webhook endpoints currently visible"
          tone="tenant"
        />
        <KpiCard
          label="Covered events"
          value={
            governance
              ? `${formatCount(subscribedEvents.size)} / ${formatCount(baselineEvents.length)}`
              : "Unavailable"
          }
          detail={
            governance
              ? `${formatCount(uncoveredEvents?.length ?? 0)} baseline events still uncovered`
              : "Governance package did not load"
          }
          tone={governance ? "info" : "warning"}
        />
        <KpiCard
          label="Failures"
          value={formatCount(failedDeliveries)}
          detail="Recent rows currently marked delivery_failed"
          tone="warning"
        />
        <KpiCard
          label="Rotations"
          value={formatCount(rotationCount)}
          detail="Secret rotations recorded across endpoint runtime metadata"
          tone="tenant"
        />
      </KpiRow>

      <WorkflowSplitLayout
        ariaLabel="Webhook management layout"
        main={
          <>
            <DataViewCard
              title="Endpoint inventory"
              subtitle="URL, event subscriptions, state, secret posture, runtime health, and mutation entry points stay in one table."
              tone="tenant"
              density="compact"
              summary="The shell exposes create, update, delete, send-test, and rotate-secret flows only where backend command paths already exist."
            >
              {sortedWebhooks.length === 0 ? (
                <WorkflowEmptyState
                  title="No webhook endpoints returned"
                  description="Create the first endpoint to begin receiving tenant events, or treat this as a transport issue if the backend should already have inventory."
                  tone="tenant"
                  actions={
                    <a href="#webhook-create" style={pillButtonStyle(true)}>
                      Add endpoint
                    </a>
                  }
                />
              ) : (
                <DataTable
                  density="compact"
                  tone="tenant"
                  minWidth={1100}
                  columns={[
                    { label: "Endpoint", width: "250px" },
                    { label: "Events", width: "250px" },
                    { label: "State", width: "120px" },
                    { label: "Secret", width: "180px" },
                    { label: "Runtime", width: "220px" },
                    { label: "Actions", width: "180px" },
                  ]}
                >
                  {sortedWebhooks.map((webhook) => {
                    const runtime = webhook.runtimeMetadata;
                    return (
                      <Tr key={webhook.webhookId}>
                        <Td density="compact">
                          <DataCellStack
                            primary={<strong>{webhook.url}</strong>}
                            secondary={webhook.webhookId}
                            tertiary={`Updated ${formatDateTime(webhook.updatedAt)}`}
                          />
                        </Td>
                        <Td density="compact">
                          <div style={checkboxGridStyle}>
                            {webhook.events.map((eventType) => (
                              <StatusChip
                                key={eventType}
                                label={eventType}
                                tone="info"
                              />
                            ))}
                          </div>
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={
                              <StatusChip
                                label={webhook.status}
                                tone={getStatusTone(webhook.status)}
                              />
                            }
                            secondary={
                              runtime?.disableReason
                                ? `Disable reason: ${runtime.disableReason}`
                                : undefined
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={
                              <span>
                                v{webhook.secretVersion} ·{" "}
                                {webhook.secretPreview}
                              </span>
                            }
                            secondary={
                              runtime?.secretRotation.rotatedAt
                                ? `Rotated ${formatDateTime(runtime.secretRotation.rotatedAt)}`
                                : `Created ${formatDateTime(webhook.createdAt)}`
                            }
                            tertiary={`Rotations ${formatCount(
                              runtime?.secretRotation.rotationCount ??
                                webhook.secretHistory?.length ??
                                0,
                            )}`}
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={`${formatCount(
                              runtime?.deliveryCount ?? 0,
                            )} deliveries`}
                            secondary={`Last success ${runtime?.lastDeliveredAt ? formatDateTime(runtime.lastDeliveredAt) : "Not available"}`}
                            tertiary={`Next attempt ${runtime?.nextAttemptAt ? formatDateTime(runtime.nextAttemptAt) : "None queued"}`}
                          />
                        </Td>
                        <Td density="compact">
                          <div style={{ ...actionRowStyle, gap: "8px" }}>
                            <button
                              onClick={() => {
                                setSelectedWebhookId(webhook.webhookId);
                                window.location.hash = "webhook-manage";
                              }}
                              style={pillButtonStyle(
                                webhook.webhookId === activeWebhookId,
                              )}
                              type="button"
                            >
                              Manage
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </DataTable>
              )}
            </DataViewCard>

            <DataViewCard
              title="Recent deliveries"
              subtitle="Delivery evidence remains adjacent rather than hidden behind a separate diagnostics route."
              tone="tenant"
              density="compact"
            >
              {recentDeliveries.length === 0 ? (
                <WorkflowEmptyState
                  title="No delivery rows returned"
                  description="Endpoint inventory can still be managed while delivery history is empty or temporarily unavailable."
                  tone="neutral"
                />
              ) : (
                <DataTable
                  density="compact"
                  tone="tenant"
                  minWidth={900}
                  columns={[
                    { label: "Delivery", width: "145px" },
                    { label: "Endpoint", width: "150px" },
                    { label: "Event", width: "180px" },
                    { label: "State", width: "130px" },
                    { label: "HTTP", width: "90px" },
                    { label: "Attempt", width: "80px" },
                    { label: "Created", width: "160px" },
                  ]}
                >
                  {recentDeliveries.map(({ delivery, webhook }) => (
                    <Tr key={delivery.deliveryId}>
                      <Td density="compact" mono>
                        {delivery.deliveryId}
                      </Td>
                      <Td density="compact">
                        <DataCellStack
                          primary={webhook.url}
                          secondary={webhook.webhookId}
                        />
                      </Td>
                      <Td density="compact" mono>
                        {delivery.eventType}
                      </Td>
                      <Td density="compact">
                        <StatusChip
                          label={delivery.status}
                          tone={getDeliveryTone(delivery.status)}
                        />
                      </Td>
                      <Td density="compact" mono>
                        {delivery.httpStatus ?? "pending"}
                      </Td>
                      <Td density="compact" mono>
                        {delivery.attempt}
                      </Td>
                      <Td density="compact">
                        {formatDateTime(delivery.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
              )}
            </DataViewCard>
          </>
        }
        side={
          <>
            <div id="webhook-create">
              <DataViewCard
                title="Add endpoint"
                subtitle="Create a tenant webhook endpoint using the published command path."
                tone="tenant"
                density="compact"
                summary="New endpoints remain in test_pending until backend validation evidence lands."
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFlash(null);
                    runAction(
                      createTenantWebhookAction,
                      new FormData(event.currentTarget),
                      { resetForm: event.currentTarget },
                    );
                  }}
                  style={formGridStyle}
                >
                  <label style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>Webhook URL</span>
                    <input
                      name="url"
                      placeholder="https://ops.example.com/drts/webhooks"
                      required
                      style={inputStyle}
                      type="url"
                    />
                  </label>
                  <label style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>Secret</span>
                    <input
                      name="secret"
                      placeholder="whsec_..."
                      required
                      style={inputStyle}
                      type="text"
                    />
                  </label>
                  <div style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>Published events</span>
                    <EventChecklist
                      events={baselineEvents}
                      selectedEvents={[]}
                    />
                  </div>
                  <label style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>Additional events</span>
                    <input
                      name="extraEvents"
                      placeholder="tenant.webhook.test, custom.domain.event"
                      style={inputStyle}
                      type="text"
                    />
                    <span style={hintStyle}>
                      Use comma-separated custom event names only when the
                      backend has already published them.
                    </span>
                  </label>
                  <div style={actionRowStyle}>
                    <button style={pillButtonStyle(true)} type="submit">
                      {actionButtonLabel(
                        pending,
                        "Create endpoint",
                        "Creating...",
                      )}
                    </button>
                  </div>
                </form>
              </DataViewCard>
            </div>

            <div id="webhook-manage">
              <DataViewCard
                title="Manage selected endpoint"
                subtitle="Update endpoint metadata, run a validation event, rotate the secret, or remove the endpoint."
                tone="tenant"
                density="compact"
                summary="All controls below remain bounded to existing backend authority; retry and replay are still intentionally absent."
              >
                {selectedWebhook ? (
                  <>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>Selected endpoint</span>
                      <select
                        onChange={(event) =>
                          setSelectedWebhookId(event.currentTarget.value)
                        }
                        style={inputStyle}
                        value={activeWebhookId}
                      >
                        {sortedWebhooks.map((webhook) => (
                          <option
                            key={webhook.webhookId}
                            value={webhook.webhookId}
                          >
                            {webhook.url}
                          </option>
                        ))}
                      </select>
                    </label>

                    <form
                      key={selectedWebhook.webhookId}
                      onSubmit={(event) => {
                        event.preventDefault();
                        setFlash(null);
                        runAction(
                          updateTenantWebhookAction,
                          new FormData(event.currentTarget),
                        );
                      }}
                      style={formGridStyle}
                    >
                      <input
                        name="webhookId"
                        type="hidden"
                        value={selectedWebhook.webhookId}
                      />
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>Webhook URL</span>
                        <input
                          defaultValue={selectedWebhook.url}
                          name="url"
                          required
                          style={inputStyle}
                          type="url"
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>Status</span>
                        <select
                          defaultValue={selectedWebhook.status}
                          name="status"
                          style={inputStyle}
                        >
                          <option value="active">active</option>
                          <option value="test_pending">test_pending</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </label>
                      <div style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>Published events</span>
                        <EventChecklist
                          events={selectedEventCatalog}
                          selectedEvents={selectedWebhook.events}
                        />
                      </div>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>Additional events</span>
                        <input
                          defaultValue={selectedExtraEvents}
                          name="extraEvents"
                          placeholder="Comma-separated custom events"
                          style={inputStyle}
                          type="text"
                        />
                      </label>
                      <div style={actionRowStyle}>
                        <button style={pillButtonStyle(true)} type="submit">
                          {actionButtonLabel(
                            pending,
                            "Save endpoint",
                            "Saving...",
                          )}
                        </button>
                      </div>
                    </form>

                    <div style={formGridStyle}>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          setFlash(null);
                          runAction(
                            sendTenantWebhookTestAction,
                            new FormData(event.currentTarget),
                          );
                        }}
                        style={formGridStyle}
                      >
                        <input
                          name="webhookId"
                          type="hidden"
                          value={selectedWebhook.webhookId}
                        />
                        <input
                          name="webhookUrl"
                          type="hidden"
                          value={selectedWebhook.url}
                        />
                        <div style={actionRowStyle}>
                          <button style={pillButtonStyle()} type="submit">
                            {actionButtonLabel(
                              pending,
                              "Send test event",
                              "Sending...",
                            )}
                          </button>
                        </div>
                      </form>

                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          setFlash(null);
                          runAction(
                            rotateTenantWebhookSecretAction,
                            new FormData(event.currentTarget),
                            { resetForm: event.currentTarget },
                          );
                        }}
                        style={formGridStyle}
                      >
                        <input
                          name="webhookId"
                          type="hidden"
                          value={selectedWebhook.webhookId}
                        />
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>Rotate secret</span>
                          <input
                            name="secret"
                            placeholder="new_whsec_..."
                            required
                            style={inputStyle}
                            type="text"
                          />
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>Rotation reason</span>
                          <input
                            name="rotationReason"
                            placeholder="Routine rotation before go-live"
                            style={inputStyle}
                            type="text"
                          />
                        </label>
                        <div style={actionRowStyle}>
                          <button style={pillButtonStyle()} type="submit">
                            {actionButtonLabel(
                              pending,
                              "Rotate secret",
                              "Rotating...",
                            )}
                          </button>
                        </div>
                      </form>

                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (
                            !window.confirm(
                              `Delete webhook endpoint "${selectedWebhook.url}"?`,
                            )
                          ) {
                            return;
                          }
                          setFlash(null);
                          runAction(
                            deleteTenantWebhookAction,
                            new FormData(event.currentTarget),
                          );
                        }}
                        style={formGridStyle}
                      >
                        <input
                          name="webhookId"
                          type="hidden"
                          value={selectedWebhook.webhookId}
                        />
                        <input
                          name="webhookUrl"
                          type="hidden"
                          value={selectedWebhook.url}
                        />
                        <div style={actionRowStyle}>
                          <button
                            style={{
                              ...pillButtonStyle(),
                              border: "1px solid #fecaca",
                              background: "#fff1f2",
                              color: "#b91c1c",
                            }}
                            type="submit"
                          >
                            {actionButtonLabel(
                              pending,
                              "Delete endpoint",
                              "Deleting...",
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                ) : (
                  <WorkflowEmptyState
                    title="No endpoint selected"
                    description="Create an endpoint first, or wait for the backend list to return inventory before using mutation controls."
                    tone="neutral"
                  />
                )}
              </DataViewCard>
            </div>

            <DataViewCard
              title="Policy posture"
              subtitle="Retry cadence, validation requirements, and failure notice channels remain backend-owned."
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
                    value: renderUnknown(
                      governance?.webhookPolicy.testEventType,
                    ),
                  },
                  {
                    id: "auto-disable",
                    label: "Auto-disable",
                    value: governance?.webhookPolicy
                      .autoDisableAfterConsecutiveFailures
                      ? `${governance.webhookPolicy.autoDisableAfterConsecutiveFailures} consecutive failures`
                      : "Unknown",
                  },
                  {
                    id: "retry",
                    label: "Retry policy",
                    value: formatRetryPolicy(
                      governance?.webhookPolicy.retryPolicy,
                    ),
                  },
                  {
                    id: "notify",
                    label: "Failure channel",
                    value: renderUnknown(
                      governance?.webhookPolicy
                        .deliveryFailureNotificationChannel,
                    ),
                  },
                  {
                    id: "create-validation",
                    label: "Create validation",
                    value: renderBooleanState(
                      governance?.webhookPolicy.revalidationRequiredOnCreate,
                      "required",
                      "not required",
                    ),
                  },
                  {
                    id: "mutation-validation",
                    label: "Mutation validation",
                    value: renderBooleanState(
                      governance?.webhookPolicy
                        .revalidationRequiredOnEndpointMutation,
                      "required",
                      "not required",
                    ),
                  },
                  {
                    id: "rotation-validation",
                    label: "Rotation validation",
                    value: renderBooleanState(
                      governance?.webhookPolicy
                        .revalidationRequiredOnSecretRotation,
                      "required",
                      "not required",
                    ),
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
              {governance ? (
                <>
                  <DetailMetadataGrid
                    dense
                    minColumnWidth="160px"
                    items={[
                      {
                        id: "baseline",
                        label: "Baseline events",
                        value: formatCount(baselineEvents.length),
                      },
                      {
                        id: "subscribed",
                        label: "Subscribed events",
                        value: formatCount(subscribedEvents.size),
                      },
                      {
                        id: "uncovered",
                        label: "Uncovered",
                        value: formatCount(uncoveredEvents?.length ?? 0),
                        tone:
                          (uncoveredEvents?.length ?? 0) > 0
                            ? "warning"
                            : "success",
                      },
                      {
                        id: "checklist",
                        label: "Checklist items",
                        value: formatCount(
                          governance.onboardingChecklist.length,
                        ),
                      },
                    ]}
                  />
                  <div style={checkboxGridStyle}>
                    {baselineEvents.map((eventType) => (
                      <StatusChip
                        key={eventType}
                        label={eventType}
                        tone={
                          subscribedEvents.has(eventType)
                            ? "success"
                            : "warning"
                        }
                      />
                    ))}
                  </div>
                </>
              ) : (
                <CalloutBanner
                  title="Governance coverage unavailable"
                  description="Baseline event counts and validation booleans stay explicitly unknown until the integration governance package loads."
                  tone="warning"
                  density="compact"
                />
              )}
            </DataViewCard>

            <CalloutBanner
              title="Guardrail"
              description="This route intentionally stops at the published webhook read and mutation models. It does not invent tenant-wide delivery feeds, replay buttons, or manual retry semantics."
              tone="warning"
              density="compact"
            />
          </>
        }
      />
    </div>
  );
}
