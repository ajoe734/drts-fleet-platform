"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";

const hiddenTextStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} satisfies CSSProperties;

export function AdapterRegistryRouteFrame({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="adapter-registry-route-title">
      <div style={hiddenTextStyle}>
        <h1 id="adapter-registry-route-title">
          {t("adapterRegistry.pageTitle")}
        </h1>
        <p>{t("adapterRegistry.pageSubtitle")}</p>
      </div>
      {children}
    </section>
  );
}
