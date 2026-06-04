import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { AdapterRegistryRouteFrame } from "./components/AdapterRegistryRouteFrame";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return {
    title: t("adapterRegistry.metadata.title", locale),
    description: t("adapterRegistry.metadata.description", locale),
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return <AdapterRegistryRouteFrame>{children}</AdapterRegistryRouteFrame>;
}
