import { PendingScreen } from "@/components/pending-screen";
import { t } from "@/lib/translations";

export default function BookingsPage() {
  return (
    <PendingScreen
      title={t("bookings.title")}
      purpose={t("bookings.purpose")}
    />
  );
}
