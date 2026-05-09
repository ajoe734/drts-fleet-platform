export type PassengerNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "guardrail";
};

export const passengerNavItems: PassengerNavItem[] = [
  {
    href: "/",
    label: "Booking Status Home",
    note: "Landing route for current trip posture, ETA framing, and next actions.",
    status: "baseline",
  },
  {
    href: "/auth",
    label: "Auth Entry",
    note: "Bootstrap entry for sign-in, trip lookup, and support-safe recovery framing.",
    status: "baseline",
  },
  {
    href: "/trips",
    label: "Trip History",
    note: "Receipt and past-trip landing zone without inventing unsupported exports.",
    status: "baseline",
  },
  {
    href: "/receipts",
    label: "Receipt Center",
    note: "DRTS-issued, external-reference, and unsupported ownership states are explicit.",
    status: "baseline",
  },
  {
    href: "/unauthenticated",
    label: "Unauthenticated",
    note: "Shows the fallback path when the rider cannot be verified yet.",
    status: "guardrail",
  },
  {
    href: "/unsupported",
    label: "Unsupported",
    note: "Covers third-party receipt ownership and not-serviceable channel constraints.",
    status: "guardrail",
  },
];

export function findPassengerNavItem(pathname: string) {
  return passengerNavItems.find((item) => item.href === pathname) ?? null;
}
