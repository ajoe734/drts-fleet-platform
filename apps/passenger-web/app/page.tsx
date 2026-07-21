import Link from "next/link";
import {
  getPassengerFixtureSourceLabel,
  passengerChrome,
} from "@/lib/passenger-presentation";

export default function PassengerRootPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: `linear-gradient(180deg, ${passengerChrome.background} 0%, ${passengerChrome.info.bg} 100%)`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          padding: 24,
          background: passengerChrome.card,
          border: `1px solid ${passengerChrome.border}`,
          boxShadow: passengerChrome.shadow,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: passengerChrome.shell,
          }}
        >
          智行叫車
        </div>
        <h1 style={{ margin: "8px 0 10px", fontSize: 24 }}>
          Passenger ride surface
        </h1>
        <p style={{ margin: 0, color: passengerChrome.muted, lineHeight: 1.6 }}>
          以 token 路徑瀏覽 `P5-01..12` 與公開計費頁。預設資料來源：
          {getPassengerFixtureSourceLabel("fixture")}.
        </p>
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <Link
            href="/ride/demo-token"
            style={{
              display: "flex",
              justifyContent: "center",
              borderRadius: 14,
              padding: "13px 16px",
              background: passengerChrome.shell,
              color: passengerChrome.invert,
              fontWeight: 700,
            }}
          >
            開啟行程頁
          </Link>
          <Link
            href="/ride/demo-token/fares"
            style={{
              display: "flex",
              justifyContent: "center",
              borderRadius: 14,
              padding: "13px 16px",
              border: `1px solid ${passengerChrome.borderStrong}`,
              color: passengerChrome.text,
              fontWeight: 700,
            }}
          >
            開啟計費說明
          </Link>
        </div>
      </div>
    </main>
  );
}
