import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function AlertsPage() {
  const locale = await getServerLocale();

  return (
    <RocResponseScreenHold
      locale={locale}
      title={t("alerts.title", locale)}
      subtitle={t("alerts.subtitle", locale)}
    />
  );
}
