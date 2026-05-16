export type ConciergeNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "control" | "guardrail";
};

export const conciergeNavItems: ConciergeNavItem[] = [
  {
    href: "/",
    label: "Desk Home",
    note: "Landing route for desk posture, scope boundary, and next actions.",
    status: "baseline",
  },
  {
    href: "/login",
    label: "Bootstrap Sign-In",
    note: "Repo-local sign-in because dedicated call-point auth is still gated.",
    status: "baseline",
  },
  {
    href: "/start",
    label: "Fixed Site Picker",
    note: "Select the site-bound desk before assisted entry begins.",
    status: "baseline",
  },
  {
    href: "/bookings/new",
    label: "Proxy Booking",
    note: "Open a session, submit a booking, and quote ETA from the desk lane.",
    status: "control",
  },
  {
    href: "/lookup",
    label: "Order Lookup",
    note: "Review recent orders, dispatch trace, and recording posture.",
    status: "control",
  },
  {
    href: "/callbacks",
    label: "Callbacks",
    note: "Schedule or resolve follow-up callbacks for desk-created sessions.",
    status: "control",
  },
  {
    href: "/degraded",
    label: "Degraded",
    note: "Explicit read-only fallback when the desk lane loses capability.",
    status: "guardrail",
  },
  {
    href: "/recording-unavailable",
    label: "Recording Gate",
    note: "Explains why raw recording callback binding still escalates to ops.",
    status: "guardrail",
  },
];

export function findConciergeNavItem(pathname: string) {
  return conciergeNavItems.find((item) => item.href === pathname) ?? null;
}
