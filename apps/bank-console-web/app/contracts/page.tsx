import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function ContractsPage() {
  return (
    <PendingScreen
      title={t("contracts.title")}
      purpose={t("contracts.purpose")}
    />
  );
}
