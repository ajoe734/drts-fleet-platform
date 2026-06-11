import { PendingDesignPage } from "@/components/pending-design-page";

export default function BookingsPage() {
  return (
    <PendingDesignPage
      route="/bookings"
      titleZh="訂單清單"
      titleEn="Bookings list"
      summary="Placeholder for the card-benefit bookings list."
      bullets={[
        "The design packet requires cardholder/program/flight/direction/state columns instead of corporate cost-centre fields.",
        "No mock tables or invented filters are shipped in this scaffold.",
      ]}
    />
  );
}
