import {
  buildCanvasTheme,
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  RocActionRail,
  type RocActionRailItem,
} from "@/components/roc-action-rail";
import type { ResourceActionDescriptor } from "@/lib/action-runtime";

const theme = buildCanvasTheme({
  surface: "roc",
  dark: true,
  density: "compact",
});

const DEMO_RESOURCE_TYPE = "roc_alert";
const DEMO_RESOURCE_ID = "demo-alert-1";

/**
 * Demonstration `availableActions` exactly as a backend ROC read model would
 * attach them (decision packet §4.5). These are illustrative — real resources
 * bind once the visual-team canvas defines the screens. They cover the four
 * confirmation patterns: low-risk direct, medium reason-required, high
 * reason-required, and a disabled descriptor (shown disabled, not hidden).
 */
const DEMO_ACTIONS: ResourceActionDescriptor[] = [
  { action: "ack", enabled: true, riskLevel: "low" },
  {
    action: "operational_hold",
    enabled: true,
    requiresReason: true,
    riskLevel: "medium",
  },
  {
    action: "open_incident",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  {
    action: "start_evidence_freeze",
    enabled: false,
    disabledReasonCode: "awaiting_supervisor",
    riskLevel: "high",
  },
];

const DEMO_PATHS: Record<string, string> = {
  ack: `/api/roc/alerts/${DEMO_RESOURCE_ID}/ack`,
  operational_hold: `/api/roc/alerts/${DEMO_RESOURCE_ID}/operational-hold`,
  open_incident: `/api/roc/alerts/${DEMO_RESOURCE_ID}/open-incident`,
  start_evidence_freeze: `/api/roc/alerts/${DEMO_RESOURCE_ID}/start-evidence-freeze`,
};

export default async function HomePage() {
  const locale = await getServerLocale();

  const labelByAction: Record<string, string> = {
    ack: t("scaffold.demo.ackAlert", locale),
    operational_hold: t("scaffold.demo.operationalHold", locale),
    open_incident: t("scaffold.demo.openIncident", locale),
    start_evidence_freeze: t("scaffold.demo.evidenceFreeze", locale),
  };

  const items: RocActionRailItem[] = DEMO_ACTIONS.map((descriptor) => ({
    descriptor,
    label: labelByAction[descriptor.action] ?? descriptor.action,
    path: DEMO_PATHS[descriptor.action] ?? `/api/roc/${descriptor.action}`,
    resourceType: DEMO_RESOURCE_TYPE,
    resourceId: DEMO_RESOURCE_ID,
  }));

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <CanvasPageHeader
        theme={theme}
        title={t("scaffold.title", locale)}
        subtitle={t("scaffold.subtitle", locale)}
      />

      <CanvasBanner
        theme={theme}
        tone="info"
        icon="warn"
        title={t("scaffold.banner.title", locale)}
        body={t("scaffold.banner.body", locale)}
      />

      <CanvasCard
        theme={theme}
        title={t("scaffold.actions.title", locale)}
        subtitle={t("scaffold.actions.hint", locale)}
      >
        <RocActionRail
          items={items}
          labels={{
            invoke: t("scaffold.actions.invoke", locale),
            pending: t("scaffold.actions.pending", locale),
            tracking: t("scaffold.actions.receiptTracking", locale),
            audit: t("scaffold.actions.receiptAudit", locale),
            disabled: t("scaffold.actions.disabledReason", locale),
          }}
        />
      </CanvasCard>
    </div>
  );
}
