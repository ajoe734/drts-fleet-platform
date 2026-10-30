"use client";

import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

export function QualificationFilter({
  status,
  windowDays,
  locale: explicitLocale,
}: {
  status: string | undefined;
  windowDays: string | undefined;
  locale?: Locale;
}) {
  const { t } = useTranslation(explicitLocale);
  return (
    <form
      method="get"
      style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
    >
      <label>
        {t("qualifications.filter.status")}{" "}
        <select name="status" defaultValue={status ?? ""}>
          <option value="">{t("common.all")}</option>
          <option value="expired">{t("expiry.expired")}</option>
          <option value="expiring">{t("expiry.expiring")}</option>
          <option value="valid">{t("expiry.valid")}</option>
          <option value="unavailable">{t("expiry.unavailable")}</option>
        </select>
      </label>
      <label>
        {t("qualifications.filter.windowDays")}{" "}
        <input
          name="windowDays"
          type="number"
          min={0}
          max={365}
          defaultValue={windowDays ?? "30"}
        />
      </label>
      <button type="submit">{t("qualifications.filter.submit")}</button>
    </form>
  );
}
