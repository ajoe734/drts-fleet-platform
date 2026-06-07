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
    label: "入口總覽",
    note: "查看入口摘要、可執行操作與合作夥伴模式邊界。",
  },
  {
    href: "/partner/eligibility",
    label: "資格驗證",
    note: "建立訂單前，先為這個入口完成乘客資格驗證。",
  },
  {
    href: "/partner/booking/new",
    label: "建立訂單",
    note: "使用已驗證資格建立帶有合作夥伴脈絡的訂單。",
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
