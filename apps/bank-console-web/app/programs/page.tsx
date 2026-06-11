import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function ProgramsPage() {
  return (
    <PendingScreen
      title={t("programs.title")}
      purpose={t("programs.purpose")}
    />
  );
}
