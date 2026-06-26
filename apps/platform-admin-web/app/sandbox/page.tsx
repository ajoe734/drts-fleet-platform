"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  currentExperimentVersion,
  effectiveWindow,
  experimentDisplayStatus,
  experimentStatusTone,
  type ExperimentDisplayStatus,
} from "@/lib/sandbox-governance";
import type {
  ApprovedOperatingAreaRecord,
  SandboxExperimentProgramRecord,
  SandboxJurisdictionProfileRecord,
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const idLinkStyle: CSSProperties = {
  color: theme.accent,
  fontWeight: 600,
  fontFamily: theme.monoFamily,
  textDecoration: "none",
};

type ExperimentRow = Record<string, unknown> & {
  experimentId: string;
  name: string;
  jurisdiction: string;
  area: string;
  vehicles: number;
  operators: number;
  window: string;
  status: ExperimentDisplayStatus;
};

function activeEnrollment(record: VehicleEnrollmentRecord): boolean {
  return record.status === "active";
}

function qualifiedOperator(record: SafetyOperatorQualificationRecord): boolean {
  return record.status === "qualified";
}

export default function SandboxExperimentsPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const [experiments, setExperiments] = useState<
    SandboxExperimentProgramRecord[]
  >([]);
  const [jurisdictions, setJurisdictions] = useState<
    SandboxJurisdictionProfileRecord[]
  >([]);
  const [areas, setAreas] = useState<ApprovedOperatingAreaRecord[]>([]);
  const [enrollments, setEnrollments] = useState<VehicleEnrollmentRecord[]>([]);
  const [qualifications, setQualifications] = useState<
    SafetyOperatorQualificationRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          experimentsResult,
          jurisdictionsResult,
          areasResult,
          enrollmentsResult,
          qualificationsResult,
        ] = await Promise.all([
          client.listSandboxExperiments(),
          client.listSandboxJurisdictions(),
          client.listSandboxOperatingAreas(),
          client.listSandboxVehicleEnrollments(),
          client.listSandboxSafetyOperatorQualifications(),
        ]);

        if (cancelled) {
          return;
        }

        setExperiments(experimentsResult ?? []);
        setJurisdictions(jurisdictionsResult ?? []);
        setAreas(areasResult ?? []);
        setEnrollments(enrollmentsResult ?? []);
        setQualifications(qualificationsResult ?? []);
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
  }, [client]);

  const jurisdictionNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const jurisdiction of jurisdictions) {
      const version =
        jurisdiction.versions.find(
          (candidate) => candidate.versionId === jurisdiction.currentVersionId,
        ) ?? jurisdiction.versions[0];
      if (version) {
        map.set(jurisdiction.jurisdictionId, version.name);
      }
    }
    return map;
  }, [jurisdictions]);

  const rows = useMemo<ExperimentRow[]>(() => {
    return experiments.map((program) => {
      const version = currentExperimentVersion(program);
      const jurisdictionLabel = version
        ? version.jurisdictionIds
            .map((id) => jurisdictionNames.get(id) ?? id)
            .join(" · ") || "—"
        : "—";
      const programAreas = areas.filter(
        (area) =>
          area.sandboxProgramId === program.experimentId && area.active,
      );
      const areaLabel =
        programAreas.length > 0
          ? programAreas.map((area) => area.name).join(" / ")
          : "—";
      const vehicles = enrollments.filter(
        (record) =>
          record.sandboxProgramId === program.experimentId &&
          activeEnrollment(record),
      ).length;
      const operators = qualifications.filter(
        (record) =>
          record.sandboxProgramId === program.experimentId &&
          qualifiedOperator(record),
      ).length;

      return {
        experimentId: program.experimentId,
        name: version?.name ?? program.programCode,
        jurisdiction: jurisdictionLabel,
        area: areaLabel,
        vehicles,
        operators,
        window: effectiveWindow(version),
        status: experimentDisplayStatus(program),
      };
    });
  }, [experiments, jurisdictionNames, areas, enrollments, qualifications]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.status === "active").length,
    [rows],
  );

  const columns = useMemo<CanvasTableColumn<ExperimentRow>[]>(
    () => [
      {
        h: t("sandbox.col.id"),
        w: 180,
        mono: true,
        r: (row) => (
          <Link
            href={`/sandbox/${encodeURIComponent(row.experimentId)}`}
            style={idLinkStyle}
          >
            {row.experimentId}
          </Link>
        ),
      },
      { h: t("sandbox.col.name"), k: "name", w: 200 },
      { h: t("sandbox.col.jurisdiction"), k: "jurisdiction", w: 120 },
      { h: t("sandbox.col.area"), k: "area", w: 140 },
      {
        h: t("sandbox.col.vehicles"),
        w: 64,
        mono: true,
        align: "center",
        r: (row) => row.vehicles,
      },
      {
        h: t("sandbox.col.operators"),
        w: 70,
        mono: true,
        align: "center",
        r: (row) => row.operators,
      },
      { h: t("sandbox.col.window"), k: "window", w: 150, mono: true },
      {
        h: t("sandbox.col.status"),
        w: 110,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={experimentStatusTone(row.status)}
            dot
          >
            {t(`sandbox.status.${row.status}`)}
          </CanvasPill>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("sandbox.experiments.title")}
        subtitle={t("sandbox.experiments.subtitle")}
        tabs={[
          t("sandbox.experiments.tab.all", { count: rows.length }),
          t("sandbox.experiments.tab.active", { count: activeCount }),
        ]}
        activeTab={t("sandbox.experiments.tab.all", { count: rows.length })}
        actions={
          <Link href="/sandbox/suspend" style={{ textDecoration: "none" }}>
            <CanvasBtn theme={theme} variant="secondary" icon="warn">
              {t("sandbox.experiments.action.suspendConsole")}
            </CanvasBtn>
          </Link>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("sandbox.errorTitle")}
            body={error}
          />
        ) : null}

        <CanvasCard theme={theme} title={t("sandbox.experiments.cardTitle")} padding={0}>
          {loading && experiments.length === 0 ? (
            <div style={emptyStateStyle}>{t("sandbox.loading")}</div>
          ) : rows.length === 0 ? (
            <div style={emptyStateStyle}>{t("sandbox.empty")}</div>
          ) : (
            <CanvasTable theme={theme} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
