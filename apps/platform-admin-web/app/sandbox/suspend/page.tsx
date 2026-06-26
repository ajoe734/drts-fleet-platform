"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  currentExperimentVersion,
  experimentDisplayStatus,
  experimentStatusTone,
} from "@/lib/sandbox-governance";
import type {
  SandboxExperimentProgramRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: 16,
  alignItems: "start",
  width: "100%",
};

const rowStyle = (last: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  borderBottom: last ? "none" : `1px solid ${theme.border}`,
});

export default function SandboxSuspendPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const [experiments, setExperiments] = useState<
    SandboxExperimentProgramRecord[]
  >([]);
  const [enrollments, setEnrollments] = useState<VehicleEnrollmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [experimentsResult, enrollmentsResult] = await Promise.all([
        client.listSandboxExperiments(),
        client.listSandboxVehicleEnrollments(),
      ]);
      setExperiments(experimentsResult ?? []);
      setEnrollments(enrollmentsResult ?? []);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeVehicleCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of enrollments) {
      if (record.status !== "active") {
        continue;
      }
      map.set(
        record.sandboxProgramId,
        (map.get(record.sandboxProgramId) ?? 0) + 1,
      );
    }
    return map;
  }, [enrollments]);

  const totalAffected = useMemo(
    () =>
      experiments
        .filter((program) => experimentDisplayStatus(program) === "active")
        .reduce(
          (sum, program) =>
            sum + (activeVehicleCount.get(program.experimentId) ?? 0),
          0,
        ),
    [experiments, activeVehicleCount],
  );

  const handleSuspend = useCallback(
    async (program: SandboxExperimentProgramRecord) => {
      setBusyId(program.experimentId);
      setNotice(null);
      setError(null);
      try {
        await client.suspendSandboxExperiment(program.experimentId, {
          reason: "platform_admin_console",
        });
        setNotice(
          t("sandbox.suspend.notice.suspended", { id: program.experimentId }),
        );
        await load();
      } catch (actionError: unknown) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : String(actionError),
        );
      } finally {
        setBusyId(null);
      }
    },
    [client, load, t],
  );

  const handleResume = useCallback(
    async (program: SandboxExperimentProgramRecord) => {
      setBusyId(program.experimentId);
      setNotice(null);
      setError(null);
      try {
        await client.resumeSandboxExperimentAuthorizations(
          program.experimentId,
          { reason: "platform_admin_console" },
        );
        setNotice(
          t("sandbox.suspend.notice.resumed", { id: program.experimentId }),
        );
        await load();
      } catch (actionError: unknown) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : String(actionError),
        );
      } finally {
        setBusyId(null);
      }
    },
    [client, load, t],
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("sandbox.suspend.title")}
        subtitle={t("sandbox.suspend.subtitle")}
      />

      <div style={pageBodyStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("sandbox.errorTitle")}
              body={error}
            />
          ) : null}
          {notice ? (
            <CanvasBanner theme={theme} tone="success" icon="ok" body={notice} />
          ) : null}

          <CanvasCard theme={theme} title={t("sandbox.suspend.controlTitle")}>
            {loading && experiments.length === 0 ? (
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                {t("sandbox.loading")}
              </div>
            ) : experiments.length === 0 ? (
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                {t("sandbox.empty")}
              </div>
            ) : (
              experiments.map((program, index) => {
                const version = currentExperimentVersion(program);
                const status = experimentDisplayStatus(program);
                const isBusy = busyId === program.experimentId;
                return (
                  <div
                    key={program.experimentId}
                    style={rowStyle(index === experiments.length - 1)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {version?.name ?? program.programCode}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.textDim,
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {program.experimentId}
                      </div>
                    </div>
                    <CanvasPill
                      theme={theme}
                      tone={experimentStatusTone(status)}
                      dot
                    >
                      {t(`sandbox.status.${status}`)}
                    </CanvasPill>
                    {status === "active" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        danger
                        disabled={isBusy}
                        onClick={() => void handleSuspend(program)}
                      >
                        {t("sandbox.suspend.action.suspend")}
                      </CanvasBtn>
                    ) : status === "suspended" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        disabled={isBusy}
                        onClick={() => void handleResume(program)}
                      >
                        {t("sandbox.suspend.action.resume")}
                      </CanvasBtn>
                    ) : (
                      <span style={{ width: 60 }} />
                    )}
                  </div>
                );
              })
            )}
          </CanvasCard>
        </div>

        <CanvasCard
          theme={theme}
          title={t("sandbox.suspend.effectsTitle")}
          subtitle={t("sandbox.suspend.effectsSubtitle")}
        >
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("sandbox.suspend.effectsBannerTitle")}
            body={t("sandbox.suspend.effectsBannerBody")}
          />
          <div style={{ marginTop: 12 }}>
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                {
                  k: t("sandbox.suspend.effects.vehicles"),
                  v: totalAffected,
                  mono: true,
                },
                {
                  k: t("sandbox.suspend.effects.notify"),
                  v: t("sandbox.suspend.effects.notifyValue"),
                },
                {
                  k: t("sandbox.suspend.effects.audit"),
                  v: t("sandbox.suspend.effects.auditValue"),
                },
              ]}
            />
          </div>
        </CanvasCard>
      </div>
    </>
  );
}
