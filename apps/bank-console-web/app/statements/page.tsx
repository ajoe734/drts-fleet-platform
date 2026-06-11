import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function StatementsPage() {
  return (
    <PendingScreen
      title={t("statements.title")}
      purpose={t("statements.purpose")}
    />
  );
}
