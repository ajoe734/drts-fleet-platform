import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function AuditPage() {
  return (
    <PendingScreen title={t("audit.title")} purpose={t("audit.purpose")} />
  );
}
