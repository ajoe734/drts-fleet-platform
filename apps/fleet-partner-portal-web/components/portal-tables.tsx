"use client";

// Client-side table renderers for the Fleet Partner Portal.
//
// CanvasTable columns use `r: (row) => ReactNode` render functions. Those
// functions cannot be passed as props from a Server Component to a Client
// Component (the @drts/ui-web canvas primitives are "use client"), which
// crashes SSR. So the column definitions live here, in a client module, and
// the server pages pass only the serializable `rows`.

import {
  CanvasActionButton,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  type FleetCase,
  type FleetDoc,
  type FleetDriver,
  type FleetStatement,
  type FleetTrip,
  type FleetVehicle,
} from "@/lib/fleet-portal-fixtures";
import { useTranslation } from "@/lib/i18n";
import {
  BiLabel,
  SvcChip,
  SvcChips,
  formatFleetCodeLabel,
} from "@/lib/fleet-portal-ui";

export function DriversTable({ rows }: { rows: FleetDriver[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetDriver>[] = [
    {
      h: t("table.driver"),
      w: 170,
      r: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div
            style={{
              fontSize: 11,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.id} · {r.plate}
          </div>
        </div>
      ),
    },
    {
      h: t("table.status"),
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "available"
              ? "success"
              : r.status === "on_trip"
                ? "info"
                : r.status === "break"
                  ? "warn"
                  : "neutral"
          }
          dot
        >
          {formatFleetCodeLabel(locale, "driver.status", r.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.serviceEligibility"),
      w: 280,
      r: (r) => <SvcChips theme={theme} locale={locale} list={r.svc} />,
    },
    {
      h: t("table.license"),
      w: 120,
      r: (r) =>
        r.license === "valid" ? (
          <CanvasPill theme={theme} tone="success">
            {formatFleetCodeLabel(locale, "driver.license", r.license)}
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {formatFleetCodeLabel(locale, "driver.license", r.license)}
          </CanvasPill>
        ),
    },
    {
      h: t("table.docs"),
      w: 110,
      r: (r) =>
        r.docs === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            {formatFleetCodeLabel(locale, "driver.docs", r.docs)}
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {formatFleetCodeLabel(locale, "driver.docs", r.docs)}
          </CanvasPill>
        ),
    },
    {
      h: t("table.training"),
      w: 110,
      r: (r) =>
        r.training === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            {formatFleetCodeLabel(locale, "training.status", r.training)}
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {formatFleetCodeLabel(locale, "training.status", r.training)}
          </CanvasPill>
        ),
    },
    { h: t("table.trips30d"), k: "trips30", w: 90, mono: true, align: "right" },
    { h: t("table.rating"), k: "rating", w: 70, mono: true, align: "right" },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function VehiclesTable({ rows }: { rows: FleetVehicle[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetVehicle>[] = [
    {
      h: t("table.plate"),
      w: 120,
      mono: true,
      r: (r) => <span style={{ fontWeight: 600 }}>{r.plate}</span>,
    },
    { h: t("table.model"), k: "model", w: 160 },
    {
      h: t("table.year"),
      w: 70,
      mono: true,
      align: "right",
      r: (r) => (r.year > 0 ? r.year : "—"),
    },
    { h: t("table.driver"), k: "driver", w: 100 },
    {
      h: t("table.vehicleEligibility"),
      w: 260,
      r: (r) => <SvcChips theme={theme} locale={locale} list={r.svc} />,
    },
    {
      h: t("table.insurance"),
      w: 120,
      mono: true,
      r: (r) =>
        r.insurance === "valid" || r.insurance === "expired"
          ? formatFleetCodeLabel(locale, "vehicle.insurance", r.insurance)
          : r.insurance,
    },
    {
      h: t("table.inspection"),
      w: 120,
      r: (r) =>
        r.inspection === "ok" ? (
          <CanvasPill theme={theme} tone="success">
            {formatFleetCodeLabel(locale, "vehicle.inspection", r.inspection)}
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {formatFleetCodeLabel(locale, "vehicle.inspection", r.inspection)}
          </CanvasPill>
        ),
    },
    {
      h: t("table.status"),
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "active" ? "success" : "warn"}
          dot
        >
          {formatFleetCodeLabel(locale, "vehicle.status", r.status)}
        </CanvasPill>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

function tripColumns(
  theme: ReturnType<typeof buildFleetTheme>,
  locale: ReturnType<typeof useTranslation>["locale"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  const columns: CanvasTableColumn<FleetTrip>[] = [
    {
      h: t("table.order"),
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    {
      h: t("table.service"),
      w: 120,
      r: (r) => <SvcChip theme={theme} locale={locale} svc={r.svc} />,
    },
    { h: t("table.driver"), k: "driver", w: 100 },
    {
      h: t("table.tenant"),
      w: 160,
      r: (r) => (
        <div>
          <div style={{ fontFamily: theme.monoFamily }}>{r.tenant}</div>
          {r.sponsorFunded && (
            <div style={{ fontSize: 11, color: theme.textDim }}>
              {t("table.sponsorFundedTrip")}
              {r.benefitReference ? ` · ${r.benefitReference}` : ""}
            </div>
          )}
        </div>
      ),
    },
    { h: t("table.pickup"), k: "pickup", w: 220 },
    { h: t("table.fare"), k: "fare", w: 110, mono: true, align: "right" },
    {
      h: t("table.commission"),
      w: 140,
      align: "right",
      r: (r) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: theme.monoFamily }}>{r.commission}</div>
          {r.reimbursement && (
            <div style={{ fontSize: 11, color: theme.textDim }}>
              {t("table.reimbursementShort", { amount: r.reimbursement })}
            </div>
          )}
        </div>
      ),
    },
    {
      h: t("table.status"),
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "completed"
              ? "success"
              : r.status === "cancelled"
                ? "danger"
                : "info"
          }
          dot
        >
          {formatFleetCodeLabel(locale, "trip.status", r.status)}
        </CanvasPill>
      ),
    },
    { h: t("table.date"), k: "date", w: 110, mono: true },
  ];
  return columns;
}

export function TripsTable({ rows }: { rows: FleetTrip[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  return (
    <CanvasTable
      theme={theme}
      columns={tripColumns(theme, locale, t)}
      rows={rows}
    />
  );
}

// Dashboard recent-trips strip: same columns minus PICKUP/DATE per the design.
export function RecentTripsTable({ rows }: { rows: FleetTrip[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetTrip>[] = [
    { h: t("table.order"), k: "id", w: 110, mono: true },
    {
      h: t("table.service"),
      w: 120,
      r: (r) => <SvcChip theme={theme} locale={locale} svc={r.svc} />,
    },
    { h: t("table.driver"), k: "driver", w: 100 },
    {
      h: t("table.tenant"),
      w: 160,
      r: (r) => (
        <div>
          <div style={{ fontFamily: theme.monoFamily }}>{r.tenant}</div>
          {r.sponsorFunded && (
            <div style={{ fontSize: 11, color: theme.textDim }}>
              {t("table.sponsorFundedTrip")}
            </div>
          )}
        </div>
      ),
    },
    { h: t("table.fare"), k: "fare", w: 110, mono: true, align: "right" },
    {
      h: t("table.commission"),
      w: 140,
      align: "right",
      r: (r) => (
        <div style={{ textAlign: "right", fontFamily: theme.monoFamily }}>
          {r.commission}
        </div>
      ),
    },
    {
      h: t("table.status"),
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "completed"
              ? "success"
              : r.status === "cancelled"
                ? "danger"
                : "info"
          }
          dot
        >
          {formatFleetCodeLabel(locale, "trip.status", r.status)}
        </CanvasPill>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function StatementsTable({ rows }: { rows: FleetStatement[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetStatement>[] = [
    {
      h: t("table.statement"),
      w: 220,
      r: (r) => (
        <div>
          <div
            style={{
              color: theme.accent,
              fontWeight: 600,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.id}
          </div>
          {(r.sponsorFundedTrips || r.reimbursement) && (
            <div style={{ fontSize: 11, color: theme.textDim }}>
              {t("table.statementSponsorSummary", {
                trips: String(r.sponsorFundedTrips ?? 0),
                amount: r.reimbursement ?? "—",
              })}
            </div>
          )}
        </div>
      ),
    },
    { h: t("table.period"), k: "period", w: 120, mono: true },
    { h: t("table.trips"), k: "trips", w: 110, mono: true, align: "right" },
    { h: t("table.payable"), k: "payable", w: 160, mono: true, align: "right" },
    {
      h: t("table.status"),
      w: 150,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "paid" ? "success" : "warn"}
          dot
        >
          {formatFleetCodeLabel(locale, "statement.status", r.status)}
        </CanvasPill>
      ),
    },
    { h: t("table.issued"), k: "issued", w: 130, mono: true },
    {
      h: t("table.actions"),
      w: 220,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          {/* Download: BFF route returns a JSON artifact of the statement record.
              Stage 1 has no PDF/signed-URL endpoint; this route is the wire point
              for upgrading to a real PDF when that endpoint ships. */}
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{ action: "download", enabled: true, riskLevel: "low" }}
            label={t("actions.download")}
            en={locale === "zh" ? "download" : undefined}
            onClick={() => {
              window.open(
                `/api/fleet/statements/${encodeURIComponent(r.id)}/download`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          />
          {/* Confirm: disabled — no Stage 1 fleet-partner confirm endpoint. */}
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "confirm",
              enabled: false,
              disabledReasonCode: "no_endpoint",
              riskLevel: "high",
              requiresReason: true,
            }}
            label={t("actions.confirm")}
            en={locale === "zh" ? "confirm" : undefined}
          />
        </div>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function DocumentsTable({ rows }: { rows: FleetDoc[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetDoc>[] = [
    {
      h: t("table.driver"),
      w: 150,
      r: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.driver}</div>
          <div
            style={{
              fontSize: 11,
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {r.id}
          </div>
        </div>
      ),
    },
    {
      h: t("table.document"),
      w: 220,
      r: (r) => (
        <BiLabel
          theme={theme}
          locale={locale}
          zh={formatFleetCodeLabel("zh", "document.name", r.en, r.doc)}
          en={formatFleetCodeLabel("en", "document.name", r.en)}
        />
      ),
    },
    {
      h: t("table.status"),
      w: 160,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.status === "missing"
              ? "danger"
              : r.status === "pending_signature"
                ? "info"
                : "warn"
          }
          dot
        >
          {formatFleetCodeLabel(locale, "document.status", r.status)}
        </CanvasPill>
      ),
    },
    { h: t("table.due"), k: "due", w: 130, mono: true },
    {
      h: t("table.owner"),
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.owner === "fleet" ? "accent" : "neutral"}
        >
          {formatFleetCodeLabel(locale, "document.owner", r.owner)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.actions"),
      w: 200,
      r: (_r) => (
        <div style={{ display: "flex", gap: 4 }}>
          {/* Remind driver: disabled — no Stage 1 fleet-partner remind endpoint. */}
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "remind",
              enabled: false,
              disabledReasonCode: "no_endpoint",
              riskLevel: "low",
            }}
            label={t("actions.remindDriver")}
            en={locale === "zh" ? "remind" : undefined}
          />
          {/* Upload: disabled — no Stage 1 fleet-partner document upload endpoint. */}
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "upload",
              enabled: false,
              disabledReasonCode: "no_endpoint",
              riskLevel: "medium",
            }}
            label={t("actions.upload")}
            en={locale === "zh" ? "upload" : undefined}
          />
        </div>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function CasesTable({ rows }: { rows: FleetCase[] }) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<FleetCase>[] = [
    {
      h: t("table.case"),
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    {
      h: t("table.type"),
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.type === "incident" ? "danger" : "warn"}
        >
          {formatFleetCodeLabel(locale, "case.type", r.type)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.category"),
      w: 150,
      mono: true,
      r: (r) => formatFleetCodeLabel(locale, "case.category", r.cat),
    },
    { h: t("table.driver"), k: "driver", w: 100 },
    {
      h: t("table.severity"),
      w: 90,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.severity === "high"
              ? "danger"
              : r.severity === "medium"
                ? "warn"
                : "neutral"
          }
          dot
        >
          {formatFleetCodeLabel(locale, "case.severity", r.severity)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.responsibility"),
      w: 150,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={
            r.responsibility === "fleet"
              ? "danger"
              : r.responsibility === "shared"
                ? "warn"
                : "neutral"
          }
          dot
        >
          {formatFleetCodeLabel(
            locale,
            "case.responsibility",
            r.responsibility,
          )}
        </CanvasPill>
      ),
    },
    {
      h: t("table.sla"),
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.sla === "breached" ? "danger" : "success"}
          dot
        >
          {formatFleetCodeLabel(locale, "case.sla", r.sla)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.status"),
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "in_review" ? "info" : "warn"}
          dot
        >
          {formatFleetCodeLabel(locale, "case.status", r.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("table.actions"),
      w: 160,
      r: (_r) => (
        // Respond: disabled — no Stage 1 fleet-partner cases endpoint.
        <CanvasActionButton
          theme={theme}
          size="xs"
          descriptor={{
            action: "respond",
            enabled: false,
            disabledReasonCode: "no_endpoint",
            riskLevel: "medium",
          }}
          label={t("cases.action.respond")}
          en={locale === "zh" ? "respond" : undefined}
        />
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}
