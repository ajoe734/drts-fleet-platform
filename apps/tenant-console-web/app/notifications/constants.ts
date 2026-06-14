import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantNotificationSubscription,
} from "@drts/contracts";

export const NOTIFICATION_CHANNELS = [
  "email",
  "webhook",
  "ops_console",
] as const satisfies TenantNotificationSubscription["channel"][];

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENT_CATALOG = [
  {
    eventType: "booking.created",
    descriptionKey: "notifications.event.bookingCreated.description",
    defaultAudienceKey: "notifications.event.bookingCreated.audience",
  },
  {
    eventType: "booking.confirmed",
    descriptionKey: "notifications.event.bookingConfirmed.description",
    defaultAudienceKey: "notifications.event.bookingConfirmed.audience",
  },
  {
    eventType: "booking.cancelled",
    descriptionKey: "notifications.event.bookingCancelled.description",
    defaultAudienceKey: "notifications.event.bookingCancelled.audience",
  },
  {
    eventType: "booking.approval_required",
    descriptionKey: "notifications.event.bookingApprovalRequired.description",
    defaultAudienceKey: "notifications.event.bookingApprovalRequired.audience",
  },
  {
    eventType: "booking.approval_approved",
    descriptionKey: "notifications.event.bookingApprovalApproved.description",
    defaultAudienceKey: "notifications.event.bookingApprovalApproved.audience",
  },
  {
    eventType: "booking.approval_rejected",
    descriptionKey: "notifications.event.bookingApprovalRejected.description",
    defaultAudienceKey: "notifications.event.bookingApprovalRejected.audience",
  },
  {
    eventType: "invoice.ready",
    descriptionKey: "notifications.event.invoiceReady.description",
    defaultAudienceKey: "notifications.event.invoiceReady.audience",
  },
  {
    eventType: "webhook.delivery_failed",
    descriptionKey: "notifications.event.webhookDeliveryFailed.description",
    defaultAudienceKey: "notifications.event.webhookDeliveryFailed.audience",
  },
  {
    eventType: "quota.threshold_warning",
    descriptionKey: "notifications.event.quotaThresholdWarning.description",
    defaultAudienceKey: "notifications.event.quotaThresholdWarning.audience",
  },
] as const;

export const EMPTY_REASON_COPY: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  {
    titleKey: string;
    bodyKey: string;
    tone: "neutral" | "info" | "warn" | "danger";
    action?: ResourceActionDescriptor & { labelKey: string; href?: string };
  }
> = {
  no_data: {
    titleKey: "notifications.empty.noData.title",
    bodyKey: "notifications.empty.noData.body",
    tone: "neutral",
  },
  not_provisioned: {
    titleKey: "notifications.empty.notProvisioned.title",
    bodyKey: "notifications.empty.notProvisioned.body",
    tone: "info",
    action: {
      action: "configure_webhook",
      enabled: true,
      riskLevel: "low",
      labelKey: "notifications.empty.notProvisioned.cta",
      href: "/webhooks",
    },
  },
  fetch_failed: {
    titleKey: "notifications.empty.fetchFailed.title",
    bodyKey: "notifications.empty.fetchFailed.body",
    tone: "danger",
  },
  permission_denied: {
    titleKey: "notifications.empty.permissionDenied.title",
    bodyKey: "notifications.empty.permissionDenied.body",
    tone: "warn",
  },
  external_unavailable: {
    titleKey: "notifications.empty.externalUnavailable.title",
    bodyKey: "notifications.empty.externalUnavailable.body",
    tone: "warn",
  },
  filtered_empty: {
    titleKey: "notifications.empty.filteredEmpty.title",
    bodyKey: "notifications.empty.filteredEmpty.body",
    tone: "neutral",
  },
};
