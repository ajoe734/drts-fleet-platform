"use client";

import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const mockJobs = [
  { id: "ZX-Job-1002", orderId: "ZX-240720-0186", status: "exception_hold", driver: "吳明翰", plate: "BKR-2208", time: "14:30:12", eta: "5m" },
  { id: "ZX-Job-1001", orderId: "ZX-240720-0171", status: "dispatched", driver: "林建成", plate: "TDK-9317", time: "14:15:00", eta: "8m" },
  { id: "ZX-Job-0998", orderId: "ZX-240719-0105", status: "completed", driver: "張志豪", plate: "AKQ-5566", time: "12:00:22", eta: "—" },
];

export default function SosBoardPage() {
  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>派車看板</span>
            <Pill theme={theme} tone="accent">多元計程車專用</Pill>
          </div>
        }
        subtitle="智行叫車 · 即時派車調度看板"
      />

      <div style={{ padding: 24 }}>
        <Card theme={theme} padding={0} title="即時派遣狀態">
          <Table
            theme={theme}
            columns={[
              { h: "任務編號", k: "id", w: 120, mono: true },
              { h: "行程編號", k: "orderId", w: 160, mono: true },
              { h: "狀態", k: "status", w: 130 },
              { h: "駕駛", k: "driver", w: 100 },
              { h: "車牌", k: "plate", w: 100, mono: true },
              { h: "時間", k: "time", w: 120, mono: true },
              { h: "預估到達", k: "eta", w: 90 },
            ]}
            rows={mockJobs}
          />
        </Card>
      </div>
    </div>
  );
}
