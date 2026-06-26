import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";

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
