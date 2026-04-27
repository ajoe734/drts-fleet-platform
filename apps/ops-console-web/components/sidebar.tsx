"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { getOpsLabel } from "@/lib/localized-labels";
import {
  LayoutDashboard,
  Truck,
  Users,
  FileText,
  Flag,
  Clock,
  Radio,
  MessageSquareWarning,
  Phone,
  BarChart3,
  DollarSign,
  AlertTriangle,
  Wrench,
  Languages,
} from "lucide-react";

export function Sidebar() {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";
  const { t, locale, setLocale } = useTranslation();

  const NAV = [
    {
      href: "/dashboard",
      label: t("nav.dashboard"),
      icon: <LayoutDashboard size={16} />,
    },
    { href: "/dispatch", label: t("nav.dispatch"), icon: <Truck size={16} /> },
    {
      href: "/complaints",
      label: t("nav.complaints"),
      icon: <MessageSquareWarning size={16} />,
    },
    {
      href: "/callcenter",
      label: t("nav.callcenter"),
      icon: <Phone size={16} />,
    },
    {
      href: "/reports",
      label: t("nav.reports"),
      icon: <BarChart3 size={16} />,
    },
    {
      href: "/revenue",
      label: t("nav.revenue"),
      icon: <DollarSign size={16} />,
    },
    {
      href: "/attendance",
      label: t("nav.attendance"),
      icon: <Clock size={16} />,
    },
    {
      href: "/incidents",
      label: t("nav.incidents"),
      icon: <AlertTriangle size={16} />,
    },
    {
      href: "/maintenance",
      label: t("nav.maintenance"),
      icon: <Wrench size={16} />,
    },
    {
      href: "/vehicles",
      label: t("nav.vehicles"),
      icon: <Truck size={16} />,
    },
    { href: "/drivers", label: t("nav.drivers"), icon: <Users size={16} /> },
    {
      href: "/contracts",
      label: t("nav.contracts"),
      icon: <FileText size={16} />,
    },
    {
      href: "/feature-flags",
      label: t("nav.featureFlags"),
      icon: <Flag size={16} />,
    },
  ];

  return (
    <AppSidebar
      brand={t("app.name")}
      brandSub={t("app.sub")}
      brandIcon={<Radio size={16} color="white" />}
      navItems={NAV}
      currentPath={pathname}
      footer={
        <div style={{ display: "grid", gap: "8px" }}>
          <button
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            title={getOpsLabel(locale, "switchLanguage")}
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
