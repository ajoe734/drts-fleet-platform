import type {
  EmptyReason,
  TenantSlaProfileView,
  UiRefreshMetadata,
} from "@drts/contracts";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { SlaManager } from "./sla-manager";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
};

const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

type SlaPageProps = {
  searchParams?: Promise<{
    emptyReason?: string;
  }>;
};

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }

  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function buildRefreshMetadata(): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 30_000,
    dataFreshness: "fresh",
    source: "static",
  };
}

function applyEmptyReasonOverride(
  view: TenantSlaProfileView | null,
  emptyReasonOverride: EmptyReason | null,
): TenantSlaProfileView | null {
  if (!emptyReasonOverride) {
    return view;
  }

  return {
    profile: null,
    emptyState: {
      reason: emptyReasonOverride,
      messageCode: `preview.${emptyReasonOverride}`,
    },
    availableActions: view?.availableActions ?? [],
    refreshTier: view?.refreshTier ?? "slow",
    refreshMetadata: view?.refreshMetadata ?? buildRefreshMetadata(),
    updatedBy: view?.updatedBy ?? null,
    lastRecalculationAt: null,
  };
}

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

export default async function SlaPage({ searchParams }: SlaPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );
  const data = await loadSlaPageData();
  const view = applyEmptyReasonOverride(data.view, emptyReasonOverride);

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
        view={view}
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
