import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";

export default async function EvidencePage() {
  const locale = await getServerLocale();
  return (
    <RocResponseScreenHold
      locale={locale}
      title={t("evidence.title", locale)}
      subtitle={t("evidence.subtitle", locale)}
    />
  );
}
