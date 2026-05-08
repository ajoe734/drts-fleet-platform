"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { getPlatformLabel } from "@/lib/localized-labels";
import {
  Shield,
  Users,
  Truck,
  Handshake,
  Radio,
  DollarSign,
  CreditCard,
  Activity,
  Bell,
  ClipboardList,
  Flag,
  LayoutDashboard,
  Languages,
  ShieldCheck, // Import ShieldCheck icon
} from "lucide-react";

export function AdminNav() {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";
  const { t, locale, setLocale } = useTranslation();

  const NAV_ITEMS = [
    { href: "/", label: t("nav.home"), icon: <LayoutDashboard size={16} /> },
    { href: "/tenants", label: t("nav.tenants"), icon: <Shield size={16} /> },
    {
      href: "/partners",
      label: t("nav.partners"),
      icon: <Handshake size={16} />,
    },
    { href: "/users", label: t("nav.users"), icon: <Users size={16} /> },
    { href: "/fleet", label: t("nav.fleet"), icon: <Truck size={16} /> },
    {
      href: "/switchboard",
      label: t("nav.switchboard"),
      icon: <Radio size={16} />,
    },
    {
      href: "/pricing",
      label: t("nav.pricing"),
      icon: <DollarSign size={16} />,
    },
    {
      href: "/payments",
      label: t("nav.payments"),
      icon: <CreditCard size={16} />,
    },
    { href: "/health", label: t("nav.health"), icon: <Activity size={16} /> },
    { href: "/notices", label: t("nav.notices"), icon: <Bell size={16} /> },
    {
      href: "/audit",
      label: t("nav.audit"),
      icon: <ClipboardList size={16} />,
    },
    {
      href: "/feature-flags",
      label: t("nav.featureFlags"),
      icon: <Flag size={16} />,
    },
    // New Navigation Item for Platform Adapter Registry
    {
      href: "/adapter-registry",
      label: t("nav.adapterRegistry"),
      icon: <ShieldCheck size={16} />, // Using ShieldCheck for adapter registry
    },
  ];

  return (
    <AppSidebar
      brand={t("app.name")}
      brandSub={t("app.sub")}
      brandIcon={<Shield size={16} color="white" />}
      navItems={NAV_ITEMS}
      currentPath={pathname}
      footer={
        <div style={{ display: "grid", gap: "8px" }}>
          <button
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            title={getPlatformLabel(locale, "switchLanguage")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              width: "100%",
              background: "#1d4ed8",
              border: "none",
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <Languages size={14} />
            {t("app.lang.toggle")}
          </button>
          <span
            style={{ fontSize: "11px", color: "#475569", textAlign: "center" }}
          >
            {t("app.env")}
          </span>
        </div>
      }
    />
  );
}
