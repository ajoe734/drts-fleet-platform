import type { CSSProperties } from "react";
import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const bodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 16,
  alignItems: "start",
};

function shimmerStyle(height: number): CSSProperties {
  return {
    height,
    borderRadius: 7,
    background: th.bgRaised,
    border: `1px solid ${th.border}`,
    opacity: 0.6,
  };
}

// Loading state variant (§5.4) — streamed while the booking read model loads.
export default function BookingDetailLoading() {
  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="載入訂單詳情…"
        subtitle="正在取得 tenant booking 讀取模型"
      />
      <div style={bodyStyle}>
        <div style={shimmerStyle(28)} />
        <div style={gridStyle}>
          <CanvasCard theme={th} title="行程資訊">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={shimmerStyle(14)} />
              <div style={shimmerStyle(14)} />
              <div style={shimmerStyle(14)} />
              <div style={shimmerStyle(14)} />
            </div>
          </CanvasCard>
          <CanvasCard theme={th} title="駕駛">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={shimmerStyle(14)} />
              <div style={shimmerStyle(14)} />
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
