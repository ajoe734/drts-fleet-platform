import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  return (
    <RocResponseScreenHold
      locale={locale}
      title={t("reports.title", locale)}
      subtitle={t("reports.subtitle", locale)}
    />
  );
}
