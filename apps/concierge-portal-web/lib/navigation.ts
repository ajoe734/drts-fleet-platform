import type { Translator } from "./translations";

export type ConciergeNavItem = {
  href: string;
  label: string;
  note: string;
  status: "baseline" | "control" | "guardrail";
};

const conciergeNavDefinitions = [
  {
    href: "/",
    labelKey: "nav.home.label",
    noteKey: "nav.home.note",
    status: "baseline",
  },
  {
    href: "/login",
    labelKey: "nav.login.label",
    noteKey: "nav.login.note",
    status: "baseline",
  },
  {
    href: "/start",
    labelKey: "nav.start.label",
    noteKey: "nav.start.note",
    status: "baseline",
  },
  {
    href: "/bookings/new",
    labelKey: "nav.bookings.label",
    noteKey: "nav.bookings.note",
    status: "control",
  },
  {
    href: "/lookup",
    labelKey: "nav.lookup.label",
    noteKey: "nav.lookup.note",
    status: "control",
  },
  {
    href: "/callbacks",
    labelKey: "nav.callbacks.label",
    noteKey: "nav.callbacks.note",
    status: "control",
  },
  {
    href: "/degraded",
    labelKey: "nav.degraded.label",
    noteKey: "nav.degraded.note",
    status: "guardrail",
  },
  {
    href: "/recording-unavailable",
    labelKey: "nav.recording.label",
    noteKey: "nav.recording.note",
    status: "guardrail",
  },
] as const;

export function getConciergeNavItems(t: Translator): ConciergeNavItem[] {
  return conciergeNavDefinitions.map((item) => ({
    href: item.href,
    label: t(item.labelKey),
    note: t(item.noteKey),
    status: item.status,
  }));
}

export function findConciergeNavItem(pathname: string, t: Translator) {
  return getConciergeNavItems(t).find((item) => item.href === pathname) ?? null;
}
