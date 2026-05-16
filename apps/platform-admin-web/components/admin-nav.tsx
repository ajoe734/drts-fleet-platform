"use client";

import { usePathname } from "next/navigation";
import { AppSidebar, MANAGEMENT_COLORS } from "@drts/ui-web";
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

  const labels =
    locale === "en"
      ? {
          home: "Governance Home",
          health: "Platform Health",
          tenantGovernance: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner Entry",
          users: "Platform Staff",
          fleet: "Fleet & Compliance",
          switchboard: "Public Info & Placards",
          pricing: "Pricing",
          payments: "Settlement Governance",
          notices: "Notices & Maintenance",
          audit: "Audit & Evidence",
          featureFlags: "Feature Flags",
          adapterRegistry: "Adapter Registry",
        }
      : {
          home: "工作首頁",
          health: "平台健康",
          tenantGovernance: "租戶治理總覽",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricing: "計價",
          payments: "結算治理",
          notices: "公告與維護",
          audit: "稽核與證據",
          featureFlags: "功能旗標",
          adapterRegistry: "介接登錄",
        };

  const NAV_ITEMS = [
    { href: "/", label: labels.home, icon: <LayoutDashboard size={16} /> },
    { href: "/health", label: labels.health, icon: <Activity size={16} /> },
    {
      href: "/tenant-governance",
      label: labels.tenantGovernance,
      icon: <ShieldCheck size={16} />,
    },
    { href: "/tenants", label: labels.tenants, icon: <Shield size={16} /> },
    {
      href: "/partners",
      label: labels.partners,
      icon: <Handshake size={16} />,
    },
    { href: "/users", label: labels.users, icon: <Users size={16} /> },
    { href: "/fleet", label: labels.fleet, icon: <Truck size={16} /> },
    {
      href: "/switchboard",
      label: labels.switchboard,
      icon: <Radio size={16} />,
    },
    {
      href: "/pricing",
      label: labels.pricing,
      icon: <DollarSign size={16} />,
    },
    {
      href: "/payments",
      label: labels.payments,
      icon: <CreditCard size={16} />,
    },
    { href: "/notices", label: labels.notices, icon: <Bell size={16} /> },
    {
      href: "/audit",
      label: labels.audit,
      icon: <ClipboardList size={16} />,
    },
    {
      href: "/feature-flags",
      label: labels.featureFlags,
      icon: <Flag size={16} />,
    },
    {
      href: "/adapter-registry",
      label: labels.adapterRegistry,
      icon: <ShieldCheck size={16} />,
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
              background: MANAGEMENT_COLORS.sidebarActive,
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
