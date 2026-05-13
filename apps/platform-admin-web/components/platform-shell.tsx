"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ManagementShell } from "@drts/ui-web/client";
import {
  MANAGEMENT_COLORS,
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
          label: t("nav.tenantGovernance"),
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
          label: locale === "en" ? "Adapter Registry" : "介接登錄",
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
  const sidebarSections: ManagementSidebarSection[] = navSections.map(
    ({ key, title, items }) => ({
      key,
      title,
      items: items.map((item) => {
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
  const shellLabel = locale === "en" ? "Platform Admin" : "平台治理";
  const breadcrumb =
    activeItem.href === "/"
      ? [{ label: shellLabel }, { label: activeItem.label }]
      : [
          { label: shellLabel },
          { label: activeSection.title },
          { label: activeItem.label },
        ];

  return (
    <ManagementShell
      sidebar={{
        brand: t("app.name"),
        brandSub: t("app.sub"),
        brandIcon: <Shield size={16} color="white" />,
        sections: sidebarSections,
        currentPath: pathname,
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
      topbar={{
        breadcrumb,
        searchSlot: (
          <div
            style={{
              minWidth: "320px",
              maxWidth: "560px",
              padding: "9px 12px",
              borderRadius: "14px",
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: "12.5px",
              lineHeight: 1.4,
            }}
          >
            {activeItem.note}
          </div>
        ),
        envLabel: "production",
        envTone: "success",
      }}
    >
      {children}
    </ManagementShell>
  );
}
