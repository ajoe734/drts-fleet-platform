import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocProviderPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

export default async function ProviderPage() {
  const locale = await getServerLocale();
  const data = await getRocProviderPageData();

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        theme={rocTheme}
        title={t("provider.title", locale)}
        subtitle={t("provider.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {data.snapshot.items.map((item) => (
          <Card theme={rocTheme} key={item.providerCode} padding={16}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background:
                    item.status === "healthy"
                      ? rocTheme.success
                      : item.status === "down"
                        ? rocTheme.danger
                        : rocTheme.warn,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {item.displayName}
                </div>
                <div style={{ fontSize: 11.5, color: rocTheme.textMuted }}>
                  {item.message ?? "—"}
                </div>
              </div>
              <Pill
                theme={rocTheme}
                tone={
                  item.status === "healthy"
                    ? "success"
                    : item.status === "down"
                      ? "danger"
                      : "warn"
                }
                dot
              >
                {t(`providerStatus.${item.status}`, locale)}
              </Pill>
            </div>
          </Card>
        ))}
      </div>
      <Banner
        theme={rocTheme}
        tone="neutral"
        icon="info"
        body={t("provider.banner", locale)}
      />
    </div>
  );
}
