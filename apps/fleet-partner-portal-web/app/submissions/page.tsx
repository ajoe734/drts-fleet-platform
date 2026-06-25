import { CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { SubmissionsClient } from "@/components/submissions-client";

export const dynamic = "force-dynamic";

export default async function FleetSubmissionsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("submissions.title", locale)}
        subtitle={t("submissions.subtitle", locale)}
      />
      <div style={{ padding: 24 }}>
        <SubmissionsClient locale={locale} theme={theme} />
      </div>
    </>
  );
}
