"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import type {
  DriverPublicRegistrationCredential,
  VehiclePassengerDisclosureProfile,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type P5View = "disclosure" | "queue" | "fares";

type CorrectionQueueRow = Record<string, unknown> & {
  id: string;
  fleet: string;
  subject: string;
  missing: string;
  status: "pending" | "reviewing" | "returned" | "approved";
  submittedAt: string;
  updatedAt: string;
};

type FareVersionRow = Record<string, unknown> & {
  id: string;
  name: string;
  status: "draft" | "filed" | "active" | "retired";
  effectiveFrom: string;
  filingRef: string;
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  alignItems: "start",
};

const previewCardStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 14,
  background: theme.surfaceLo,
  display: "grid",
  gap: 8,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const queueSeed: CorrectionQueueRow[] = [
  {
    id: "cq-001",
    fleet: "大都會車隊",
    subject: "BKR-2208 · 車輛",
    missing: "車門數 · 車身顏色",
    status: "pending",
    submittedAt: "2026-07-14",
    updatedAt: "2026-07-18",
  },
  {
    id: "cq-002",
    fleet: "大都會車隊",
    subject: "吳明翰 · 駕駛",
    missing: "執登效期證明",
    status: "reviewing",
    submittedAt: "2026-07-15",
    updatedAt: "2026-07-19",
  },
  {
    id: "cq-003",
    fleet: "海線車隊",
    subject: "TXG-1180 · 車輛",
    missing: "出廠年份",
    status: "returned",
    submittedAt: "2026-07-10",
    updatedAt: "2026-07-16",
  },
  {
    id: "cq-004",
    fleet: "蘭陽小客車",
    subject: "游志豪 · 駕駛",
    missing: "—",
    status: "approved",
    submittedAt: "2026-07-08",
    updatedAt: "2026-07-12",
  },
];

const fareSeed: FareVersionRow[] = [
  {
    id: "F-2026-04",
    name: "2026 Q4 調整版",
    status: "filed",
    effectiveFrom: "2026-10-01",
    filingRef: "北市交運字第1130077號",
  },
  {
    id: "F-2026-03",
    name: "現行計費表",
    status: "active",
    effectiveFrom: "2026-07-01",
    filingRef: "北市交運字第1130042號",
  },
  {
    id: "F-2026-05",
    name: "夜間費率研議",
    status: "draft",
    effectiveFrom: "—",
    filingRef: "—",
  },
  {
    id: "F-2025-11",
    name: "2025 舊版",
    status: "retired",
    effectiveFrom: "2025-11-01",
    filingRef: "北市交運字第1120198號",
  },
];

const fallbackVehicle: VehiclePassengerDisclosureProfile = {
  vehicleId: "vehicle-001",
  make: "Toyota",
  model: "Corolla Altis",
  modelYear: 2024,
  doorCount: 4,
  color: "珍珠白",
  status: "complete",
  missingFieldCodes: [],
  verifiedByActorId: "platform-reviewer-001",
  verifiedAt: "2026-07-18T09:20:00.000Z",
  sourceSubmissionId: "submission-vehicle-001",
  version: 4,
  updatedAt: "2026-07-18T09:20:00.000Z",
};

const fallbackDriver: DriverPublicRegistrationCredential = {
  driverId: "drv-demo-001",
  registrationNo: "RE***01",
  registrationArea: "臺北市",
  effectiveFrom: "2025-01-01",
  effectiveUntil: "2027-12-31",
  status: "verified_active",
  maskedDisplay: "RE***01",
  verifiedByActorId: "platform-reviewer-001",
  verifiedAt: "2026-07-18T09:20:00.000Z",
  sourceSubmissionId: "submission-driver-001",
  version: 3,
  updatedAt: "2026-07-18T09:20:00.000Z",
};

function getMaskedRegistrationDisplay(
  credential: DriverPublicRegistrationCredential,
) {
  const masked = credential.maskedDisplay.trim();
  return masked.length > 0 ? masked : "—";
}

function statusTone(
  status: CorrectionQueueRow["status"] | FareVersionRow["status"],
): CanvasTone {
  switch (status) {
    case "approved":
    case "active":
      return "success";
    case "pending":
    case "draft":
      return "warn";
    case "reviewing":
    case "filed":
      return "info";
    case "returned":
      return "danger";
    case "retired":
    default:
      return "neutral";
  }
}

function requiresAnyScope(scopeSet: Set<string>, scopes: string[]) {
  return scopes.some((scope) => scopeSet.has(scope));
}

export function P5AdminConsole({ view }: { view: P5View }) {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const canReadRegistry = requiresAnyScope(scopeSet, ["reg.read", "reg.review"]);
  const canReviewRegistry = requiresAnyScope(scopeSet, ["reg.review"]);
  const [vehicle, setVehicle] =
    useState<VehiclePassengerDisclosureProfile>(fallbackVehicle);
  const [driver, setDriver] =
    useState<DriverPublicRegistrationCredential>(fallbackDriver);
  const [loading, setLoading] = useState(view === "disclosure");
  const [queueRows, setQueueRows] = useState(queueSeed);
  const maskedRegistrationDisplay = getMaskedRegistrationDisplay(driver);

  useEffect(() => {
    if (view !== "disclosure" || !canReadRegistry) {
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      try {
        const [vehicleProfile, driverCredential] = await Promise.all([
          client.get<VehiclePassengerDisclosureProfile>(
            "/api/regulatory-registry/vehicles/vehicle-001/disclosure-profile",
          ),
          client.get<DriverPublicRegistrationCredential>(
            "/api/regulatory-registry/drivers/drv-demo-001/registration-credential",
          ),
        ]);
        if (!active) {
          return;
        }
        setVehicle(vehicleProfile);
        setDriver({
          ...driverCredential,
          registrationNo: null,
          maskedDisplay: getMaskedRegistrationDisplay(driverCredential),
        });
      } catch {
        if (!active) {
          return;
        }
        setVehicle(fallbackVehicle);
        setDriver(fallbackDriver);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [canReadRegistry, client, view]);

  function actOnQueue(id: string, action: "return" | "approve") {
    setQueueRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              status: action === "approve" ? "approved" : "returned",
              updatedAt: "2026-07-21",
            }
          : row,
      ),
    );
  }

  if (!canReadRegistry) {
    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t(`p5.${view}.title`)}
          subtitle={t(`p5.${view}.subtitle`)}
        />
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title={t("p5.scope.locked.title")}
          body={t("p5.scope.locked.body")}
        />
      </div>
    );
  }

  if (view === "disclosure") {
    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.disclosure.title")}
          subtitle={t("p5.disclosure.subtitle")}
          actions={
            <div style={actionRowStyle}>
              <CanvasBtn theme={theme} disabled={!canReviewRegistry}>
                {t("p5.action.return")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="check"
                disabled={!canReviewRegistry}
              >
                {t("p5.action.approve")}
              </CanvasBtn>
            </div>
          }
        />
        {!canReviewRegistry ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            body={t("p5.scope.reviewOnly")}
          />
        ) : null}
        <div style={splitStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title={t("p5.disclosure.vehicleCard")}
              subtitle={t("p5.disclosure.vehicleSubtitle")}
            >
              {loading ? (
                <div>{t("p5.loading")}</div>
              ) : (
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    { k: t("p5.field.make"), v: vehicle.make },
                    { k: t("p5.field.model"), v: vehicle.model },
                    {
                      k: t("p5.field.modelYear"),
                      v: String(vehicle.modelYear),
                      mono: true,
                    },
                    {
                      k: t("p5.field.doorCount"),
                      v: String(vehicle.doorCount),
                      mono: true,
                    },
                    { k: t("p5.field.color"), v: vehicle.color ?? "—" },
                    {
                      k: t("p5.field.disclosureStatus"),
                      v: (
                        <CanvasPill theme={theme} tone="success" dot>
                          {vehicle.status}
                        </CanvasPill>
                      ),
                    },
                  ]}
                />
              )}
            </CanvasCard>
            <CanvasCard
              theme={theme}
              title={t("p5.disclosure.driverCard")}
              subtitle={t("p5.disclosure.driverSubtitle")}
            >
              {loading ? (
                <div>{t("p5.loading")}</div>
              ) : (
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("p5.field.registrationMasked"),
                      v: maskedRegistrationDisplay,
                      mono: true,
                    },
                    { k: t("p5.field.registrationArea"), v: driver.registrationArea ?? "—" },
                    {
                      k: t("p5.field.registrationUntil"),
                      v: driver.effectiveUntil ?? "—",
                      mono: true,
                    },
                    {
                      k: t("p5.field.registrationStatus"),
                      v: (
                        <CanvasPill
                          theme={theme}
                          tone={driver.status === "verified_active" ? "success" : "warn"}
                          dot
                        >
                          {driver.status}
                        </CanvasPill>
                      ),
                    },
                    { k: t("p5.field.reviewer"), v: driver.verifiedByActorId ?? "—" },
                    { k: t("p5.field.fullRegistrationStored"), v: t("p5.disclosure.backendOnly") },
                  ]}
                />
              )}
            </CanvasCard>
          </div>
          <CanvasCard
            theme={theme}
            title={t("p5.disclosure.previewCard")}
            subtitle={t("p5.disclosure.previewSubtitle")}
          >
            <div style={previewCardStyle}>
              <div style={{ fontWeight: 700, color: theme.text }}>
                {vehicle.make} {vehicle.model}
              </div>
              <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
                {vehicle.modelYear} 年出廠 · {vehicle.doorCount} 門 · {vehicle.color ?? "—"}
              </div>
              <div style={{ ...monoStyle, fontSize: 22, fontWeight: 700, color: theme.text }}>
                BKR-2208
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>吳明翰</strong>
                <CanvasPill theme={theme} tone="success">
                  {t("p5.disclosure.validBadge")}
                </CanvasPill>
              </div>
              <div style={{ ...monoStyle, color: theme.textMuted, fontSize: 11 }}>
                {maskedRegistrationDisplay} ·{" "}
                {t("p5.disclosure.validUntil", {
                  date: driver.effectiveUntil ?? "—",
                })}
              </div>
              <CanvasBanner
                theme={theme}
                tone="neutral"
                icon="lock"
                body={t("p5.disclosure.maskedNote")}
              />
            </div>
          </CanvasCard>
        </div>
      </div>
    );
  }

  if (view === "queue") {
    const columns: CanvasTableColumn<CorrectionQueueRow>[] = [
      { h: t("p5.queue.col.fleet"), k: "fleet", w: 140 },
      { h: t("p5.queue.col.subject"), k: "subject", w: 180 },
      { h: t("p5.queue.col.missing"), k: "missing", w: 180 },
      {
        h: t("p5.queue.col.status"),
        w: 110,
        r: (row) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {t(`p5.status.${row.status}`)}
          </CanvasPill>
        ),
      },
      { h: t("p5.queue.col.submitted"), k: "submittedAt", w: 110, mono: true },
      { h: t("p5.queue.col.updated"), k: "updatedAt", w: 110, mono: true },
      {
        h: "",
        w: 220,
        r: (row) => (
          <div style={actionRowStyle}>
            <CanvasBtn theme={theme} size="xs" variant="ghost" icon="eye">
              {t("p5.action.view")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              size="xs"
              disabled={!canReviewRegistry}
              onClick={() => actOnQueue(row.id, "return")}
            >
              {t("p5.action.return")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="primary"
              icon="check"
              disabled={!canReviewRegistry}
              onClick={() => actOnQueue(row.id, "approve")}
            >
              {t("p5.action.approve")}
            </CanvasBtn>
          </div>
        ),
      },
    ];

    return (
      <div style={pageBodyStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("p5.queue.title")}
          subtitle={t("p5.queue.subtitle")}
          meta={
            <CanvasPill theme={theme} tone="warn">
              {queueRows.filter((row) => row.status !== "approved").length}{" "}
              {t("p5.queue.pending")}
            </CanvasPill>
          }
        />
        {!canReviewRegistry ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            body={t("p5.scope.reviewOnly")}
          />
        ) : null}
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={columns} rows={queueRows} />
        </CanvasCard>
      </div>
    );
  }

  const fareColumns: CanvasTableColumn<FareVersionRow>[] = [
    { h: t("p5.fares.col.id"), k: "id", w: 120, mono: true },
    { h: t("p5.fares.col.name"), k: "name", w: 160 },
    {
      h: t("p5.fares.col.status"),
      w: 110,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {t(`p5.status.${row.status}`)}
        </CanvasPill>
      ),
    },
    { h: t("p5.fares.col.effectiveFrom"), k: "effectiveFrom", w: 120, mono: true },
    { h: t("p5.fares.col.filingRef"), k: "filingRef", w: 220, mono: true },
    {
      h: "",
      w: 120,
      r: (row) => (
        <CanvasBtn theme={theme} size="xs" variant={row.status === "filed" ? "primary" : "ghost"}>
          {row.status === "filed" ? t("p5.fares.schedule") : t("p5.fares.preview")}
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title={t("p5.fares.title")}
        subtitle={t("p5.fares.subtitle")}
        actions={
          <CanvasBtn theme={theme} variant="primary" icon="plus">
            {t("p5.fares.create")}
          </CanvasBtn>
        }
      />
      <div style={splitStyle}>
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable theme={theme} columns={fareColumns} rows={fareSeed} />
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title={t("p5.fares.previewCard")}
          subtitle={`F-2026-03 · ${t("p5.status.active")}`}
        >
          <CanvasDL
            theme={theme}
            cols={1}
            items={[
              { k: t("p5.fares.startingFare"), v: "NT$ 85", mono: true },
              { k: t("p5.fares.distanceFare"), v: "NT$ 5 / 200m", mono: true },
              { k: t("p5.fares.waitingFare"), v: "NT$ 5 / 80s", mono: true },
              { k: t("p5.fares.nightSurcharge"), v: "+20% · 23:00–06:00", mono: true },
            ]}
          />
          <div style={{ marginTop: 10 }}>
            <CanvasBanner
              theme={theme}
              tone="neutral"
              icon="info"
              body={t("p5.fares.previewNote")}
            />
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
