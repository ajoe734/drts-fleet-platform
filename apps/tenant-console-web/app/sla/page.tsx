import type {
  EmptyReason,
  EmptyStateEnvelope,
  TenantSlaProfileView,
} from "@drts/contracts";
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

type PageProps = {
  searchParams?: Promise<{
    empty?: string;
  }>;
};

const EMPTY_REASON_SET = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value || !EMPTY_REASON_SET.has(value as EmptyReason)) {
    return null;
  }
  return value as EmptyReason;
}

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

function buildPreviewEmptyState(
  reason: EmptyReason,
): EmptyStateEnvelope | null {
  return {
    reason,
    messageCode: `tenant.sla.preview.${reason}`,
  };
}

function buildFallbackView(reason: EmptyReason): TenantSlaProfileView {
  return {
    profile: null,
    emptyState: buildPreviewEmptyState(reason),
    // Fallback states must not invent write authority that the backend did
    // not return.
    availableActions: [],
    refreshTier: "slow",
    refreshMetadata: {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 30_000,
      dataFreshness: "unknown",
      source: "live",
    },
    updatedBy: null,
    lastRecalculationAt: null,
  };
}

async function loadSlaPageData(
  previewEmptyReason: EmptyReason | null,
): Promise<{
  view: TenantSlaProfileView;
  errors: string[];
}> {
  if (previewEmptyReason) {
    return {
      view: buildFallbackView(previewEmptyReason),
      errors: [],
    };
  }

  const client = getTenantClient();

  try {
    const view = await client.getSlaProfileView();
    return { view, errors: [] };
  } catch (error) {
    const reason = classifyFetchFailure(error);
    return {
      view: buildFallbackView(reason),
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

export default async function SlaPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const previewEmptyReason = parseEmptyReason(resolvedSearchParams?.empty);
  const data = await loadSlaPageData(previewEmptyReason);

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
