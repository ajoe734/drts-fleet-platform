/**
 * Console NAV configurations matching the DRTS Driver App design handoff
 * (`/tmp/driver-app-handoff/driver-app/project/{platform,ops,tenant}-screens.jsx`).
 *
 * These constants are the canonical sidebar structure for the four management
 * consoles. Each entry's `key` matches the handoff's nav key (handy for
 * cross-referencing the design). The `iconName` aligns with `CANVAS_ICONS`
 * in [./canvas-primitives/icons.tsx](./canvas-primitives/icons.tsx).
 *
 * Apps consume these by mapping each `items` entry into a `ManagementSidebarItem`
 * (resolving the `href` against their own route conventions, since some apps
 * use hyphenated paths like `/feature-flags` instead of `/flags`).
 */

import type { CanvasIconName } from "./canvas-primitives/icons";

export type ConsoleSurface = "platform" | "ops" | "tenant";

export interface ConsoleNavItem {
  /** Stable key from the design handoff. */
  key: string;
  /** zh-TW label as shown in the handoff. */
  label: string;
  /** Icon name resolvable against CANVAS_ICONS. */
  iconName: CanvasIconName;
  /** Default route path (apps may override for hyphenation differences). */
  defaultHref: string;
  /** Optional badge text (e.g. "2", "23"). */
  badge?: string;
  /** Optional badge tone. */
  badgeTone?: "info" | "warn" | "danger" | "accent" | "neutral";
}

export interface ConsoleNavSection {
  /** Section heading (Chinese label in the handoff). */
  title: string;
  /** Stable key for the section. */
  key: string;
  items: ConsoleNavItem[];
}

// ── Platform Admin (indigo) ────────────────────────────────────────────────
// Source: /tmp/driver-app-handoff/driver-app/project/platform-screens.jsx
// PLATFORM_NAV
export const PLATFORM_NAV: ConsoleNavSection[] = [
  {
    key: "work",
    title: "工作面",
    items: [
      { key: "home", label: "工作首頁", iconName: "home", defaultHref: "/" },
      {
        key: "health",
        label: "平台健康",
        iconName: "health",
        defaultHref: "/health",
        badge: "2",
        badgeTone: "warn",
      },
    ],
  },
  {
    key: "tenant-governance",
    title: "租戶治理",
    items: [
      {
        key: "tenants",
        label: "租戶",
        iconName: "tenants",
        defaultHref: "/tenants",
      },
      {
        key: "partners",
        label: "合作夥伴 entry",
        iconName: "partners",
        defaultHref: "/partners",
      },
      {
        key: "users",
        label: "平台人員",
        iconName: "users",
        defaultHref: "/users",
      },
    ],
  },
  {
    key: "fleet-compliance",
    title: "車隊與法遵",
    items: [
      {
        key: "fleet",
        label: "車隊與合規",
        iconName: "fleet",
        defaultHref: "/fleet",
      },
      {
        key: "switchboard",
        label: "法定資訊與牌貼",
        iconName: "switchboard",
        defaultHref: "/switchboard",
      },
    ],
  },
  {
    key: "pricing-settlement",
    title: "計價與結算",
    items: [
      {
        key: "pricing",
        label: "計價",
        iconName: "pricing",
        defaultHref: "/pricing",
      },
      {
        key: "payments",
        label: "結算治理",
        iconName: "payments",
        defaultHref: "/payments",
        badge: "3",
        badgeTone: "danger",
      },
    ],
  },
  {
    key: "platform-layer",
    title: "平台層",
    items: [
      {
        key: "notices",
        label: "公告與維護",
        iconName: "notices",
        defaultHref: "/notices",
      },
      {
        key: "audit",
        label: "稽核與證據",
        iconName: "audit",
        defaultHref: "/audit",
      },
      {
        key: "flags",
        label: "功能旗標",
        iconName: "flags",
        defaultHref: "/feature-flags",
      },
      {
        key: "adapters",
        label: "介接登錄",
        iconName: "adapters",
        defaultHref: "/adapter-registry",
      },
    ],
  },
];

// ── Ops Console (coral) ────────────────────────────────────────────────────
// Source: /tmp/driver-app-handoff/driver-app/project/ops-screens.jsx OPS_NAV
export const OPS_NAV: ConsoleNavSection[] = [
  {
    key: "work",
    title: "工作面",
    items: [
      {
        key: "dashboard",
        label: "營運總覽",
        iconName: "dashboard",
        defaultHref: "/dashboard",
        badge: "4",
        badgeTone: "warn",
      },
    ],
  },
  {
    key: "dispatch",
    title: "即時派遣",
    items: [
      {
        key: "dispatch",
        label: "派遣",
        iconName: "dispatch",
        defaultHref: "/dispatch",
        badge: "23",
        badgeTone: "accent",
      },
      {
        key: "callcenter",
        label: "客服中心",
        iconName: "callcenter",
        defaultHref: "/callcenter",
        badge: "5",
        badgeTone: "info",
      },
    ],
  },
  {
    key: "cases",
    title: "案件處理",
    items: [
      {
        key: "complaints",
        label: "客訴",
        iconName: "complaints",
        defaultHref: "/complaints",
        badge: "3",
        badgeTone: "danger",
      },
      {
        key: "incidents",
        label: "事故",
        iconName: "incidents",
        defaultHref: "/incidents",
        badge: "1",
        badgeTone: "danger",
      },
    ],
  },
  {
    key: "monitoring",
    title: "營運監控",
    items: [
      {
        key: "reports",
        label: "報表",
        iconName: "reports",
        defaultHref: "/reports",
      },
      {
        key: "revenue",
        label: "收益審視",
        iconName: "revenue",
        defaultHref: "/revenue",
      },
      {
        key: "attendance",
        label: "班次出勤",
        iconName: "attendance",
        defaultHref: "/attendance",
      },
      {
        key: "maintenance",
        label: "車輛保修",
        iconName: "maintenance",
        defaultHref: "/maintenance",
      },
    ],
  },
  {
    key: "master-data",
    title: "主資料",
    items: [
      {
        key: "drivers",
        label: "司機",
        iconName: "fleet",
        defaultHref: "/drivers",
      },
      {
        key: "vehicles",
        label: "車輛",
        iconName: "vehicles",
        defaultHref: "/vehicles",
      },
      {
        key: "contracts",
        label: "合約",
        iconName: "contracts",
        defaultHref: "/contracts",
      },
      {
        key: "flags",
        label: "功能旗標",
        iconName: "flags",
        defaultHref: "/feature-flags",
      },
    ],
  },
];

// ── Tenant Console (teal) ──────────────────────────────────────────────────
// Source: /tmp/driver-app-handoff/driver-app/project/tenant-screens.jsx TN_NAV
export const TENANT_NAV: ConsoleNavSection[] = [
  {
    key: "work",
    title: "工作面",
    items: [
      { key: "home", label: "首頁", iconName: "home", defaultHref: "/" },
      {
        key: "bookings",
        label: "叫車",
        iconName: "bookings",
        defaultHref: "/bookings",
        badge: "5",
        badgeTone: "accent",
      },
      {
        key: "newbooking",
        label: "建立叫車",
        iconName: "plus",
        defaultHref: "/bookings/new",
      },
    ],
  },
  {
    key: "directory",
    title: "通訊錄",
    items: [
      {
        key: "passengers",
        label: "乘客",
        iconName: "passengers",
        defaultHref: "/passengers",
      },
      {
        key: "addresses",
        label: "地址簿",
        iconName: "addresses",
        defaultHref: "/addresses",
      },
      {
        key: "costcenter",
        label: "成本中心",
        iconName: "billing",
        defaultHref: "/cost-centers",
      },
      {
        key: "rules",
        label: "審批與配額",
        iconName: "flags",
        defaultHref: "/rules",
      },
    ],
  },
  {
    key: "billing",
    title: "帳務",
    items: [
      {
        key: "invoices",
        label: "對帳單",
        iconName: "billing",
        defaultHref: "/invoices",
      },
      {
        key: "reports",
        label: "報表",
        iconName: "reports",
        defaultHref: "/reports",
      },
    ],
  },
  {
    key: "integration",
    title: "整合",
    items: [
      {
        key: "apikeys",
        label: "API 金鑰",
        iconName: "apiKeys",
        defaultHref: "/api-keys",
      },
      {
        key: "webhooks",
        label: "Webhook",
        iconName: "webhooks",
        defaultHref: "/webhooks",
      },
      {
        key: "audit",
        label: "稽核",
        iconName: "audit",
        defaultHref: "/audit",
      },
    ],
  },
  {
    key: "organization",
    title: "組織",
    items: [
      {
        key: "users",
        label: "人員與角色",
        iconName: "users",
        defaultHref: "/users",
      },
      {
        key: "settings",
        label: "租戶設定",
        iconName: "flags",
        defaultHref: "/settings",
      },
    ],
  },
];

export const CONSOLE_NAV: Record<ConsoleSurface, ConsoleNavSection[]> = {
  platform: PLATFORM_NAV,
  ops: OPS_NAV,
  tenant: TENANT_NAV,
};

/**
 * Walk all sections and return the matching item by key (or null).
 * Useful for highlighting the active item from a route.
 */
export function findConsoleNavItem(
  surface: ConsoleSurface,
  key: string,
): ConsoleNavItem | null {
  for (const section of CONSOLE_NAV[surface]) {
    const hit = section.items.find((item) => item.key === key);
    if (hit) return hit;
  }
  return null;
}
