import Link from "next/link";
import { AIRPORT_BANKS, AIRPORT_BANK_ORDER } from "@/lib/airport-site-data";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "機場接送 Demo · 切換各銀行",
  description: "Demo 切換入口：四家銀行的卡友機場接送官網與網銀 App 內嵌頁面。",
};

// Simple demo switcher so the four per-bank airport-transfer sites (and their
// online-banking app embeds) can be opened quickly during a demo. This is a
// demo harness, NOT a product feature — in production each bank has its own
// separate site (there is no multi-bank master entry).
export default async function AirportDemoSwitcher() {
  const locale = await getServerLocale();
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0E1116",
        backgroundImage:
          "radial-gradient(circle at 50% 0,rgba(255,255,255,.06),transparent 60%)",
        color: "#fff",
        fontFamily: '"Noto Sans TC","Inter",system-ui,sans-serif',
        padding: "56px 20px 72px",
      }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#7E8696",
            marginBottom: 12,
          }}
        >
          {t("demo.eyebrow", undefined, locale)}
        </div>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            margin: "0 0 10px",
            letterSpacing: "-0.01em",
          }}
        >
          {t("demo.title", undefined, locale)}
        </h1>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.7,
            color: "#9AA2B1",
            margin: "0 0 36px",
            maxWidth: "44em",
          }}
        >
          {t("demo.body", undefined, locale)}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {AIRPORT_BANK_ORDER.map((id) => {
            const b = AIRPORT_BANKS[id];
            return (
              <div
                key={id}
                style={{
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 16,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                      background: `linear-gradient(150deg,${b.co.primary},${b.co.primaryDark})`,
                    }}
                  >
                    {b.mark.slice(0, 2)}
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {b.nameZh}
                    </div>
                    <div style={{ fontSize: 12, color: "#9AA2B1" }}>
                      {b.card} · {t("demo.remainLabel", undefined, locale)}{" "}
                      {b.quota.total - b.quota.used}/{b.quota.total}{" "}
                      {t("airport.unit.trips", undefined, locale)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <Link
                    href={`/${id}/program/site`}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px 12px",
                      borderRadius: 10,
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#fff",
                      background: b.co.primary,
                    }}
                  >
                    {t("demo.officialSite", undefined, locale)}
                  </Link>
                  <Link
                    href={`/${id}/program/embed`}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px 12px",
                      borderRadius: 10,
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#C4CAD6",
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid rgba(255,255,255,.12)",
                    }}
                  >
                    {t("demo.embed", undefined, locale)}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <p
          style={{
            fontSize: 12,
            color: "#6B7384",
            marginTop: 32,
            lineHeight: 1.6,
          }}
        >
          {t("demo.note", undefined, locale)}
        </p>
      </div>
    </main>
  );
}
