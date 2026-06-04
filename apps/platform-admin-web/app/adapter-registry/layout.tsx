"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";

export default function Layout({ children }: { children: ReactNode }) {
  const { locale, t } = useTranslation();

  useEffect(() => {
    document.title = t("adapterRegistry.meta.title");
  }, [locale, t]);

  return <>{children}</>;
}
