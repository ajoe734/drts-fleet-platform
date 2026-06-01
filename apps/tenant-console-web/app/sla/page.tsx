import type { TenantSlaProfileView } from "@drts/contracts";
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

async function loadSlaPageData(): Promise<{
  view: TenantSlaProfileView | null;
  errorMessage: string | null;
}> {
  const client = getTenantClient();

  try {
    const view = await client.getSlaProfileView();
    return { view, errorMessage: null };
  } catch (error) {
    return {
      view: null,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default async function SlaPage() {
  const data = await loadSlaPageData();

  return (
    <div>
      {data.errorMessage ? (
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={th}
            tone="warn"
            title="SLA page loaded with fallback state"
            body={data.errorMessage}
          />
        </div>
      ) : null}

      <SlaManager
        profile={data.view?.profile ?? null}
        updatedBy={data.view?.updatedBy ?? "—"}
        lastRecalculationAt={data.view?.lastRecalculationAt ?? null}
        availableActions={data.view?.availableActions ?? []}
        emptyState={data.view?.emptyState ?? null}
        refreshTier={data.view?.refreshTier ?? "manual"}
        refreshMetadata={
          data.view?.refreshMetadata ?? {
            generatedAt: "",
            staleAfterMs: 0,
            dataFreshness: "unknown",
            source: "cache",
          }
        }
        loadErrorMessage={data.errorMessage}
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
