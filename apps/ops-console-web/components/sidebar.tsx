"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ManagementShell } from "@drts/ui-web/client";
import {
  MANAGEMENT_COLOR_MODES,
  type ManagementSidebarSection,
} from "@drts/ui-web";
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

type SidebarProps = {
  children: ReactNode;
};

const WINDOW_HEIGHT =
  "calc(100dvh - var(--ops-console-pad) - var(--ops-console-pad) - var(--ops-console-toolbar-height))";

export function Sidebar({ children }: SidebarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";
  const sidebarPath = pathname === "/" ? "/dashboard" : pathname;
  const { t, locale, setLocale } = useTranslation();
  const chromeUrl =
    pathname === "/" || pathname === "/dashboard"
      ? "ops.drts.io"
      : `ops.drts.io${pathname}`;

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
          matchPaths: ["/"],
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
    <div className="ops-console-window">
      <div className="ops-console-window__frame">
        <div className="ops-console-window__toolbar">
          <div
            className="ops-console-window__traffic-lights"
            aria-hidden="true"
          >
            <span className="ops-console-window__traffic-light ops-console-window__traffic-light--close" />
            <span className="ops-console-window__traffic-light ops-console-window__traffic-light--minimize" />
            <span className="ops-console-window__traffic-light ops-console-window__traffic-light--maximize" />
          </div>
          <div className="ops-console-window__title-stack">
            <span className="ops-console-window__title">DRTS OPS CONSOLE</span>
            <span className="ops-console-window__url" title={chromeUrl}>
              {chromeUrl}
            </span>
          </div>
          <span className="ops-console-window__meta">{t("app.sub")}</span>
        </div>

        <ManagementShell
          mode="dark"
          density="compact"
          style={{ minHeight: WINDOW_HEIGHT }}
          sidebar={{
            brand: t("app.name"),
            brandSub: t("app.sub"),
            brandIcon: <Radio size={16} color="white" />,
            sections,
            currentPath: sidebarPath,
            style: {
              top: "calc(var(--ops-console-pad) + var(--ops-console-toolbar-height))",
              minHeight: WINDOW_HEIGHT,
              height: WINDOW_HEIGHT,
            },
            footer: (
              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setLocale(locale === "en" ? "zh" : "en")}
                  title={getOpsLabel(locale, "switchLanguage")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    width: "100%",
                    background:
                      "linear-gradient(135deg, rgba(14,165,233,0.96), rgba(6,182,212,0.92))",
                    border: "1px solid rgba(103,232,249,0.26)",
                    borderRadius: "10px",
                    color: "#f8fafc",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    padding: "10px 12px",
                    cursor: "pointer",
                    boxShadow: "0 12px 24px rgba(14,165,233,0.18)",
                  }}
                >
                  <Languages size={14} />
                  {t("app.lang.toggle")}
                </button>
                <span
                  style={{
                    fontSize: "11px",
                    color: MANAGEMENT_COLOR_MODES.dark.textMuted,
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
      </div>
    </div>
  );
}
