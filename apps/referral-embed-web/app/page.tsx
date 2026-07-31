import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { redirect } from "next/navigation";

// A deployed environment may publish one canonical partner entry. In that case
// the service root opens the real product surface instead of a health-only
// placeholder. Local development keeps the placeholder when no default is set.
export default async function ReferralEmbedRootPage() {
  const defaultEntrySlug =
    process.env.REFERRAL_EMBED_DEFAULT_ENTRY_SLUG?.trim();

  if (defaultEntrySlug) {
    redirect(`/embed/${encodeURIComponent(defaultEntrySlug)}`);
  }

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
