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

const mockRecords = [
  { id: "REC-240720-0012", operator: "王小明", action: "acknowledge_sos", target: "SOS-20260720-0012", time: "14:31:02" },
  { id: "REC-240720-0011", operator: "王小明", action: "start_investigation", target: "SOS-20260720-0011", time: "14:20:00" },
  { id: "REC-240719-0009", operator: "陳雅雯", action: "close_sos_false_alarm", target: "SOS-20260719-0009", time: "13:05:15" },
];

export default function SosRecordsPage() {
  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>營運紀錄</span>
            <Pill theme={theme} tone="accent">稽核追蹤</Pill>
          </div>
        }
        subtitle="值班安全人員與系統操作稽核紀錄"
      />

      <div style={{ padding: 24 }}>
        <Card theme={theme} padding={0} title="值班室操作日誌">
          <Table
            theme={theme}
            columns={[
              { h: "日誌編號", k: "id", w: 140, mono: true },
              { h: "操作值班員", k: "operator", w: 120 },
              { h: "動作類型", k: "action", w: 180, mono: true },
              { h: "目標事件", k: "target", w: 160, mono: true },
              { h: "時間", k: "time", w: 120, mono: true },
            ]}
            rows={mockRecords}
          />
        </Card>
      </div>
    </div>
  );
}
