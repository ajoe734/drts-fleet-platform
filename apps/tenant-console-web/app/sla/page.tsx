import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantSlaProfile,
} from "@drts/contracts";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { SlaManager } from "./sla-manager";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
};

type PageProps = {
  searchParams?: Promise<{
    empty?: string;
  }>;
};

type SlaPageData = {
  profile: TenantSlaProfile | null;
  governanceStatus: string;
  updatedBy: string;
  lastRecalculationAt: string | null;
  emptyReason: EmptyReason | null;
  errors: string[];
};

const EMPTY_REASON_SET = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
  "driver_not_eligible",
]);

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value || !EMPTY_REASON_SET.has(value as EmptyReason)) {
    return null;
  }
  return value as EmptyReason;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function mapFetchFailureToEmptyReason(error: unknown): EmptyReason {
  const message = toErrorMessage(error);
  if (message.includes("API error 403")) return "permission_denied";
  if (message.includes("API error 404")) return "not_provisioned";
  if (message.includes("API error 503")) return "external_unavailable";
  return "fetch_failed";
}

function pickUpdatedBy(logs: AuditLogRecord[]) {
  const match = [...logs]
    .filter((log) => log.resourceType === "tenant_sla")
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )[0];

  if (!match) return "—";
  return match.actorId ?? match.actorType ?? "—";
}

function pickLastRecalculationAt(logs: AuditLogRecord[]) {
  const match = [...logs]
    .filter((log) => log.actionName === "recalculate_sla_bookings")
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )[0];
  return match?.createdAt ?? null;
}

function buildAvailableActions(): ResourceActionDescriptor[] {
  return [
    {
      action: "update_sla_profile",
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    },
    {
      action: "recalculate_sla_bookings",
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    },
  ];
}

async function loadSlaPageData(
  previewEmptyReason: EmptyReason | null,
): Promise<SlaPageData> {
  if (previewEmptyReason) {
    return {
      profile: null,
      governanceStatus:
        previewEmptyReason === "not_provisioned"
          ? "not_provisioned"
          : "partial",
      updatedBy: "—",
      lastRecalculationAt: null,
      emptyReason: previewEmptyReason,
      errors: [],
    };
  }

  const client = getTenantClient();
  const [profileResult, auditResult] = await Promise.allSettled([
    client.getSlaProfile() as Promise<TenantSlaProfile>,
    client.listTenantAuditLogs() as Promise<AuditLogRecord[]>,
  ]);
  const errors: string[] = [];

  if (profileResult.status === "rejected") {
    return {
      profile: null,
      governanceStatus: "degraded",
      updatedBy: "—",
      lastRecalculationAt: null,
      emptyReason: mapFetchFailureToEmptyReason(profileResult.reason),
      errors: [`SLA profile: ${toErrorMessage(profileResult.reason)}`],
    };
  }

  const governanceStatus =
    profileResult.value.waitThresholdMin > 0 &&
    profileResult.value.arrivalThresholdMin > 0 &&
    profileResult.value.completionThresholdMin > 0
      ? "ready"
      : "partial";

  if (auditResult.status === "rejected") {
    errors.push(`Audit trail: ${toErrorMessage(auditResult.reason)}`);
  }

  const logs = auditResult.status === "fulfilled" ? auditResult.value : [];

  return {
    profile: profileResult.value,
    governanceStatus,
    updatedBy: pickUpdatedBy(logs),
    lastRecalculationAt: pickLastRecalculationAt(logs),
    emptyReason: null,
    errors,
  };
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
            title="SLA page loaded with partial data"
            body={data.errors.join(" · ")}
          />
        </div>
      ) : null}

      <SlaManager
        profile={data.profile}
        updatedBy={data.updatedBy}
        governanceStatus={data.governanceStatus}
        lastRecalculationAt={data.lastRecalculationAt}
        availableActions={buildAvailableActions()}
        emptyReason={data.emptyReason}
        links={[
          { href: "/integration-governance", label: "查看整合就緒度" },
          { href: "/audit", label: "查看 SLA 稽核紀錄" },
          { href: "/settings", label: "回到租戶設定總覽" },
        ]}
      />
    </div>
  );
}
