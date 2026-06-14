"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type { TenantPortalNavItem } from "@/lib/rbac";

type TenantPortalChromeProps = {
  children: ReactNode;
  navItems: TenantPortalNavItem[];
  footer?: ReactNode;
};

export function TenantPortalChrome({
  children,
  navItems,
  footer,
}: TenantPortalChromeProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const showSidebar = pathname !== "/login" && navItems.length > 0;

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        minHeight: "100vh",
      }}
    >
      <AppSidebar
        brand={t("shell.brand")}
        brandSub={t("shell.brandSub")}
        navItems={navItems}
        currentPath={pathname}
        footer={footer}
      />
      <div>{children}</div>
    </div>
  );
}
