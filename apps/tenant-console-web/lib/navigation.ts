export type TenantNavItem = {
  href: string;
  label: string;
  note: string;
};

export type TenantNavGroup = {
  label: string;
  items: TenantNavItem[];
};

export const tenantNavGroups: TenantNavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/",
        label: "Home",
        note: "Identity context, module framing, and quick-entry guidance.",
      },
      {
        href: "/bookings",
        label: "Bookings",
        note: "Shared list-query conventions for tenant booking oversight.",
      },
      {
        href: "/bookings/new",
        label: "New Booking",
        note: "Policy-aware booking intake and partner-safe entry separation.",
      },
    ],
  },
  {
    label: "Directory",
    items: [
      {
        href: "/passengers",
        label: "Passengers",
        note: "Tenant passenger directory — identity, department, role tags, and active state.",
      },
      {
        href: "/addresses",
        label: "Addresses",
        note: "Tenant address book — saved pickups, drop-offs, tags, and ownership.",
      },
      {
        href: "/cost-centers",
        label: "Cost Centers",
        note: "Tenant cost-center directory — owner assignment, quota posture, and coverage follow-up.",
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        href: "/invoices",
        label: "Invoices",
        note: "Billing profile, invoice line visibility, and short-lived artifact downloads.",
      },
      {
        href: "/reports",
        label: "Reports",
        note: "Tenant report jobs, artifact readiness, and contract-backed export history.",
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        href: "/api-keys",
        label: "API Keys",
        note: "Issue, rotate, and revoke access without inventing local truth.",
      },
      {
        href: "/webhooks",
        label: "Webhooks",
        note: "Endpoint registration, event scope, and delivery visibility.",
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        href: "/audit",
        label: "Audit",
        note: "Append-only tenant evidence trail and export discipline.",
      },
      {
        href: "/users",
        label: "Users",
        note: "Role assignment, invite flow, and tenant-scoped access control.",
      },
      {
        href: "/settings",
        label: "Settings",
        note: "Notification, SLA, and capability framing gathered in one lane.",
      },
    ],
  },
];

const tenantNavItems = tenantNavGroups
  .flatMap((group) => group.items)
  .sort((left, right) => right.href.length - left.href.length);

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function findNavItem(pathname: string) {
  for (const item of tenantNavItems) {
    if (isNavItemActive(pathname, item.href)) {
      return item;
    }
  }
  return tenantNavGroups[0]?.items[0] ?? null;
}
