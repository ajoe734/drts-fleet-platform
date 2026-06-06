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
import { BiLabel, SvcChip, SvcChips } from "@/lib/fleet-portal-ui";

export function DriversTable({ rows }: { rows: FleetDriver[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetDriver>[] = [
    {
      h: "DRIVER",
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
      h: "STATUS",
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
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "可接服務 · service eligibility",
      w: 280,
      r: (r) => <SvcChips theme={theme} list={r.svc} />,
    },
    {
      h: "LICENSE",
      w: 120,
      r: (r) =>
        r.license === "valid" ? (
          <CanvasPill theme={theme} tone="success">
            valid
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.license}
          </CanvasPill>
        ),
    },
    {
      h: "DOCS",
      w: 110,
      r: (r) =>
        r.docs === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            complete
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.docs}
          </CanvasPill>
        ),
    },
    {
      h: "TRAINING",
      w: 110,
      r: (r) =>
        r.training === "complete" ? (
          <CanvasPill theme={theme} tone="success">
            complete
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.training}
          </CanvasPill>
        ),
    },
    { h: "30天趟次", k: "trips30", w: 90, mono: true, align: "right" },
    { h: "評分", k: "rating", w: 70, mono: true, align: "right" },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function VehiclesTable({ rows }: { rows: FleetVehicle[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetVehicle>[] = [
    {
      h: "PLATE",
      w: 120,
      mono: true,
      r: (r) => <span style={{ fontWeight: 600 }}>{r.plate}</span>,
    },
    { h: "MODEL", k: "model", w: 160 },
    { h: "YEAR", k: "year", w: 70, mono: true, align: "right" },
    { h: "DRIVER", k: "driver", w: 100 },
    {
      h: "可接服務 · vehicle eligibility",
      w: 260,
      r: (r) => <SvcChips theme={theme} list={r.svc} />,
    },
    { h: "INSURANCE", k: "insurance", w: 120, mono: true },
    {
      h: "INSPECTION",
      w: 120,
      r: (r) =>
        r.inspection === "ok" ? (
          <CanvasPill theme={theme} tone="success">
            ok
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.inspection}
          </CanvasPill>
        ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "active" ? "success" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

function tripColumns(theme: ReturnType<typeof buildFleetTheme>) {
  const columns: CanvasTableColumn<FleetTrip>[] = [
    {
      h: "ORDER",
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    { h: "SERVICE", w: 120, r: (r) => <SvcChip theme={theme} svc={r.svc} /> },
    { h: "DRIVER", k: "driver", w: 100 },
    { h: "TENANT", k: "tenant", w: 130, mono: true },
    { h: "PICKUP", k: "pickup", w: 220 },
    { h: "FARE", k: "fare", w: 110, mono: true, align: "right" },
    { h: "車行分潤", k: "commission", w: 110, mono: true, align: "right" },
    {
      h: "STATUS",
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
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "DATE", k: "date", w: 110, mono: true },
  ];
  return columns;
}

export function TripsTable({ rows }: { rows: FleetTrip[] }) {
  const theme = buildFleetTheme();
  return <CanvasTable theme={theme} columns={tripColumns(theme)} rows={rows} />;
}

// Dashboard recent-trips strip: same columns minus PICKUP/DATE per the design.
export function RecentTripsTable({ rows }: { rows: FleetTrip[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetTrip>[] = [
    { h: "ORDER", k: "id", w: 110, mono: true },
    { h: "SERVICE", w: 120, r: (r) => <SvcChip theme={theme} svc={r.svc} /> },
    { h: "DRIVER", k: "driver", w: 100 },
    { h: "TENANT", k: "tenant", w: 130, mono: true },
    { h: "FARE", k: "fare", w: 110, mono: true, align: "right" },
    { h: "車行分潤", k: "commission", w: 110, mono: true, align: "right" },
    {
      h: "STATUS",
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
          {r.status}
        </CanvasPill>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function StatementsTable({ rows }: { rows: FleetStatement[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetStatement>[] = [
    {
      h: "STATEMENT",
      k: "id",
      w: 180,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    { h: "PERIOD", k: "period", w: 120, mono: true },
    { h: "TRIPS", k: "trips", w: 110, mono: true, align: "right" },
    { h: "PAYABLE", k: "payable", w: 160, mono: true, align: "right" },
    {
      h: "STATUS",
      w: 150,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "paid" ? "success" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "ISSUED", k: "issued", w: 130, mono: true },
    {
      h: "ACTIONS",
      w: 180,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{ action: "download", enabled: true, riskLevel: "low" }}
            label="下載"
            en="dl"
          />
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "confirm",
              enabled: r.status !== "paid",
              disabledReasonCode: "already_paid",
              riskLevel: "high",
              requiresReason: true,
            }}
            label="確認"
            en="confirm"
          />
        </div>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function DocumentsTable({ rows }: { rows: FleetDoc[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetDoc>[] = [
    {
      h: "DRIVER",
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
      h: "DOCUMENT",
      w: 220,
      r: (r) => <BiLabel theme={theme} zh={r.doc} en={r.en} />,
    },
    {
      h: "STATUS",
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
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "DUE", k: "due", w: 130, mono: true },
    {
      h: "OWNER",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.owner === "fleet" ? "accent" : "neutral"}
        >
          {r.owner}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 200,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{ action: "remind", enabled: true, riskLevel: "low" }}
            label="提醒司機"
            en="remind"
          />
          <CanvasActionButton
            theme={theme}
            size="xs"
            descriptor={{
              action: "upload",
              enabled: r.owner === "fleet",
              disabledReasonCode: "driver_owned",
              riskLevel: "medium",
            }}
            label="上傳"
            en="upload"
          />
        </div>
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}

export function CasesTable({ rows }: { rows: FleetCase[] }) {
  const theme = buildFleetTheme();
  const columns: CanvasTableColumn<FleetCase>[] = [
    {
      h: "CASE",
      k: "id",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.id}</span>
      ),
    },
    {
      h: "TYPE",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.type === "incident" ? "danger" : "warn"}
        >
          {r.type}
        </CanvasPill>
      ),
    },
    { h: "CATEGORY", k: "cat", w: 150, mono: true },
    { h: "DRIVER", k: "driver", w: 100 },
    {
      h: "SEV",
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
          {r.severity}
        </CanvasPill>
      ),
    },
    {
      h: "責任歸屬 · responsibility",
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
          {r.responsibility}
        </CanvasPill>
      ),
    },
    {
      h: "SLA",
      w: 110,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.sla === "breached" ? "danger" : "success"}
          dot
        >
          {r.sla}
        </CanvasPill>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "in_review" ? "info" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (r) => (
        <CanvasActionButton
          theme={theme}
          size="xs"
          descriptor={{
            action: "respond",
            enabled: r.responsibility !== "platform",
            disabledReasonCode: "platform_owned",
            riskLevel: "medium",
          }}
          label="回覆處理"
          en="respond"
        />
      ),
    },
  ];
  return <CanvasTable theme={theme} columns={columns} rows={rows} />;
}
