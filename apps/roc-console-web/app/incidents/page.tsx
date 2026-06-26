import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";

export default async function IncidentsPage() {
  const locale = await getServerLocale();
  return (
    <RocResponseScreenHold
      locale={locale}
      title={t("incidents.title", locale)}
      subtitle={t("incidents.subtitle", locale)}
    />
  );
}
