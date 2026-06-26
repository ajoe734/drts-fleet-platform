import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

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
