import { type Locale, t } from "@/lib/translations";

export type EnterpriseGateKind =
  | "auth-required"
  | "suspended"
  | "approval-pending"
  | "approval-rejected"
  | "quota-blocked"
  | "no-supply"
  | "degraded";

export type EnterpriseEmbedStateKind =
  | "handoff-ok"
  | "reauth-required"
  | "unsupported-host"
  | "consent-required"
  | "fallback-to-web";

export type EnterpriseGateTone = "info" | "warn" | "danger" | "success";

export function getEnterpriseGate(kind: EnterpriseGateKind, locale: Locale) {
  switch (kind) {
    case "auth-required":
      return {
        title: t("gate.authRequired.title", undefined, locale),
        subtitle: t("gate.authRequired.subtitle", undefined, locale),
        tone: "info" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.authRequired.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.authRequired.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.authRequired.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.authRequired.action.primary", undefined, locale),
            href: "/",
          },
          {
            label: t("gate.authRequired.action.secondary", undefined, locale),
            href: "/help",
          },
        ],
      };
    case "suspended":
      return {
        title: t("gate.suspended.title", undefined, locale),
        subtitle: t("gate.suspended.subtitle", undefined, locale),
        tone: "warn" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.suspended.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.suspended.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.suspended.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.suspended.action.primary", undefined, locale),
            href: "/help",
          },
          {
            label: t("gate.suspended.action.secondary", undefined, locale),
            href: "/",
          },
        ],
      };
    case "approval-pending":
      return {
        title: t("gate.approvalPending.title", undefined, locale),
        subtitle: t("gate.approvalPending.subtitle", undefined, locale),
        tone: "warn" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.approvalPending.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.approvalPending.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.approvalPending.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.approvalPending.action.primary", undefined, locale),
            href: "/bookings",
          },
          {
            label: t(
              "gate.approvalPending.action.secondary",
              undefined,
              locale,
            ),
            href: "/help",
          },
        ],
      };
    case "approval-rejected":
      return {
        title: t("gate.approvalRejected.title", undefined, locale),
        subtitle: t("gate.approvalRejected.subtitle", undefined, locale),
        tone: "danger" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.approvalRejected.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.approvalRejected.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.approvalRejected.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.approvalRejected.action.primary", undefined, locale),
            href: "/bookings/new",
          },
          {
            label: t(
              "gate.approvalRejected.action.secondary",
              undefined,
              locale,
            ),
            href: "/help",
          },
        ],
      };
    case "quota-blocked":
      return {
        title: t("gate.quotaBlocked.title", undefined, locale),
        subtitle: t("gate.quotaBlocked.subtitle", undefined, locale),
        tone: "warn" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.quotaBlocked.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.quotaBlocked.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.quotaBlocked.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.quotaBlocked.action.primary", undefined, locale),
            href: "/bookings/new",
          },
          {
            label: t("gate.quotaBlocked.action.secondary", undefined, locale),
            href: "/help",
          },
        ],
      };
    case "no-supply":
      return {
        title: t("gate.noSupply.title", undefined, locale),
        subtitle: t("gate.noSupply.subtitle", undefined, locale),
        tone: "danger" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.noSupply.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.noSupply.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.noSupply.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.noSupply.action.primary", undefined, locale),
            href: "/bookings",
          },
          {
            label: t("gate.noSupply.action.secondary", undefined, locale),
            href: "/help",
          },
        ],
      };
    case "degraded":
      return {
        title: t("gate.degraded.title", undefined, locale),
        subtitle: t("gate.degraded.subtitle", undefined, locale),
        tone: "info" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("gate.degraded.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("gate.degraded.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("gate.degraded.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("gate.degraded.action.primary", undefined, locale),
            href: "/bookings",
          },
          {
            label: t("gate.degraded.action.secondary", undefined, locale),
            href: "/help",
          },
        ],
      };
  }
}

export function getEnterpriseEmbedState(
  kind: EnterpriseEmbedStateKind,
  locale: Locale,
) {
  switch (kind) {
    case "handoff-ok":
      return {
        title: t("embed.handoffOk.title", undefined, locale),
        subtitle: t("embed.handoffOk.subtitle", undefined, locale),
        tone: "success" as const,
        details: [
          {
            k: t("embed.handoffOk.detail.source", undefined, locale),
            v: t("embed.handoffOk.detail.sourceValue", undefined, locale),
          },
          {
            k: t("embed.handoffOk.detail.session", undefined, locale),
            v: t("embed.handoffOk.detail.sessionValue", undefined, locale),
          },
          {
            k: t("embed.handoffOk.detail.restriction", undefined, locale),
            v: t("embed.handoffOk.detail.restrictionValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("embed.handoffOk.action.primary", undefined, locale),
            href: "/bookings/new",
          },
          {
            label: t("embed.handoffOk.action.secondary", undefined, locale),
            href: "/",
          },
        ],
      };
    case "reauth-required":
      return {
        title: t("embed.reauthRequired.title", undefined, locale),
        subtitle: t("embed.reauthRequired.subtitle", undefined, locale),
        tone: "warn" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("embed.reauthRequired.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("embed.reauthRequired.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("embed.reauthRequired.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("embed.reauthRequired.action.primary", undefined, locale),
            href: "/embed",
          },
          {
            label: t(
              "embed.reauthRequired.action.secondary",
              undefined,
              locale,
            ),
            href: "/",
          },
        ],
      };
    case "unsupported-host":
      return {
        title: t("embed.unsupportedHost.title", undefined, locale),
        subtitle: t("embed.unsupportedHost.subtitle", undefined, locale),
        tone: "danger" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("embed.unsupportedHost.detail.reasonValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.impact", undefined, locale),
            v: t("embed.unsupportedHost.detail.impactValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("embed.unsupportedHost.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("embed.unsupportedHost.action.primary", undefined, locale),
            href: "/",
          },
          {
            label: t(
              "embed.unsupportedHost.action.secondary",
              undefined,
              locale,
            ),
            href: "/help",
          },
        ],
      };
    case "consent-required":
      return {
        title: t("embed.consentRequired.title", undefined, locale),
        subtitle: t("embed.consentRequired.subtitle", undefined, locale),
        tone: "info" as const,
        details: [
          {
            k: t("embed.consentRequired.detail.scope", undefined, locale),
            v: t("embed.consentRequired.detail.scopeValue", undefined, locale),
          },
          {
            k: t("embed.consentRequired.detail.purpose", undefined, locale),
            v: t(
              "embed.consentRequired.detail.purposeValue",
              undefined,
              locale,
            ),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("embed.consentRequired.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("embed.consentRequired.action.primary", undefined, locale),
            href: "/bookings/new",
          },
          {
            label: t(
              "embed.consentRequired.action.secondary",
              undefined,
              locale,
            ),
            href: "/",
          },
        ],
      };
    case "fallback-to-web":
      return {
        title: t("embed.fallbackToWeb.title", undefined, locale),
        subtitle: t("embed.fallbackToWeb.subtitle", undefined, locale),
        tone: "warn" as const,
        details: [
          {
            k: t("gate.authRequired.detail.reason", undefined, locale),
            v: t("embed.fallbackToWeb.detail.reasonValue", undefined, locale),
          },
          {
            k: t("embed.fallbackToWeb.detail.priority", undefined, locale),
            v: t("embed.fallbackToWeb.detail.priorityValue", undefined, locale),
          },
          {
            k: t("gate.authRequired.detail.next", undefined, locale),
            v: t("embed.fallbackToWeb.detail.nextValue", undefined, locale),
          },
        ],
        actions: [
          {
            label: t("embed.fallbackToWeb.action.primary", undefined, locale),
            href: "/",
          },
          {
            label: t("embed.fallbackToWeb.action.secondary", undefined, locale),
            href: "/embed",
          },
        ],
      };
  }
}

export const enterpriseGateConfig = {
  "auth-required": getEnterpriseGate("auth-required", "zh"),
  suspended: getEnterpriseGate("suspended", "zh"),
  "approval-pending": getEnterpriseGate("approval-pending", "zh"),
  "approval-rejected": getEnterpriseGate("approval-rejected", "zh"),
  "quota-blocked": getEnterpriseGate("quota-blocked", "zh"),
  "no-supply": getEnterpriseGate("no-supply", "zh"),
  degraded: getEnterpriseGate("degraded", "zh"),
} as const;

export const enterpriseEmbedStateConfig = {
  "handoff-ok": getEnterpriseEmbedState("handoff-ok", "zh"),
  "reauth-required": getEnterpriseEmbedState("reauth-required", "zh"),
  "unsupported-host": getEnterpriseEmbedState("unsupported-host", "zh"),
  "consent-required": getEnterpriseEmbedState("consent-required", "zh"),
  "fallback-to-web": getEnterpriseEmbedState("fallback-to-web", "zh"),
} as const;
