import { PendingDesignPage } from "@/components/pending-design-page";

export default function AuditPage() {
  return (
    <PendingDesignPage
      route="/audit"
      titleZh="稽核軌跡"
      titleEn="Audit trail"
      summary="Placeholder for eligibility, dispatch, and settlement audit views."
      bullets={[
        "The final screen must preserve issuer-tenant masking and read-only posture.",
        "This page exists so the app shell can build and route without inventing the audit IA.",
      ]}
    />
  );
}
