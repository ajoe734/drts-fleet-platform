import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return {
    title: t("adapterRegistry.metadata.title", locale),
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
