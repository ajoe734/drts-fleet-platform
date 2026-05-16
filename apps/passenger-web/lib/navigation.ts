export type PassengerNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "flow" | "guardrail";
};

export const passengerNavItems: PassengerNavItem[] = [
  {
    href: "/",
    label: "Booking Status Home",
    note: "Landing route for current trip posture, ETA framing, and next actions.",
    status: "baseline",
  },
  {
    href: "/book",
    label: "Request a Ride",
    note: "Authority-safe booking request entry with eligibility, supply, and degraded fallbacks.",
    status: "flow",
  },
  {
    href: "/trip",
    label: "Active Trip",
    note: "Current trip status with cancel, completion, read-only, and reauth subroutes.",
    status: "flow",
  },
  {
    href: "/trips",
    label: "Trip History",
    note: "Past-trip landing zone that defers receipt rendering to the receipt lane.",
    status: "baseline",
  },
  {
    href: "/receipts",
    label: "Receipt Center",
    note: "DRTS-issued, external-reference, and unsupported ownership states are explicit.",
    status: "baseline",
  },
  {
    href: "/auth",
    label: "Auth Entry",
    note: "Bootstrap entry for sign-in, trip lookup, and support-safe recovery framing.",
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

export type FlowRoute = {
  href: string;
  label: string;
  kind: "positive" | "negative";
  outcome: string;
  body: string;
};

export const bookingFlowRoutes: FlowRoute[] = [
  {
    href: "/book",
    label: "Request a Ride",
    kind: "positive",
    outcome: "Request submitted",
    body: "Rider supplies pickup, drop-off, and optional reservation window. ETA is framed as an estimate and the request is queued for matching.",
  },
  {
    href: "/book/denied",
    label: "Booking Denied",
    kind: "negative",
    outcome: "Denied by policy",
    body: "Backend rejects the request because of safety, fraud, or platform policy guardrails. The rider sees a non-blaming reason and a support exit.",
  },
  {
    href: "/book/ineligible",
    label: "Booking Ineligible",
    kind: "negative",
    outcome: "Eligibility failed",
    body: "Passenger profile, payment instrument, or program eligibility does not match the request. The route names which gate failed without leaking PII.",
  },
  {
    href: "/book/no-supply",
    label: "No Supply Available",
    kind: "negative",
    outcome: "No driver matched",
    body: "No qualified driver / vehicle is available for the requested time and area. The rider is offered to retry, schedule, or fall back to an alternate channel.",
  },
  {
    href: "/book/degraded",
    label: "Booking Degraded",
    kind: "negative",
    outcome: "Read-only fallback",
    body: "Booking surface is in a degraded mode: status is visible but mutating actions are blocked. Riders are routed to support or asked to retry later.",
  },
];

export const tripFlowRoutes: FlowRoute[] = [
  {
    href: "/trip",
    label: "Active Trip Status",
    kind: "positive",
    outcome: "Trip in progress",
    body: "Driver matched, ETA estimated, vehicle and trip identifiers visible. Cancel is offered only while authority allows it.",
  },
  {
    href: "/trip/cancel",
    label: "Cancel Active Trip",
    kind: "positive",
    outcome: "Cancel requested",
    body: "Cancellation flow when the rider still owns cancel authority. Names the policy window and possible cancellation fee context.",
  },
  {
    href: "/trip/completed",
    label: "Trip Completed",
    kind: "positive",
    outcome: "Completed",
    body: "Trip ended cleanly. Surface offers receipt visibility, trip trace, and a return path to history.",
  },
  {
    href: "/trip/read-only",
    label: "Read-Only Trip View",
    kind: "positive",
    outcome: "Read-only authority",
    body: "Trip is owned by partner, tenant, or concierge. The rider can see status but cannot mutate; mutation lives with the source channel.",
  },
  {
    href: "/trip/cancelled",
    label: "Trip Cancelled",
    kind: "negative",
    outcome: "Cancelled",
    body: "Trip was cancelled by the rider, the driver, or the platform. The page names the cancelling actor and what the rider can do next.",
  },
  {
    href: "/trip/reauth-required",
    label: "Reauth Required",
    kind: "negative",
    outcome: "Session expired",
    body: "Rider session expired or context cannot be re-established. Trip data stays hidden until re-verification clears.",
  },
];

export function findPassengerNavItem(pathname: string) {
  if (pathname === "/") return passengerNavItems[0] ?? null;
  const candidates = passengerNavItems.filter(
    (item) =>
      item.href !== "/" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) =>
    item.href.length > best.href.length ? item : best,
  );
}
