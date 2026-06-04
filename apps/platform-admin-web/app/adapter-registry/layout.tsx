"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import { t as translate } from "@/lib/translations";

export default function Layout({ children }: { children: ReactNode }) {
  const { locale } = useTranslation();

  useEffect(() => {
    document.title = translate("adapterRegistry.meta.title", locale);
  }, [locale]);

  return <>{children}</>;
}
