"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ManagementShell } from "@drts/ui-web/client";
import { MANAGEMENT_COLORS, type ManagementSidebarSection } from "@drts/ui-web";
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
  ShieldAlert,
} from "lucide-react";

type SidebarProps = {
  children: ReactNode;
};

export function Sidebar({ children }: SidebarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";
  const { t, locale, setLocale } = useTranslation();

  const sectionTitles =
    locale === "zh"
      ? {
          workspace: "工作面",
          dispatch: "即時派遣",
          casework: "案件處理",
          monitoring: "營運監控",
          master: "主資料",
        }
      : {
          workspace: "Workspace",
          dispatch: "Realtime Dispatch",
          casework: "Case Handling",
          monitoring: "Operations Monitoring",
          master: "Master Data",
        };

  const sections: ManagementSidebarSection[] = [
    {
      key: "workspace",
      title: sectionTitles.workspace,
      items: [
        {
          href: "/dashboard",
          label: t("nav.dashboard"),
          icon: <LayoutDashboard size={16} />,
          badge: "4",
          badgeTone: "warning",
        },
      ],
    },
    {
      key: "dispatch",
      title: sectionTitles.dispatch,
      items: [
        {
          href: "/dispatch",
          label: t("nav.dispatch"),
          icon: <Truck size={16} />,
          badge: "23",
          badgeTone: "accent",
        },
        {
          href: "/callcenter",
          label: t("nav.callcenter"),
          icon: <Phone size={16} />,
          badge: "5",
          badgeTone: "info",
        },
      ],
    },
    {
      key: "casework",
      title: sectionTitles.casework,
      items: [
        {
          href: "/complaints",
          label: t("nav.complaints"),
          icon: <MessageSquareWarning size={16} />,
          badge: "3",
          badgeTone: "danger",
        },
        {
          href: "/incidents",
          label: t("nav.incidents"),
          icon: <AlertTriangle size={16} />,
          badge: "1",
          badgeTone: "danger",
        },
      ],
    },
    {
      key: "monitoring",
      title: sectionTitles.monitoring,
      items: [
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
          href: "/maintenance",
          label: t("nav.maintenance"),
          icon: <Wrench size={16} />,
        },
        {
          href: "/approval-requests",
          label: t("nav.approvalRequests"),
          icon: <ShieldAlert size={16} />,
        },
      ],
    },
    {
      key: "master",
      title: sectionTitles.master,
      items: [
        {
          href: "/drivers",
          label: t("nav.drivers"),
          icon: <Users size={16} />,
        },
        {
          href: "/vehicles",
          label: t("nav.vehicles"),
          icon: <Truck size={16} />,
        },
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
      ],
    },
  ];

  return (
    <ManagementShell
      sidebar={{
        brand: t("app.name"),
        brandSub: t("app.sub"),
        brandIcon: <Radio size={16} color="white" />,
        sections,
        currentPath: pathname,
        footer: (
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
              style={{
                fontSize: "11px",
                color: "#475569",
                textAlign: "center",
              }}
            >
              {t("app.env")}
            </span>
          </div>
        ),
      }}
    >
      {children}
    </ManagementShell>
  );
}
