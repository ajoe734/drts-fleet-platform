"use client";

import { errorMessage } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

export function ErrorNotice({
  status,
  error,
  locale: explicitLocale,
}: {
  status: number;
  error: { code: string | null; message: string | null } | null;
  locale?: Locale;
}) {
  const { locale } = useTranslation(explicitLocale);
  return (
    <p
      role="alert"
      style={{
        padding: 12,
        borderRadius: 8,
        background: "#fef2f2",
        color: "#991b1b",
      }}
    >
      {errorMessage(error, status, locale)}
    </p>
  );
}
