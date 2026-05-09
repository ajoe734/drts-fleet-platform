import type { ReactNode } from "react";
import {
  PartnerAuthenticatedShell,
  type PartnerNavItem,
} from "@/components/partner-shell";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

const NAV_ITEMS: PartnerNavItem[] = [
  {
    href: "/partner/start",
    label: "Start",
    note: "Entry summary, allowed actions, and partner-safe boundaries.",
  },
  {
    href: "/partner/eligibility",
    label: "Eligibility",
    note: "Verify rider eligibility for this entry before booking creation.",
  },
  {
    href: "/partner/booking/new",
    label: "New booking",
    note: "Create a partner-tagged booking using verified eligibility.",
  },
];

export default async function PartnerAuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requirePartnerSession();

  return (
    <PartnerAuthenticatedShell
      navItems={NAV_ITEMS}
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
