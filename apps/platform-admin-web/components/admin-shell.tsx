"use client";

import {
  PLATFORM_ADMIN_ROUTE_REGISTRY,
  PlatformAdminAssistantProvider,
} from "@/components/assistant/route-context";
import { PlatformAssistantOverlay } from "@/components/assistant/platform-assistant-overlay";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Search,
  Shield,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type ReactNode,
} from "react";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import { getPlatformLabel } from "@/lib/localized-labels";

const SHELL_FONT =
  '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const SHELL_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const theme = {
  bg: "#F7F8FB",
  surface: "#FFFFFF",
  surfaceLo: "#F1F4F8",
  border: "#E5E8EE",
  borderStrong: "#C9D2DD",
  text: "#0B1220",
  textMuted: "#475569",
  textDim: "#6B7280",
  accent: "#4F46E5",
  accentHi: "#6366F1",
  accentBg: "#EEF2FF",
  accentBorder: "#C7D2FE",
  success: "#0F7B5A",
  successBg: "#E5F4ED",
  successBorder: "#A7D7C2",
  warn: "#A8590B",
  warnBg: "#FCEED6",
  warnBorder: "#F0CC95",
  danger: "#B42318",
  dangerBg: "#FEE4E2",
  dangerBorder: "#F8B3AC",
  neutralBg: "#F1F4F8",
  neutralBorder: "#CBD5E1",
} as const;

type AdminShellProps = {
  children: ReactNode;
};

type NavRoute = {
  key: keyof typeof PLATFORM_ADMIN_ROUTE_REGISTRY;
  icon: LucideIcon;
  section: string;
  zh: string;
  en: string;
};

type NavSection = {
  key: string;
  zh: string;
  en: string;
};

type ApiHealthStatus = "checking" | "healthy" | "degraded" | "down";

const SIDEBAR_SCROLL_STORAGE_KEY = "platform-admin-sidebar-scroll-top";

const sections: NavSection[] = [
  { key: "workspace", zh: "工作面", en: "Workspace" },
  { key: "tenant", zh: "租戶治理", en: "Tenant Governance" },
  { key: "partner", zh: "合作夥伴治理", en: "Partner Governance" },
  { key: "people", zh: "人員與車隊", en: "People & Fleet" },
  { key: "commerce", zh: "平台與商務", en: "Platform & Commerce" },
  { key: "ops", zh: "平台維運", en: "Platform Ops & Risk" },
];

const routes: NavRoute[] = [
  {
    key: "home",
    icon: LayoutDashboard,
    section: "workspace",
    zh: "工作首頁",
    en: "Home",
  },
  {
    key: "tenants",
    icon: Shield,
    section: "tenant",
    zh: "租戶",
    en: "Tenants",
  },
  {
    key: "tenant-governance",
    icon: ShieldCheck,
    section: "tenant",
    zh: "跨租戶治理",
    en: "Cross-tenant Governance",
  },
  {
    key: "partners",
    icon: Handshake,
    section: "partner",
    zh: "合作夥伴",
    en: "Partner Entries",
  },
  {
    key: "users",
    icon: Users,
    section: "people",
    zh: "平台人員",
    en: "Platform Staff",
  },
  {
    key: "fleet",
    icon: Truck,
    section: "people",
    zh: "車隊與法遵",
    en: "Fleet & Compliance",
  },
  {
    key: "switchboard",
    icon: Radio,
    section: "commerce",
    zh: "公開資訊",
    en: "Public Info & Placards",
  },
  {
    key: "pricing",
    icon: DollarSign,
    section: "commerce",
    zh: "費率治理",
    en: "Pricing",
  },
  {
    key: "payments",
    icon: CreditCard,
    section: "commerce",
    zh: "結算與帳務",
    en: "Payments",
  },
  {
    key: "reimbursements",
    icon: CreditCard,
    section: "commerce",
    zh: "代墊批次",
    en: "Reimbursements",
  },
  {
    key: "adapter-registry",
    icon: ShieldCheck,
    section: "commerce",
    zh: "平台介接器",
    en: "Adapter Registry",
  },
  {
    key: "health",
    icon: Activity,
    section: "ops",
    zh: "平台健康",
    en: "Platform Health",
  },
  {
    key: "notices",
    icon: Bell,
    section: "ops",
    zh: "公告與維護",
    en: "Notices & Maintenance",
  },
  {
    key: "audit",
    icon: ClipboardList,
    section: "ops",
    zh: "稽核與證據",
    en: "Audit & Evidence",
  },
  {
    key: "feature-flags",
    icon: Flag,
    section: "ops",
    zh: "功能旗標",
    en: "Feature Flags · WRITE",
  },
];

function labelFor(locale: Locale, item: { zh: string; en: string }) {
  return locale === "zh" ? item.zh : item.en;
}

function pathMatchesRoute(route: NavRoute, pathname: string) {
  const href = PLATFORM_ADMIN_ROUTE_REGISTRY[route.key].href;
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveRoute(pathname: string): NavRoute {
  const matchedRoutes = routes.filter((route) =>
    pathMatchesRoute(route, pathname),
  );
  if (matchedRoutes.length > 0) {
    return matchedRoutes.reduce((best, route) =>
      PLATFORM_ADMIN_ROUTE_REGISTRY[route.key].href.length >
      PLATFORM_ADMIN_ROUTE_REGISTRY[best.key].href.length
        ? route
        : best,
    );
  }

  const [homeRoute] = routes;
  if (!homeRoute) {
    throw new Error("Platform Admin routes are not configured.");
  }
  return homeRoute;
}

function getRefreshTier(pathname: string, locale: Locale) {
  return pathname.startsWith("/audit")
    ? {
        code: "T6",
        cadence: locale === "zh" ? "手動" : "MANUAL",
        title:
          locale === "zh"
            ? "手動更新 · 稽核證據"
            : "manual refresh · audit evidence",
      }
    : {
        code: "T4",
        cadence: "30s",
        title:
          locale === "zh"
            ? "中慢更新 · 治理資料"
            : "medium-slow refresh · governance",
      };
}

function normalizeHealthStatus(
  value: unknown,
  responseOk: boolean,
): ApiHealthStatus {
  if (!responseOk) {
    return "degraded";
  }

  const normalized = String(value ?? "healthy").toLowerCase();
  if (normalized === "down" || normalized === "unhealthy") {
    return "down";
  }
  if (normalized === "degraded" || normalized === "warning") {
    return "degraded";
  }
  return "healthy";
}

function formatCheckedAt(date: Date | null, locale: Locale) {
  if (!date) {
    return locale === "zh" ? "尚未檢查" : "not checked";
  }

  return date.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = getRuntimeApiBaseUrl().replace(/\/$/, "");

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        setStatus(normalizeHealthStatus(body?.status, response.ok));
      } catch {
        if (!controller.signal.aborted) {
          setStatus("down");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLastCheckedAt(new Date());
        }
      }
    }

    checkHealth();

    return () => controller.abort();
  }, []);

  return { status, lastCheckedAt };
}

function AdminHealthFooter({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const { status, lastCheckedAt } = useApiHealth();
  const statusCopy = {
    checking: {
      label: locale === "zh" ? "API 檢查中" : "API checking",
      short: locale === "zh" ? "檢查中" : "checking",
      fg: theme.textMuted,
      bg: theme.neutralBg,
      border: theme.neutralBorder,
    },
    healthy: {
      label: locale === "zh" ? "API 健康" : "API healthy",
      short: locale === "zh" ? "正常" : "healthy",
      fg: theme.success,
      bg: theme.successBg,
      border: theme.successBorder,
    },
    degraded: {
      label: locale === "zh" ? "API 降級" : "API degraded",
      short: locale === "zh" ? "降級" : "degraded",
      fg: theme.warn,
      bg: theme.warnBg,
      border: theme.warnBorder,
    },
    down: {
      label: locale === "zh" ? "API 失聯" : "API down",
      short: locale === "zh" ? "失聯" : "down",
      fg: theme.danger,
      bg: theme.dangerBg,
      border: theme.dangerBorder,
    },
  } satisfies Record<
    ApiHealthStatus,
    { label: string; short: string; fg: string; bg: string; border: string }
  >;
  const current = statusCopy[status];

  return (
    <div style={footerStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 6,
          border: `1px solid ${current.border}`,
          background: current.bg,
          color: current.fg,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: current.fg,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1 }}>{current.label}</span>
        <span style={{ fontFamily: SHELL_MONO, opacity: 0.75 }}>
          {current.short}
        </span>
      </div>
      <div style={footerMetaStyle}>
        <span>{locale === "zh" ? "最後檢查" : "last checked"}</span>
        <span style={{ fontFamily: SHELL_MONO }}>
          {formatCheckedAt(lastCheckedAt, locale)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        title={getPlatformLabel(locale, "switchLanguage")}
        style={languageButtonStyle}
      >
        <Languages size={13} />
        <span>{locale === "en" ? "中文" : "English"}</span>
      </button>
    </div>
  );
}

function SidebarNavItem({
  route,
  active,
  locale,
  activeRef,
}: {
  route: NavRoute;
  active: boolean;
  locale: Locale;
  activeRef?: Ref<HTMLAnchorElement>;
}) {
  const Icon = route.icon;
  const href = PLATFORM_ADMIN_ROUTE_REGISTRY[route.key].href;

  return (
    <Link
      ref={active ? activeRef : undefined}
      href={href}
      title={labelFor(locale, route)}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        minHeight: 30,
        padding: "6px 9px",
        borderRadius: 7,
        color: active ? theme.accent : theme.text,
        background: active ? theme.accentBg : "transparent",
        border: active
          ? `1px solid ${theme.accentBorder}`
          : "1px solid transparent",
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        textDecoration: "none",
      }}
    >
      <Icon size={15} strokeWidth={active ? 2 : 1.7} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {labelFor(locale, route)}
      </span>
    </Link>
  );
}

function Sidebar({
  activeRoute,
  locale,
  setLocale,
}: {
  activeRoute: NavRoute;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    const saved = window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
    if (!saved) {
      return;
    }

    const scrollTop = Number(saved);
    if (!Number.isFinite(scrollTop)) {
      return;
    }

    nav.scrollTop = scrollTop;

    const frameId = window.requestAnimationFrame(() => {
      nav.scrollTop = scrollTop;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    const persistScrollPosition = () => {
      window.sessionStorage.setItem(
        SIDEBAR_SCROLL_STORAGE_KEY,
        String(nav.scrollTop),
      );
    };

    nav.addEventListener("scroll", persistScrollPosition, { passive: true });
    return () => {
      nav.removeEventListener("scroll", persistScrollPosition);
    };
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const activeItem = activeItemRef.current;
    if (!nav || !activeItem) {
      return;
    }

    const keepActiveItemVisible = () => {
      const navRect = nav.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const padding = 12;
      const itemIsVisible =
        itemRect.top >= navRect.top + padding &&
        itemRect.bottom <= navRect.bottom - padding;

      if (!itemIsVisible) {
        activeItem.scrollIntoView({ block: "nearest" });
        window.sessionStorage.setItem(
          SIDEBAR_SCROLL_STORAGE_KEY,
          String(nav.scrollTop),
        );
      }
    };

    keepActiveItemVisible();
    const frameId = window.requestAnimationFrame(keepActiveItemVisible);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeRoute.key]);

  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>
        <div style={brandMarkStyle}>D</div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={brandNameStyle}>DRTS</div>
          <div style={brandSubStyle}>
            {locale === "zh" ? "平台管理" : "Platform Admin"}
          </div>
        </div>
      </div>
      <nav
        ref={navRef}
        aria-label={
          locale === "zh" ? "平台管理導覽" : "Platform Admin navigation"
        }
        style={navStyle}
      >
        {sections.map((section) => (
          <div key={section.key} style={{ display: "grid", gap: 1 }}>
            <div style={sectionTitleStyle}>{labelFor(locale, section)}</div>
            {routes
              .filter((route) => route.section === section.key)
              .map((route) => (
                <SidebarNavItem
                  key={route.key}
                  route={route}
                  active={route.key === activeRoute.key}
                  locale={locale}
                  activeRef={activeItemRef}
                />
              ))}
          </div>
        ))}
      </nav>
      <AdminHealthFooter locale={locale} setLocale={setLocale} />
    </aside>
  );
}

function RefreshTierBadge({
  pathname,
  locale,
}: {
  pathname: string;
  locale: Locale;
}) {
  const tier = getRefreshTier(pathname, locale);

  return (
    <div title={tier.title} style={refreshBadgeStyle}>
      <span style={freshDotStyle} />
      <span style={{ letterSpacing: 0.4 }}>{tier.code}</span>
      <span>{tier.cadence}</span>
    </div>
  );
}

function SearchBox({ locale }: { locale: Locale }) {
  return (
    <div aria-label="Search" style={searchBoxStyle}>
      <Search size={13} />
      <span style={searchTextStyle}>
        {locale === "zh"
          ? "搜尋租戶、合作夥伴、稽核事件…"
          : "Search tenants, partner entries, audit events..."}
      </span>
    </div>
  );
}

function IdentityChip({ locale }: { locale: Locale }) {
  return (
    <div style={identityChipStyle}>
      <div style={realmChipStyle}>
        <span style={accentDotStyle} />
        {locale === "zh" ? "平台" : "PLATFORM"}
      </div>
      <div style={envChipStyle}>
        <span style={envDotStyle} />
        {locale === "zh" ? "正式環境" : "Production"}
      </div>
      <div style={actorChipStyle}>
        <div style={actorAvatarStyle}>PA</div>
        <span style={actorNameStyle}>
          {locale === "zh" ? "平台管理員" : "Platform Admin"}
        </span>
      </div>
    </div>
  );
}

function Topbar({
  activeRoute,
  pathname,
  locale,
}: {
  activeRoute: NavRoute;
  pathname: string;
  locale: Locale;
}) {
  const activeSection = sections.find(
    (section) => section.key === activeRoute.section,
  );
  const activeHref = PLATFORM_ADMIN_ROUTE_REGISTRY[activeRoute.key].href;
  const hasDetailCrumb =
    activeHref !== "/" &&
    pathname !== activeHref &&
    pathname.startsWith(`${activeHref}/`);
  const breadcrumbs = [
    activeSection
      ? labelFor(locale, activeSection)
      : locale === "zh"
        ? "平台管理"
        : "Platform Admin",
    labelFor(locale, activeRoute),
    ...(hasDetailCrumb ? [locale === "zh" ? "詳情" : "Detail"] : []),
  ];

  return (
    <header style={topbarStyle}>
      <div style={breadcrumbStyle}>
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} style={breadcrumbItemStyle}>
            {index > 0 ? <span style={breadcrumbChevronStyle}>›</span> : null}
            <span
              style={{
                color:
                  index === breadcrumbs.length - 1
                    ? theme.text
                    : theme.textMuted,
                fontWeight: index === breadcrumbs.length - 1 ? 700 : 500,
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>
      <RefreshTierBadge pathname={pathname} locale={locale} />
      <SearchBox locale={locale} />
      <span style={kbdStyle}>⌘K</span>
      <button
        type="button"
        title={locale === "zh" ? "通知" : "Notifications"}
        style={iconButtonStyle}
      >
        <Bell size={15} />
      </button>
      <IdentityChip locale={locale} />
    </header>
  );
}

export function AdminShell({ children }: AdminShellProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname || "/";
  const { locale, setLocale } = useTranslation();
  const activeRoute = useMemo(() => getActiveRoute(pathname), [pathname]);

  return (
    <PlatformAdminAssistantProvider>
      <div style={shellStyle}>
        <Sidebar
          activeRoute={activeRoute}
          locale={locale}
          setLocale={setLocale}
        />
        <Topbar activeRoute={activeRoute} pathname={pathname} locale={locale} />
        <main style={mainStyle}>{children}</main>
        <PlatformAssistantOverlay />
      </div>
    </PlatformAdminAssistantProvider>
  );
}

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100vh",
  display: "grid",
  gridTemplateColumns: "224px minmax(0, 1fr)",
  gridTemplateRows: "46px minmax(0, 1fr)",
  overflow: "hidden",
  background: theme.bg,
  color: theme.text,
  fontFamily: SHELL_FONT,
  fontSize: 13,
};

const sidebarStyle: CSSProperties = {
  gridRow: "1 / 3",
  background: theme.surface,
  borderRight: `1px solid ${theme.border}`,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const brandStyle: CSSProperties = {
  height: 46,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderBottom: `1px solid ${theme.border}`,
};

const brandMarkStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 7,
  background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentHi})`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: -0.4,
};

const brandNameStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  color: theme.text,
  lineHeight: 1.1,
  letterSpacing: -0.2,
};

const brandSubStyle: CSSProperties = {
  fontSize: 10,
  color: theme.textMuted,
  letterSpacing: 0.3,
  lineHeight: 1.1,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const navStyle: CSSProperties = {
  flex: 1,
  padding: "8px 6px",
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

const sectionTitleStyle: CSSProperties = {
  margin: "8px 8px 4px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: theme.textDim,
  textTransform: "uppercase",
};

const footerStyle: CSSProperties = {
  padding: "8px 10px 10px",
  borderTop: `1px solid ${theme.border}`,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const footerMetaStyle: CSSProperties = {
  fontSize: 10,
  color: theme.textDim,
  display: "flex",
  justifyContent: "space-between",
  padding: "0 2px",
};

const languageButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.accent,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const topbarStyle: CSSProperties = {
  gridColumn: 2,
  gridRow: 1,
  borderBottom: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "flex",
  alignItems: "center",
  gap: 10,
  height: 46,
  padding: "0 12px",
  minWidth: 0,
};

const breadcrumbStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flex: 1,
  overflow: "hidden",
};

const breadcrumbItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flexShrink: 0,
  fontSize: 12.5,
  whiteSpace: "nowrap",
};

const breadcrumbChevronStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 15,
  lineHeight: 1,
};

const refreshBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 6,
  background: theme.successBg,
  border: `1px solid ${theme.successBorder}`,
  fontSize: 10.5,
  fontWeight: 700,
  color: theme.success,
  fontFamily: SHELL_MONO,
  flexShrink: 0,
};

const freshDotStyle: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: 2.5,
  background: theme.success,
  flexShrink: 0,
};

const searchBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: 240,
  minWidth: 160,
  padding: "5px 10px",
  borderRadius: 7,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  color: theme.textMuted,
  flexShrink: 1,
};

const searchTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const kbdStyle: CSSProperties = {
  fontFamily: SHELL_MONO,
  fontSize: 10.5,
  padding: "2px 6px",
  borderRadius: 5,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.textMuted,
  fontWeight: 700,
  flexShrink: 0,
};

const iconButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "transparent",
  border: "1px solid transparent",
  color: theme.textMuted,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

const identityChipStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 1,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  overflow: "hidden",
  height: 28,
  flexShrink: 0,
};

const realmChipStyle: CSSProperties = {
  padding: "0 8px",
  display: "flex",
  alignItems: "center",
  gap: 4,
  background: theme.accentBg,
  color: theme.accent,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const envChipStyle: CSSProperties = {
  padding: "0 8px",
  display: "flex",
  alignItems: "center",
  gap: 4,
  color: theme.success,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.4,
  fontFamily: SHELL_MONO,
};

const actorChipStyle: CSSProperties = {
  padding: "0 8px 0 6px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderLeft: `1px solid ${theme.border}`,
};

const accentDotStyle: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 2,
  background: theme.accent,
};

const envDotStyle: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 2,
  background: theme.success,
};

const actorAvatarStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 9,
  background: theme.accentBg,
  color: theme.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9.5,
  fontWeight: 800,
  border: `1px solid ${theme.accentBorder}`,
};

const actorNameStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.text,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const mainStyle: CSSProperties = {
  gridColumn: 2,
  gridRow: 2,
  overflow: "auto",
  background: theme.bg,
  color: theme.text,
  minWidth: 0,
};
