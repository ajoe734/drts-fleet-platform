"use client";

import Link from "next/link";
import { CanvasPill, CanvasTable, type CanvasTableColumn } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import type {
  ReferralStatementLineView,
  ReferralStatementView,
  ReferralUsageDailyRow,
  ReferralUsagePeriod,
} from "@/lib/referral-portal-fixtures";
import { useTranslation } from "@/lib/i18n";
import { formatFleetCodeLabel } from "@/lib/fleet-portal-ui";

function statementTone(status: ReferralStatementView["status"]) {
  if (status === "paid") {
    return "success" as const;
  }
  if (status === "due") {
    return "warn" as const;
  }
  return "info" as const;
}

export function ReferralUsagePeriodsTable({
  rows,
}: {
  rows: ReferralUsagePeriod[];
}) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<ReferralUsagePeriod>[] = [
    { h: t("table.period"), k: "period", w: 120, mono: true },
    {
      h: t("referral.table.activeUsers"),
      k: "activeUsers",
      w: 130,
      mono: true,
      align: "right",
    },
    { h: t("table.trips"), k: "trips", w: 120, mono: true, align: "right" },
    { h: t("referral.table.gmv"), k: "gmv", w: 160, mono: true, align: "right" },
    {
      h: t("referral.usage.avgTripsPerUser"),
      k: "avgTripsPerUser",
      w: 140,
      mono: true,
      align: "right",
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function ReferralUsageDailyTable({
  rows,
}: {
  rows: ReferralUsageDailyRow[];
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const columns: CanvasTableColumn<ReferralUsageDailyRow>[] = [
    { h: t("referral.table.day"), k: "day", w: 140, mono: true },
    {
      h: t("referral.table.activeUsers"),
      k: "users",
      w: 130,
      mono: true,
      align: "right",
    },
    { h: t("table.trips"), k: "trips", w: 120, mono: true, align: "right" },
    { h: t("referral.table.gmv"), k: "gmv", w: 160, mono: true, align: "right" },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function ReferralTripLinesTable({
  rows,
}: {
  rows: ReferralStatementLineView[];
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const columns: CanvasTableColumn<ReferralStatementLineView>[] = [
    {
      h: t("referral.table.trip"),
      k: "trip",
      w: 130,
      mono: true,
      r: (r) => <span style={{ color: theme.accent, fontWeight: 600 }}>{r.trip}</span>,
    },
    { h: t("table.date"), k: "date", w: 110, mono: true },
    { h: t("referral.table.route"), k: "route", w: 260 },
    {
      h: t("referral.table.rider"),
      k: "rider",
      w: 130,
      mono: true,
      r: (r) => <span style={{ color: theme.textDim }}>{r.rider}</span>,
    },
    { h: t("table.fare"), k: "fare", w: 110, mono: true, align: "right" },
    {
      h: t("referral.table.share"),
      k: "share",
      w: 120,
      mono: true,
      align: "right",
      r: (r) => <span style={{ color: theme.accent, fontWeight: 600 }}>{r.share}</span>,
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function ReferralStatementsTable({
  rows,
}: {
  rows: ReferralStatementView[];
}) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const columns: CanvasTableColumn<ReferralStatementView>[] = [
    {
      h: t("referral.table.statementId"),
      w: 270,
      r: (r) => (
        <div>
          <Link
            href={`/referral/statements/${encodeURIComponent(r.period)}`}
            style={{
              color: theme.accent,
              fontWeight: 600,
              fontFamily: theme.monoFamily,
              textDecoration: "none",
            }}
          >
            {r.id}
          </Link>
          <div style={{ fontSize: 11, color: theme.textDim }}>{r.artifactId}</div>
        </div>
      ),
    },
    { h: t("table.period"), k: "period", w: 110, mono: true },
    { h: t("table.trips"), k: "trips", w: 90, mono: true, align: "right" },
    {
      h: t("referral.statements.activeUsers"),
      k: "activeUsers",
      w: 120,
      mono: true,
      align: "right",
    },
    { h: t("referral.table.gmv"), k: "gmv", w: 150, mono: true, align: "right" },
    {
      h: t("referral.statements.share"),
      k: "share",
      w: 160,
      mono: true,
      align: "right",
      r: (r) => <span style={{ color: theme.accent, fontWeight: 700 }}>{r.share}</span>,
    },
    {
      h: t("table.status"),
      w: 120,
      r: (r) => (
        <CanvasPill theme={theme} tone={statementTone(r.status)} dot>
          {formatFleetCodeLabel(locale, "referral.statement.status", r.status)}
        </CanvasPill>
      ),
    },
    { h: t("table.issued"), k: "issued", w: 120, mono: true },
    {
      h: t("table.actions"),
      w: 130,
      r: (r) => (
        <Link
          href={`/referral/statements/${encodeURIComponent(r.period)}`}
          style={{ color: theme.accent, textDecoration: "none", fontWeight: 600 }}
        >
          {t("referral.actions.viewDetail")}
        </Link>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}
