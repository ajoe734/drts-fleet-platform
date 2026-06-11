import { PendingDesignPage } from "@/components/pending-design-page";

export default function StatementsPage() {
  return (
    <PendingDesignPage
      route="/statements"
      titleZh="對帳單"
      titleEn="Settlement statements"
      summary="Placeholder for period-level settlement statements and per-trip reconciliation."
      bullets={[
        "The final screen must follow the issuer-pays-DRTS statement design hand-off.",
        "Masked benefit/cardholder references are required once data binding is added.",
      ]}
    />
  );
}
