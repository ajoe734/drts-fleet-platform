import { PendingDesignPage } from "@/components/pending-design-page";

export default function HomePage() {
  return (
    <PendingDesignPage
      route="/"
      titleZh="總覽首頁"
      titleEn="Home overview"
      summary="Issuer dashboard placeholder only. Final layout waits for the dedicated bank-console design canvas."
      bullets={[
        "Today bookings, quota burn, and SLA posture belong here after design delivery.",
        "This shell intentionally avoids inventing dashboard cards or data density.",
      ]}
    />
  );
}
