"use client";

import { useTranslation } from "@/lib/i18n";

export default function ReferralEmbedEntryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <main className="embed-system-error" role="alert">
      <section className="embed-system-error__card">
        <span className="eyebrow">{t("embed.systemError.eyebrow")}</span>
        <h1>{t("embed.systemError.title")}</h1>
        <p>{t("embed.systemError.body")}</p>
        {error.digest ? (
          <p className="embed-system-error__reference">
            {t("embed.systemError.reference", { reference: error.digest })}
          </p>
        ) : null}
        <button className="primary-link" type="button" onClick={reset}>
          {t("embed.systemError.retry")}
        </button>
      </section>
    </main>
  );
}
