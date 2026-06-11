import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function UsersPage() {
  return (
    <PendingScreen title={t("users.title")} purpose={t("users.purpose")} />
  );
}
