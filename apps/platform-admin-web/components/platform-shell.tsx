"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ManagementShell } from "@drts/ui-web/client";
import {
  managementColors,
  type ManagementSidebarItem,
  type ManagementSidebarSection,
} from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import { getPlatformLabel } from "@/lib/localized-labels";
import {
  Activity,
  Bell,
  ClipboardList,
  CreditCard,
  DollarSign,
  Flag,
  Handshake,
  Languages,
  LayoutDashboard,
  Radio,
  Shield,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

type PlatformNavItem = ManagementSidebarItem & {
  note: string;
};

type PlatformNavSection = {
  key: string;
  title: string;
  items: PlatformNavItem[];
};

const DARK_COLORS = managementColors("dark");
const WINDOW_HEIGHT =
  "calc(100dvh - var(--platform-admin-pad) - var(--platform-admin-pad) - var(--platform-admin-toolbar-height))";

function isNavItemActive(
  item: Pick<ManagementSidebarItem, "href" | "matchPaths">,
  currentPath: string,
) {
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => currentPath === match || currentPath.startsWith(`${match}/`),
  );
}

function buildPlatformSections(
  locale: Locale,
  t: (key: string, params?: Record<string, string | number>) => string,
): PlatformNavSection[] {
  const sectionTitles =
    locale === "en"
      ? {
          workspace: "Workspace",
          tenantGovernance: "Tenant Governance",
          fleetCompliance: "Fleet & Compliance",
          pricingSettlement: "Pricing & Settlement",
          platformLayer: "Platform Layer",
        }
      : {
          workspace: "工作面",
          tenantGovernance: "租戶治理",
          fleetCompliance: "車隊與法遵",
          pricingSettlement: "計價與結算",
          platformLayer: "平台層",
        };

  const notes =
    locale === "en"
      ? {
          home: "Governance queue, cross-module shortcuts, and the latest sensitive platform activity.",
          health:
            "Platform alerts, adapter degradation, and health thresholds that need operator review.",
          tenantGovernanceSummary:
            "Cross-tenant cost center, rule, quota, and approval health in one monitoring lane.",
          tenants:
            "Tenant lifecycle, rollout posture, modules, and quota governance.",
          partners:
            "Partner entry readiness, credential state, and promotion safety checks.",
          users:
            "Platform staff identity, invite state, and role governance across the control plane.",
          fleet:
            "Vehicle, driver, and device compliance posture with dispatchability blockers.",
          switchboard:
            "Public info versions, placard lineage, and platform-wide notice publishing.",
          pricing:
            "Pricing rules, fee plans, and publish windows before they reach production tenants.",
          payments:
            "Settlement backlog, reconciliation exceptions, and remittance evidence.",
          notices:
            "Maintenance windows, operator notices, and platform-wide incident comms.",
          audit:
            "Immutable audit evidence, download review, and retention-sensitive operations.",
          featureFlags:
            "Feature rollout posture and tenant override governance before release expansion.",
          adapterRegistry:
            "Adapter ownership, auth health, and forwarder readiness across external channels.",
        }
      : {
          home: "治理待辦、跨模組捷徑，以及最新的平台高敏感操作。",
          health: "平台告警、adapter 降級，以及需要治理人檢視的健康門檻。",
          tenantGovernanceSummary:
            "把跨 tenant 的 cost center、規則、quota 與 approval 健康彙總在同一條監控工作面。",
          tenants: "租戶生命週期、rollout 姿態、模組與配額治理。",
          partners: "合作夥伴 entry readiness、憑證狀態與 promotion 安全檢查。",
          users: "平台人員身分、邀請狀態與 control plane 角色治理。",
          fleet: "車輛、司機與裝置合規姿態，以及 dispatchability 阻塞。",
          switchboard: "公開資訊版本、牌貼沿革，以及平台層公告發布。",
          pricing: "正式租戶生效前的計價規則、費率方案與 publish window。",
          payments: "結算待辦、對帳例外與 remittance 證據。",
          notices: "維護視窗、營運公告與平台層 incident communication。",
          audit: "不可變稽核證據、下載審查與 retention 敏感操作。",
          featureFlags: "功能 rollout 姿態與租戶 override 治理。",
          adapterRegistry: "外部通路的 adapter 擁有權、auth 健康與 readiness。",
        };

  return [
    {
      key: "workspace",
      title: sectionTitles.workspace,
      items: [
        {
          href: "/",
          label: t("nav.home"),
          icon: <LayoutDashboard size={16} />,
          note: notes.home,
        },
        {
          href: "/health",
          label: t("nav.health"),
          icon: <Activity size={16} />,
          badge: "2",
          badgeTone: "warning",
          note: notes.health,
        },
      ],
    },
    {
      key: "tenant-governance",
      title: sectionTitles.tenantGovernance,
      items: [
        {
          href: "/tenant-governance",
          label: locale === "en" ? "Governance Overview" : "治理總覽",
          icon: <ShieldCheck size={16} />,
          note: notes.tenantGovernanceSummary,
        },
        {
          href: "/tenants",
          label: t("nav.tenants"),
          icon: <Shield size={16} />,
          note: notes.tenants,
        },
        {
          href: "/partners",
          label: t("nav.partners"),
          icon: <Handshake size={16} />,
          note: notes.partners,
        },
        {
          href: "/users",
          label: t("nav.users"),
          icon: <Users size={16} />,
          note: notes.users,
        },
      ],
    },
    {
      key: "fleet-compliance",
      title: sectionTitles.fleetCompliance,
      items: [
        {
          href: "/fleet",
          label: t("nav.fleet"),
          icon: <Truck size={16} />,
          note: notes.fleet,
        },
        {
          href: "/switchboard",
          label: t("nav.switchboard"),
          icon: <Radio size={16} />,
          note: notes.switchboard,
        },
      ],
    },
    {
      key: "pricing-settlement",
      title: sectionTitles.pricingSettlement,
      items: [
        {
          href: "/pricing",
          label: t("nav.pricing"),
          icon: <DollarSign size={16} />,
          note: notes.pricing,
        },
        {
          href: "/payments",
          label: t("nav.payments"),
          icon: <CreditCard size={16} />,
          badge: "3",
          badgeTone: "danger",
          note: notes.payments,
        },
      ],
    },
    {
      key: "platform-layer",
      title: sectionTitles.platformLayer,
      items: [
        {
          href: "/notices",
          label: t("nav.notices"),
          icon: <Bell size={16} />,
          note: notes.notices,
        },
        {
          href: "/audit",
          label: t("nav.audit"),
          icon: <ClipboardList size={16} />,
          note: notes.audit,
        },
        {
          href: "/feature-flags",
          label: t("nav.featureFlags"),
          icon: <Flag size={16} />,
          note: notes.featureFlags,
        },
        {
          href: "/adapter-registry",
          label: t("nav.adapterRegistry"),
          icon: <ShieldCheck size={16} />,
          note: notes.adapterRegistry,
        },
      ],
    },
  ];
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "/";
  const { t, locale, setLocale } = useTranslation();

  const navSections = buildPlatformSections(locale, t);
  const sidebarPath = pathname === "/tenant-governance" ? "/tenants" : pathname;
  const sidebarSections: ManagementSidebarSection[] = navSections.map(
    ({ key, title, items }) => ({
      key,
      title,
      items: items
        .filter((item) => item.href !== "/tenant-governance")
        .map((item) => {
          const { note, ...sidebarItem } = item;
          void note;
          return sidebarItem;
        }),
    }),
  );

  const activeSection =
    navSections.find((section) =>
      section.items.some((item) => isNavItemActive(item, pathname)),
    ) ?? navSections[0]!;
  const activeItem =
    activeSection.items.find((item) => isNavItemActive(item, pathname)) ??
    activeSection.items[0]!;
  const breadcrumb =
    activeItem.href === "/"
      ? [{ label: activeItem.label }]
      : [{ label: activeSection.title }, { label: activeItem.label }];
  const chromeUrl = `admin.drts.io${pathname === "/" ? "" : pathname}`;

  return (
    <div className="platform-admin-window">
      <div className="platform-admin-window__frame">
        <div className="platform-admin-window__toolbar">
          <div
            className="platform-admin-window__traffic-lights"
            aria-hidden="true"
          >
            <span className="platform-admin-window__traffic-light platform-admin-window__traffic-light--close" />
            <span className="platform-admin-window__traffic-light platform-admin-window__traffic-light--minimize" />
            <span className="platform-admin-window__traffic-light platform-admin-window__traffic-light--maximize" />
          </div>
          <div className="platform-admin-window__title-stack">
            <span className="platform-admin-window__title">
              DRTS PLATFORM ADMIN
            </span>
            <span className="platform-admin-window__url" title={chromeUrl}>
              {chromeUrl}
            </span>
          </div>
          <span className="platform-admin-window__meta">
            {locale === "en" ? "Production control plane" : "正式環境控制平面"}
          </span>
        </div>

        <ManagementShell
          mode="dark"
          density="compact"
          style={{ minHeight: WINDOW_HEIGHT }}
          sidebar={{
            brand: t("app.name"),
            brandSub: t("app.sub"),
            brandIcon: (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                }}
              >
                PA
              </span>
            ),
            sections: sidebarSections,
            currentPath: sidebarPath,
            style: {
              top: "calc(var(--platform-admin-pad) + var(--platform-admin-toolbar-height))",
              minHeight: WINDOW_HEIGHT,
              height: WINDOW_HEIGHT,
            },
            footer: (
              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setLocale(locale === "en" ? "zh" : "en")}
                  title={getPlatformLabel(locale, "switchLanguage")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    width: "100%",
                    background:
                      "linear-gradient(135deg, rgba(99,102,241,0.92), rgba(129,140,248,0.92))",
                    border: "1px solid rgba(165,180,252,0.28)",
                    borderRadius: "10px",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "10px 12px",
                    cursor: "pointer",
                    boxShadow: "0 16px 30px rgba(79, 70, 229, 0.22)",
                  }}
                >
                  <Languages size={14} />
                  {t("app.lang.toggle")}
                </button>
                <span
                  style={{
                    fontSize: "11px",
                    color: DARK_COLORS.textMuted,
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  {t("app.env")}
                </span>
              </div>
            ),
          }}
          topbar={{
            breadcrumb,
            searchSlot: (
              <div
                title={activeItem.note}
                style={{
                  width: "clamp(220px, 34vw, 420px)",
                  padding: "9px 12px",
                  borderRadius: "14px",
                  border: "1px solid rgba(129, 140, 248, 0.28)",
                  background:
                    "linear-gradient(135deg, rgba(49, 46, 129, 0.38), rgba(30, 41, 59, 0.92))",
                  color: "#c7d2fe",
                  fontSize: "12px",
                  lineHeight: 1.45,
                }}
              >
                {activeItem.note}
              </div>
            ),
            envLabel: "production",
            envTone: "platform",
          }}
        >
          {children}
        </ManagementShell>
      </div>
    </div>
  );
}
