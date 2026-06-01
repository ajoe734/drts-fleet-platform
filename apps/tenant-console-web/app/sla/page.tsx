import type { EmptyReason, TenantSlaProfileView } from "@drts/contracts";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { SlaManager } from "./sla-manager";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
};

function classifyFetchFailure(error: unknown): EmptyReason {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.includes("API error 401") || message.includes("API error 403")) {
    return "permission_denied";
  }
  if (message.includes("API error 404")) {
    return "not_provisioned";
  }
  if (
    message.includes("API error 502") ||
    message.includes("API error 503") ||
    message.includes("API error 504")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function toRenderableEmptyReason(
  reason: EmptyReason,
): Exclude<EmptyReason, "driver_not_eligible"> {
  return reason === "driver_not_eligible" ? "fetch_failed" : reason;
}

async function loadSlaPageData(): Promise<{
  view: TenantSlaProfileView;
  errors: string[];
  fetchFailureReason: Exclude<EmptyReason, "driver_not_eligible"> | null;
}> {
  const client = getTenantClient();

  try {
    const view = await client.getSlaProfileView();
    return { view, errors: [], fetchFailureReason: null };
  } catch (error) {
    return {
      view: {
        profile: null,
        emptyState: null,
        availableActions: [],
        refreshTier: "slow",
        refreshMetadata: {
          generatedAt: "",
          staleAfterMs: 0,
          dataFreshness: "unknown",
          source: "live",
        },
        updatedBy: null,
        lastRecalculationAt: null,
      },
      errors: [error instanceof Error ? error.message : "Unknown error"],
      fetchFailureReason: toRenderableEmptyReason(classifyFetchFailure(error)),
    };
  }
}

export default async function SlaPage() {
  const data = await loadSlaPageData();

  return (
    <div>
      {data.errors.length > 0 ? (
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={th}
            tone="warn"
            title="SLA page loaded with fallback state"
            body={data.errors.join(" · ")}
          />
        </div>
      ) : null}

      <SlaManager
        profile={data.view.profile}
        updatedBy={data.view.updatedBy ?? "—"}
        lastRecalculationAt={data.view.lastRecalculationAt}
        availableActions={data.view.availableActions}
        emptyState={data.view.emptyState}
        refreshTier={data.view.refreshTier}
        refreshMetadata={data.view.refreshMetadata}
        loadFailureReason={data.fetchFailureReason}
        loadErrors={data.errors}
        links={[
          { href: "/integration-governance", label: "查看整合就緒度" },
          { href: "/audit", label: "查看 SLA 稽核紀錄" },
          { href: "/settings", label: "返回租戶設定總覽" },
        ]}
        crossAppLinks={[
          {
            href: `${
              process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3002"
            }/complaints?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}&slaBreached=true`,
            label: "前往 Ops Console 檢視 SLA 違規",
          },
        ]}
      />
    </div>
  );
}
