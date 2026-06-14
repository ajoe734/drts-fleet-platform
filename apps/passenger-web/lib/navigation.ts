import { type Locale, t } from "./translations";

export type PassengerNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "flow" | "guardrail";
};

export type FlowRoute = {
  href: string;
  label: string;
  kind: "positive" | "negative";
  outcome: string;
  body: string;
};

export function getPassengerNavItems(locale: Locale): PassengerNavItem[] {
  return [
    {
      href: "/",
      label: t("nav.home.label", undefined, locale),
      note: t("nav.home.note", undefined, locale),
      status: "baseline",
    },
    {
      href: "/book",
      label: t("nav.book.label", undefined, locale),
      note: t("nav.book.note", undefined, locale),
      status: "flow",
    },
    {
      href: "/trip",
      label: t("nav.trip.label", undefined, locale),
      note: t("nav.trip.note", undefined, locale),
      status: "flow",
    },
    {
      href: "/trips",
      label: t("nav.trips.label", undefined, locale),
      note: t("nav.trips.note", undefined, locale),
      status: "baseline",
    },
    {
      href: "/receipts",
      label: t("nav.receipts.label", undefined, locale),
      note: t("nav.receipts.note", undefined, locale),
      status: "baseline",
    },
    {
      href: "/auth",
      label: t("nav.auth.label", undefined, locale),
      note: t("nav.auth.note", undefined, locale),
      status: "baseline",
    },
    {
      href: "/unauthenticated",
      label: t("nav.unauthenticated.label", undefined, locale),
      note: t("nav.unauthenticated.note", undefined, locale),
      status: "guardrail",
    },
    {
      href: "/unsupported",
      label: t("nav.unsupported.label", undefined, locale),
      note: t("nav.unsupported.note", undefined, locale),
      status: "guardrail",
    },
  ];
}

export function getBookingFlowRoutes(locale: Locale): FlowRoute[] {
  return [
    {
      href: "/book",
      label: t("route.booking.main.label", undefined, locale),
      kind: "positive",
      outcome: t("route.booking.main.outcome", undefined, locale),
      body: t("route.booking.main.body", undefined, locale),
    },
    {
      href: "/book/denied",
      label: t("route.booking.denied.label", undefined, locale),
      kind: "negative",
      outcome: t("route.booking.denied.outcome", undefined, locale),
      body: t("route.booking.denied.body", undefined, locale),
    },
    {
      href: "/book/ineligible",
      label: t("route.booking.ineligible.label", undefined, locale),
      kind: "negative",
      outcome: t("route.booking.ineligible.outcome", undefined, locale),
      body: t("route.booking.ineligible.body", undefined, locale),
    },
    {
      href: "/book/no-supply",
      label: t("route.booking.noSupply.label", undefined, locale),
      kind: "negative",
      outcome: t("route.booking.noSupply.outcome", undefined, locale),
      body: t("route.booking.noSupply.body", undefined, locale),
    },
    {
      href: "/book/degraded",
      label: t("route.booking.degraded.label", undefined, locale),
      kind: "negative",
      outcome: t("route.booking.degraded.outcome", undefined, locale),
      body: t("route.booking.degraded.body", undefined, locale),
    },
  ];
}

export function getTripFlowRoutes(locale: Locale): FlowRoute[] {
  return [
    {
      href: "/trip",
      label: t("route.trip.main.label", undefined, locale),
      kind: "positive",
      outcome: t("route.trip.main.outcome", undefined, locale),
      body: t("route.trip.main.body", undefined, locale),
    },
    {
      href: "/trip/cancel",
      label: t("route.trip.cancel.label", undefined, locale),
      kind: "positive",
      outcome: t("route.trip.cancel.outcome", undefined, locale),
      body: t("route.trip.cancel.body", undefined, locale),
    },
    {
      href: "/trip/completed",
      label: t("route.trip.completed.label", undefined, locale),
      kind: "positive",
      outcome: t("route.trip.completed.outcome", undefined, locale),
      body: t("route.trip.completed.body", undefined, locale),
    },
    {
      href: "/trip/read-only",
      label: t("route.trip.readOnly.label", undefined, locale),
      kind: "positive",
      outcome: t("route.trip.readOnly.outcome", undefined, locale),
      body: t("route.trip.readOnly.body", undefined, locale),
    },
    {
      href: "/trip/cancelled",
      label: t("route.trip.cancelled.label", undefined, locale),
      kind: "negative",
      outcome: t("route.trip.cancelled.outcome", undefined, locale),
      body: t("route.trip.cancelled.body", undefined, locale),
    },
    {
      href: "/trip/reauth-required",
      label: t("route.trip.reauth.label", undefined, locale),
      kind: "negative",
      outcome: t("route.trip.reauth.outcome", undefined, locale),
      body: t("route.trip.reauth.body", undefined, locale),
    },
  ];
}

export function findPassengerNavItem(pathname: string, locale: Locale) {
  const passengerNavItems = getPassengerNavItems(locale);
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
