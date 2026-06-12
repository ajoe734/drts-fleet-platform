import type { ReactNode } from "react";
import {
  PartnerAuthenticatedShell,
  type PartnerNavItem,
} from "@/components/partner-shell";
import { requirePartnerSession } from "@/lib/partner-session";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export const dynamic = "force-dynamic";

function buildNavItems(locale: Locale): PartnerNavItem[] {
  return [
    {
      href: "/partner/start",
      label: t("partner.nav.start.label", locale),
      note: t("partner.nav.start.note", locale),
    },
    {
      href: "/partner/eligibility",
      label: t("partner.nav.eligibility.label", locale),
      note: t("partner.nav.eligibility.note", locale),
    },
    {
      href: "/partner/booking/new",
      label: t("partner.nav.bookingNew.label", locale),
      note: t("partner.nav.bookingNew.note", locale),
    },
  ];
}

export default async function PartnerAuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requirePartnerSession();
  const locale = await getServerLocale();

  return (
    <PartnerAuthenticatedShell
      navItems={buildNavItems(locale)}
      session={{
        partnerCode: session.partnerEntry.partnerCode,
        displayName: session.partnerEntry.displayName,
        entrySlug: session.partnerEntry.entrySlug,
        programCode: session.partnerEntry.programCode,
        bankCode: session.partnerEntry.bankCode,
        eligibilityMode: session.partnerEntry.eligibilityMode,
        authMode: session.partnerEntry.authMode,
        themeAccent: session.partnerEntry.themeAccent,
        identityActorType: session.identity.actorType,
        identityActorId: session.identity.actorId,
        expiresAt: session.expiresAt,
      }}
    >
      {children}
    </PartnerAuthenticatedShell>
  );
}
