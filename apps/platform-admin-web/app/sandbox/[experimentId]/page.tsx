"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime } from "@/lib/admin-client";
import {
  approximateAreaKm2,
  currentExperimentVersion,
  effectiveWindow,
  evaluateCapabilityGates,
  experimentDisplayStatus,
  experimentStatusTone,
} from "@/lib/sandbox-governance";
import { SandboxGeometryMap } from "@/components/sandbox/sandbox-geometry-map";
import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  SandboxExperimentProgramRecord,
  SandboxJurisdictionProfileRecord,
  SandboxJurisdictionProfileVersionRecord,
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const TAB_ORDER = [
  "areas",
  "vehicles",
  "operators",
  "tesla",
  "capabilities",
  "policies",
] as const;
type DetailTab = (typeof TAB_ORDER)[number];

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const tabStripStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
  padding: "0 24px",
  borderBottom: `1px solid ${theme.border}`,
  background: theme.bg,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  alignItems: "start",
};

const areasGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.6fr 1fr",
  gap: 16,
  alignItems: "start",
};

function tabLinkStyle(active: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    fontSize: 12.5,
    fontWeight: active ? 600 : 500,
    color: active ? theme.text : theme.textMuted,
    borderBottom: `2px solid ${active ? theme.accent : "transparent"}`,
    marginBottom: -1,
    textDecoration: "none",
  };
}

function isDetailTab(value: string | null): value is DetailTab {
  return value !== null && (TAB_ORDER as readonly string[]).includes(value);
}

export default function SandboxExperimentDetailPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const params = useParams<{ experimentId: string }>();
  const searchParams = useSearchParams();
  const experimentId = decodeURIComponent(
    Array.isArray(params.experimentId)
      ? (params.experimentId[0] ?? "")
      : (params.experimentId ?? ""),
  );
  const tabParam = searchParams.get("tab");
  const activeTab: DetailTab = isDetailTab(tabParam) ? tabParam : "areas";

  const [program, setProgram] =
    useState<SandboxExperimentProgramRecord | null>(null);
  const [areas, setAreas] = useState<ApprovedOperatingAreaRecord[]>([]);
  const [routes, setRoutes] = useState<ApprovedRouteRecord[]>([]);
  const [enrollments, setEnrollments] = useState<VehicleEnrollmentRecord[]>([]);
  const [qualifications, setQualifications] = useState<
    SafetyOperatorQualificationRecord[]
  >([]);
  const [jurisdictions, setJurisdictions] = useState<
    SandboxJurisdictionProfileRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!experimentId) {
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          programResult,
          areasResult,
          routesResult,
          enrollmentsResult,
          qualificationsResult,
          jurisdictionsResult,
        ] = await Promise.all([
          client.getSandboxExperiment(experimentId),
          client.listSandboxOperatingAreas(),
          client.listSandboxRoutes(),
          client.listSandboxVehicleEnrollments(),
          client.listSandboxSafetyOperatorQualifications(),
          client.listSandboxJurisdictions(),
        ]);

        if (cancelled) {
          return;
        }

        setProgram(programResult);
        setAreas(
          (areasResult ?? []).filter(
            (area) => area.sandboxProgramId === experimentId,
          ),
        );
        setRoutes(
          (routesResult ?? []).filter(
            (route) => route.sandboxProgramId === experimentId,
          ),
        );
        setEnrollments(
          (enrollmentsResult ?? []).filter(
            (record) => record.sandboxProgramId === experimentId,
          ),
        );
        setQualifications(
          (qualificationsResult ?? []).filter(
            (record) => record.sandboxProgramId === experimentId,
          ),
        );
        setJurisdictions(jurisdictionsResult ?? []);
      } catch (loadError: unknown) {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [client, experimentId]);

  const version = useMemo(
    () => (program ? currentExperimentVersion(program) : null),
    [program],
  );

  const jurisdictionVersions = useMemo(() => {
    if (!version) {
      return [] as SandboxJurisdictionProfileVersionRecord[];
    }
    const result: SandboxJurisdictionProfileVersionRecord[] = [];
    for (const id of version.jurisdictionIds) {
      const profile = jurisdictions.find(
        (candidate) => candidate.jurisdictionId === id,
      );
      if (!profile) {
        continue;
      }
      const profileVersion =
        profile.versions.find(
          (candidate) => candidate.versionId === profile.currentVersionId,
        ) ?? profile.versions[0];
      if (profileVersion) {
        result.push(profileVersion);
      }
    }
    return result;
  }, [version, jurisdictions]);

  const status = program ? experimentDisplayStatus(program) : "draft";

  // Canvas (platform-sandbox.jsx · PA_ExperimentDetail) renders the subtitle as
  // "name · jurisdiction · area". Compose it from already-loaded records so the
  // runtime header matches the v9 design authority rather than name-only.
  const subtitle = useMemo(() => {
    const jurisdictionLabel = jurisdictionVersions
      .map((profileVersion) => profileVersion.name)
      .filter((label): label is string => Boolean(label))
      .join(" / ");
    const areaLabel = areas
      .map((area) => area.name)
      .filter((label): label is string => Boolean(label))
      .join(" / ");
    const parts = [
      version?.name ?? program?.programCode ?? experimentId,
      jurisdictionLabel,
      areaLabel,
    ].filter((part) => part.length > 0);
    return parts.join(" · ");
  }, [jurisdictionVersions, areas, version, program, experimentId]);

  if (!loading && error) {
    return (
      <>
        <CanvasPageHeader theme={theme} title={experimentId} />
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("sandbox.errorTitle")}
            body={error}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {experimentId}
            <CanvasPill theme={theme} tone={experimentStatusTone(status)} dot>
              {t(`sandbox.status.${status}`)}
            </CanvasPill>
          </span>
        }
        subtitle={subtitle}
        actions={
          <Link href="/sandbox/suspend" style={{ textDecoration: "none" }}>
            <CanvasBtn theme={theme} variant="secondary" danger icon="warn">
              {t("sandbox.detail.action.suspendConsole")}
            </CanvasBtn>
          </Link>
        }
      />

      <div style={tabStripStyle}>
        {TAB_ORDER.map((tab) => (
          <Link
            key={tab}
            href={`/sandbox/${encodeURIComponent(experimentId)}?tab=${tab}`}
            style={tabLinkStyle(tab === activeTab)}
          >
            {t(`sandbox.detail.tab.${tab}`)}
          </Link>
        ))}
      </div>

      <div style={pageBodyStyle}>
        <VersionSummary
          versionNo={version?.versionNo ?? null}
          effective={effectiveWindow(version)}
          labels={{
            title: t("sandbox.detail.version.title"),
            subtitle: t("sandbox.detail.version.subtitle"),
            version: t("sandbox.detail.version.no"),
            lifecycle: t("sandbox.detail.version.lifecycle"),
            authorization: t("sandbox.detail.version.authorization"),
            effective: t("sandbox.detail.version.effective"),
            published: t("sandbox.detail.version.published"),
            none: t("common.na"),
            lifecycleLabel: version
              ? t(`sandbox.lifecycle.${version.lifecycleStatus}`)
              : t("common.na"),
            authorizationLabel: version
              ? t(`sandbox.status.${version.authorizationStatus}`)
              : t("common.na"),
            publishedValue: version?.publishedAt
              ? formatDateTime(version.publishedAt)
              : t("common.na"),
          }}
        />

        {loading && !program ? (
          <CanvasCard theme={theme} title={t(`sandbox.detail.tab.${activeTab}`)}>
            {t("sandbox.loading")}
          </CanvasCard>
        ) : activeTab === "areas" ? (
          <AreasTab theme={theme} areas={areas} routes={routes} t={t} />
        ) : activeTab === "vehicles" ? (
          <VehiclesTab enrollments={enrollments} t={t} />
        ) : activeTab === "operators" ? (
          <OperatorsTab qualifications={qualifications} t={t} />
        ) : activeTab === "tesla" ? (
          <TeslaTab version={version} t={t} />
        ) : activeTab === "capabilities" ? (
          <CapabilitiesTab
            jurisdictionVersions={jurisdictionVersions}
            areas={areas}
            t={t}
          />
        ) : (
          <PoliciesTab jurisdictionVersions={jurisdictionVersions} t={t} />
        )}
      </div>
    </>
  );
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function VersionSummary({
  versionNo,
  effective,
  labels,
}: {
  versionNo: number | null;
  effective: string;
  labels: {
    title: string;
    subtitle: string;
    version: string;
    lifecycle: string;
    authorization: string;
    effective: string;
    published: string;
    none: string;
    lifecycleLabel: string;
    authorizationLabel: string;
    publishedValue: string;
  };
}) {
  return (
    <CanvasCard theme={theme} title={labels.title} subtitle={labels.subtitle}>
      <CanvasDL
        theme={theme}
        cols={3}
        items={[
          {
            k: labels.version,
            v: versionNo === null ? labels.none : `v${versionNo}`,
            mono: true,
          },
          { k: labels.lifecycle, v: labels.lifecycleLabel },
          { k: labels.authorization, v: labels.authorizationLabel },
          { k: labels.effective, v: effective, mono: true },
          { k: labels.published, v: labels.publishedValue, mono: true },
        ]}
      />
    </CanvasCard>
  );
}

function AreasTab({
  areas,
  routes,
  t,
}: {
  theme: typeof theme;
  areas: ApprovedOperatingAreaRecord[];
  routes: ApprovedRouteRecord[];
  t: Translate;
}) {
  const primaryArea = areas[0];
  const areaKm2 = approximateAreaKm2(areas);
  const stopRows: Array<{ name: string; kind: string }> = [
    ...routes.map((route) => ({
      name: route.name,
      kind: t("sandbox.areas.kind.route"),
    })),
    ...areas
      .filter((area) => area.areaKind === "pickup_dropoff_zone")
      .map((area) => ({ name: area.name, kind: t("sandbox.areas.kind.zone") })),
  ];

  return (
    <div style={areasGridStyle}>
      <CanvasCard
        theme={theme}
        title={t("sandbox.areas.cardTitle")}
        subtitle={t("sandbox.areas.cardSubtitle")}
        padding={0}
      >
        <SandboxGeometryMap
          theme={theme}
          areas={areas.filter((area) => area.areaKind === "operating_area")}
          routes={routes}
          caption={t("sandbox.areas.caption", {
            areas: areas.length,
            routes: routes.length,
          })}
          emptyLabel={t("sandbox.areas.empty")}
          tools={[
            { icon: "integrationGov", label: t("sandbox.areas.tool.polygon") },
            { icon: "dispatch", label: t("sandbox.areas.tool.route") },
            { icon: "pin", label: t("sandbox.areas.tool.point") },
            { icon: "more", label: t("sandbox.areas.tool.edit") },
          ]}
        />
      </CanvasCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CanvasCard theme={theme} title={t("sandbox.areas.attrTitle")}>
          <CanvasDL
            theme={theme}
            cols={1}
            items={[
              { k: t("sandbox.areas.attr.name"), v: primaryArea?.name ?? t("common.na") },
              {
                k: t("sandbox.areas.attr.geometry"),
                v: primaryArea
                  ? `POLYGON · ${countVertices(primaryArea)} pts`
                  : t("common.na"),
                mono: true,
              },
              {
                k: t("sandbox.areas.attr.version"),
                v: primaryArea ? `v${primaryArea.version}` : t("common.na"),
                mono: true,
              },
              {
                k: t("sandbox.areas.attr.area"),
                v: areaKm2 > 0 ? `${areaKm2} km²` : t("common.na"),
                mono: true,
              },
            ]}
          />
        </CanvasCard>
        <CanvasCard theme={theme} title={t("sandbox.areas.routesTitle")} padding={0}>
          {stopRows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: theme.textMuted }}>
              {t("sandbox.areas.routesEmpty")}
            </div>
          ) : (
            <CanvasTable
              theme={theme}
              columns={[
                { h: t("sandbox.areas.col.name"), k: "name", w: 140 },
                {
                  h: t("sandbox.areas.col.kind"),
                  w: 90,
                  r: (row) => (
                    <CanvasPill theme={theme} tone="neutral">
                      {row.kind}
                    </CanvasPill>
                  ),
                },
              ]}
              rows={stopRows.map((row) => ({ ...row }) as Record<string, unknown> & typeof row)}
            />
          )}
        </CanvasCard>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="warn"
          body={t("sandbox.areas.readonlyNote")}
        />
      </div>
    </div>
  );
}

function countVertices(area: ApprovedOperatingAreaRecord): number {
  let total = 0;
  for (const polygon of area.geometry.coordinates) {
    const ring = polygon[0];
    if (ring) {
      total += Math.max(0, ring.length - 1);
    }
  }
  return total;
}

function VehiclesTab({
  enrollments,
  t,
}: {
  enrollments: VehicleEnrollmentRecord[];
  t: Translate;
}) {
  const columns: CanvasTableColumn<
    Record<string, unknown> & VehicleEnrollmentRecord
  >[] = [
    {
      h: t("sandbox.vehicles.col.vehicle"),
      w: 120,
      mono: true,
      r: (row) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>
          {row.vehicleId}
        </span>
      ),
    },
    { h: t("sandbox.vehicles.col.provider"), k: "providerCode", w: 120, mono: true },
    {
      h: t("sandbox.vehicles.col.areas"),
      w: 80,
      align: "center",
      mono: true,
      r: (row) => row.approvedAreaIds.length,
    },
    {
      h: t("sandbox.vehicles.col.maxTrips"),
      w: 90,
      align: "center",
      mono: true,
      r: (row) => row.maxConcurrentTrips ?? "—",
    },
    {
      h: t("sandbox.vehicles.col.effective"),
      w: 170,
      mono: true,
      r: (row) =>
        `${formatDate(row.effectiveFrom)} → ${formatDate(row.effectiveUntil)}`,
    },
    {
      h: t("sandbox.vehicles.col.status"),
      w: 110,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.status === "active" ? "success" : row.status === "suspended" || row.status === "revoked" ? "danger" : "neutral"}
          dot
        >
          {t(`sandbox.enrollment.${row.status}`)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard
      theme={theme}
      title={t("sandbox.vehicles.title")}
      subtitle={t("sandbox.vehicles.subtitle")}
      padding={0}
    >
      {enrollments.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: theme.textMuted }}>
          {t("sandbox.vehicles.empty")}
        </div>
      ) : (
        <CanvasTable
          theme={theme}
          columns={columns}
          rows={enrollments.map(
            (record) =>
              ({ ...record }) as Record<string, unknown> & VehicleEnrollmentRecord,
          )}
        />
      )}
    </CanvasCard>
  );
}

function OperatorsTab({
  qualifications,
  t,
}: {
  qualifications: SafetyOperatorQualificationRecord[];
  t: Translate;
}) {
  const columns: CanvasTableColumn<
    Record<string, unknown> & SafetyOperatorQualificationRecord
  >[] = [
    {
      h: t("sandbox.operators.col.operator"),
      w: 160,
      r: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.safetyOperatorId}</div>
          <div
            style={{
              fontSize: 10.5,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {row.providerCode}
          </div>
        </div>
      ),
    },
    {
      h: t("sandbox.operators.col.certs"),
      w: 110,
      align: "center",
      mono: true,
      r: (row) => row.certificationRefs.length,
    },
    {
      h: t("sandbox.operators.col.areas"),
      w: 80,
      align: "center",
      mono: true,
      r: (row) => row.approvedAreaIds.length,
    },
    {
      h: t("sandbox.operators.col.effective"),
      w: 170,
      mono: true,
      r: (row) =>
        `${formatDate(row.effectiveFrom)} → ${formatDate(row.effectiveUntil)}`,
    },
    {
      h: t("sandbox.operators.col.status"),
      w: 120,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.status === "qualified" ? "success" : row.status === "suspended" || row.status === "revoked" ? "danger" : "warn"}
          dot
        >
          {t(`sandbox.qualification.${row.status}`)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard
      theme={theme}
      title={t("sandbox.operators.title")}
      subtitle={t("sandbox.operators.subtitle")}
      padding={0}
    >
      {qualifications.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: theme.textMuted }}>
          {t("sandbox.operators.empty")}
        </div>
      ) : (
        <CanvasTable
          theme={theme}
          columns={columns}
          rows={qualifications.map(
            (record) =>
              ({ ...record }) as Record<string, unknown> &
                SafetyOperatorQualificationRecord,
          )}
        />
      )}
    </CanvasCard>
  );
}

function TeslaTab({
  version,
  t,
}: {
  version: SandboxExperimentProgramRecord["versions"][number] | null;
  t: Translate;
}) {
  const gates = evaluateCapabilityGates(version?.requiredCapabilities ?? []);

  return (
    <div style={twoColStyle}>
      <CanvasCard
        theme={theme}
        title={t("sandbox.tesla.title")}
        subtitle={t("sandbox.tesla.subtitle")}
      >
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            { k: t("sandbox.tesla.endpoint"), v: t("sandbox.tesla.gatedValue"), mono: true },
            { k: t("sandbox.tesla.auth"), v: t("sandbox.tesla.gatedValue"), mono: true },
            { k: t("sandbox.tesla.incidentVideo"), v: t("sandbox.tesla.failClosed"), mono: true },
            { k: t("sandbox.tesla.dataResidency"), v: t("sandbox.tesla.pending") },
          ]}
        />
        <div style={{ marginTop: 10 }}>
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            body={t("sandbox.tesla.gatedBanner")}
          />
        </div>
      </CanvasCard>
      <CanvasCard theme={theme} title={t("sandbox.tesla.flagsTitle")}>
        {gates.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {t("sandbox.tesla.flagsEmpty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {gates.map((gate) => (
              <div
                key={gate.capability}
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}
              >
                <CanvasIcon
                  name={gate.gated ? "x" : "check"}
                  size={14}
                  style={{ color: gate.gated ? theme.textDim : theme.success }}
                />
                <span
                  style={{
                    flex: 1,
                    fontFamily: theme.monoFamily,
                    fontSize: 11.5,
                  }}
                >
                  {gate.capability}
                  {gate.required ? "" : ` · ${t("sandbox.tesla.optional")}`}
                </span>
                <CanvasPill
                  theme={theme}
                  tone={gate.gated ? "neutral" : "success"}
                >
                  {gate.gated
                    ? t("sandbox.tesla.gated")
                    : t("sandbox.tesla.enabled")}
                </CanvasPill>
              </div>
            ))}
          </div>
        )}
      </CanvasCard>
    </div>
  );
}

function CapabilitiesTab({
  jurisdictionVersions,
  areas,
  t,
}: {
  jurisdictionVersions: SandboxJurisdictionProfileVersionRecord[];
  areas: ApprovedOperatingAreaRecord[];
  t: Translate;
}) {
  const primary = jurisdictionVersions[0];
  const schedule = areas[0]?.schedules?.[0];
  const window = schedule
    ? `${schedule.startLocalTime}–${schedule.endLocalTime}`
    : t("common.na");

  return (
    <CanvasCard
      theme={theme}
      title={t("sandbox.capabilities.title")}
      subtitle={t("sandbox.capabilities.subtitle")}
    >
      <CanvasDL
        theme={theme}
        cols={2}
        items={[
          { k: t("sandbox.capabilities.jurisdiction"), v: primary?.name ?? t("common.na") },
          {
            k: t("sandbox.capabilities.profile"),
            v: primary?.jurisdictionCode ?? t("common.na"),
            mono: true,
          },
          {
            k: t("sandbox.capabilities.regulator"),
            v: primary?.regulatorName ?? t("common.na"),
          },
          {
            k: t("sandbox.capabilities.leadTime"),
            v:
              primary?.approvalLeadTimeDays != null
                ? `${primary.approvalLeadTimeDays} d`
                : t("common.na"),
            mono: true,
          },
          { k: t("sandbox.capabilities.window"), v: window, mono: true },
          {
            k: t("sandbox.capabilities.maxVehicles"),
            v: schedule?.maxConcurrentVehicles ?? t("common.na"),
            mono: true,
          },
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <CanvasBanner
          theme={theme}
          tone="info"
          icon="warn"
          body={t("sandbox.capabilities.note")}
        />
      </div>
    </CanvasCard>
  );
}

function PoliciesTab({
  jurisdictionVersions,
  t,
}: {
  jurisdictionVersions: SandboxJurisdictionProfileVersionRecord[];
  t: Translate;
}) {
  const primary = jurisdictionVersions[0];
  const retention =
    primary?.retentionDays != null
      ? `${primary.retentionDays} d`
      : t("sandbox.policies.retentionPolicy");

  return (
    <div style={twoColStyle}>
      <CanvasCard
        theme={theme}
        title={t("sandbox.policies.evidenceTitle")}
        subtitle={t("sandbox.policies.evidenceSubtitle")}
      >
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            { k: t("sandbox.policies.generalRetention"), v: retention, mono: true },
            {
              k: t("sandbox.policies.incidentRetention"),
              v: t("sandbox.policies.incidentRetentionValue"),
              mono: true,
            },
            { k: t("sandbox.policies.hash"), v: "SHA-256 · append-only", mono: true },
            { k: t("sandbox.policies.legalHold"), v: t("sandbox.policies.legalHoldValue") },
          ]}
        />
      </CanvasCard>
      <CanvasCard
        theme={theme}
        title={t("sandbox.policies.reportingTitle")}
        subtitle={t("sandbox.policies.reportingSubtitle")}
      >
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              k: t("sandbox.policies.firstReport"),
              v: t("sandbox.policies.firstReportValue"),
              mono: true,
            },
            {
              k: t("sandbox.policies.finalReport"),
              v: t("sandbox.policies.finalReportValue"),
              mono: true,
            },
            { k: t("sandbox.policies.weekly"), v: t("sandbox.policies.weeklyValue") },
            {
              k: t("sandbox.policies.recipients"),
              v: primary?.regulatorName ?? t("sandbox.policies.recipientsValue"),
            },
          ]}
        />
      </CanvasCard>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match ? match[1]! : iso;
}
