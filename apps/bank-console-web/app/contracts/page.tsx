import { PendingDesignPage } from "@/components/pending-design-page";

export default function ContractsPage() {
  return (
    <PendingDesignPage
      route="/contracts"
      titleZh="合約與 SLA"
      titleEn="Contracts and SLA"
      summary="Placeholder for issuer contract posture and SLA attainment."
      bullets={[
        "This is a brand-new screen family with no tenant-console canvas precedent.",
        "Implementation stops at shell + placeholder until the bank-console canvas lands.",
      ]}
    />
  );
}
