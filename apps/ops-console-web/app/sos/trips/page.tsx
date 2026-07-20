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

const mockTrips = [
  { id: "TRP-240720-0902", orderId: "ZX-240720-0186", status: "cancelled", start: "信義區松仁路 100 號附近", end: "大安區和平東路二段", time: "14:30:12" },
  { id: "TRP-240720-0899", orderId: "ZX-240720-0171", status: "in_progress", start: "中山區民生東路二段", end: "萬華區艋舺大道", time: "14:15:00" },
  { id: "TRP-240719-0744", orderId: "ZX-240719-0105", status: "completed", start: "內湖區瑞光路", end: "松山機場", time: "12:00:22" },
];

export default function SosTripsPage() {
  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>行程</span>
            <Pill theme={theme} tone="accent">行程管理</Pill>
          </div>
        }
        subtitle="智行叫車 · 預約制多元計程車歷史行程"
      />

      <div style={{ padding: 24 }}>
        <Card theme={theme} padding={0} title="多元計程車行程清單">
          <Table
            theme={theme}
            columns={[
              { h: "行程編號", k: "id", w: 150, mono: true },
              { h: "原始訂單", k: "orderId", w: 160, mono: true },
              { h: "狀態", k: "status", w: 110 },
              { h: "起點", k: "start", w: 220 },
              { h: "終點", k: "end", w: 220 },
              { h: "觸發時間", k: "time", w: 120, mono: true },
            ]}
            rows={mockTrips}
          />
        </Card>
      </div>
    </div>
  );
}
