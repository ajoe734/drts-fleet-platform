import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

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
