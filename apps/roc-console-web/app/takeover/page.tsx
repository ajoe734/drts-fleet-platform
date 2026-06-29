import { RocResponseScreenHold } from "@/components/roc-response-screen-hold";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function TakeoverPage() {
  const locale = await getServerLocale();
  return (
    <RocResponseScreenHold
      locale={locale}
      title={t("takeover.title", locale)}
      subtitle={t("takeover.subtitle", locale)}
    />
  );
}
