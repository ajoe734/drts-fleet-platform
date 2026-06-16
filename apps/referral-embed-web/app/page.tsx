import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

// The referral embed host has no standalone home — it is consumed only through
// the partner-scoped `/embed/[entrySlug]` webview. This minimal root keeps the
// service root reachable (health checks) without exposing a consumer surface.
export default async function ReferralEmbedRootPage() {
  const locale = await getServerLocale();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
        {t("app.title", undefined, locale)}
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", margin: 0, maxWidth: 420 }}>
        {t("app.description", undefined, locale)}
      </p>
    </main>
  );
}
