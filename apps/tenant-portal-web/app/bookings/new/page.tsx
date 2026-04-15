import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CreateTenantBookingCommand,
  BusinessDispatchSubtype,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

function toIsoString(localDateTime: string): string {
  if (!localDateTime) return "";
  const d = new Date(localDateTime);
  return d.toISOString();
}

const formStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "0.75rem",
  maxWidth: "640px",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr",
  alignItems: "center",
  gap: "0.5rem",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#0d6efd",
  border: "1px solid #0d6efd",
  color: "#fff",
  padding: "0.5rem 0.75rem",
  borderRadius: "4px",
  cursor: "pointer",
};

export default async function NewBookingPage() {
  async function createBooking(formData: FormData) {
    "use server";

    const client = getTenantClient();

    const businessDispatchSubtype = formData.get(
      "businessDispatchSubtype",
    ) as BusinessDispatchSubtype;
    const pickupAddress = (formData.get("pickup") as string) || "";
    const dropoffAddress = (formData.get("dropoff") as string) || "";
    const windowStartLocal =
      (formData.get("reservationWindowStart") as string) || "";
    const windowEndLocal =
      (formData.get("reservationWindowEnd") as string) || "";
    const passengerName = (formData.get("passengerName") as string) || "";
    const passengerPhone = (formData.get("passengerPhone") as string) || "";

    const command: CreateTenantBookingCommand = {
      businessDispatchSubtype,
      pickup: { address: pickupAddress },
      dropoff: { address: dropoffAddress },
      reservationWindowStart: toIsoString(windowStartLocal),
      reservationWindowEnd: toIsoString(windowEndLocal),
      passenger: {
        name: passengerName,
        phone: passengerPhone,
      },
    };

    try {
      await client.createTenantBooking(command);
      revalidatePath("/booking-list");
      redirect("/booking-list");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      redirect(`/bookings/new?error=${encodeURIComponent(msg)}`);
    }
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking Wizard"
        description="Create a new business dispatch booking using the real API."
      >
        <form action={createBooking} style={formStyle}>
          <div style={rowStyle}>
            <label htmlFor="businessDispatchSubtype">Subtype</label>
            <select
              id="businessDispatchSubtype"
              name="businessDispatchSubtype"
              required
              defaultValue="credit_card_airport_transfer"
            >
              <option value="credit_card_airport_transfer">
                credit_card_airport_transfer
              </option>
              <option value="enterprise_dispatch">enterprise_dispatch</option>
            </select>
          </div>

          <div style={rowStyle}>
            <label htmlFor="pickup">Pickup Address</label>
            <input id="pickup" name="pickup" type="text" required />
          </div>

          <div style={rowStyle}>
            <label htmlFor="dropoff">Dropoff Address</label>
            <input id="dropoff" name="dropoff" type="text" required />
          </div>

          <div style={rowStyle}>
            <label htmlFor="reservationWindowStart">Window Start</label>
            <input
              id="reservationWindowStart"
              name="reservationWindowStart"
              type="datetime-local"
              required
            />
          </div>

          <div style={rowStyle}>
            <label htmlFor="reservationWindowEnd">Window End</label>
            <input
              id="reservationWindowEnd"
              name="reservationWindowEnd"
              type="datetime-local"
              required
            />
          </div>

          <div style={rowStyle}>
            <label htmlFor="passengerName">Passenger Name</label>
            <input
              id="passengerName"
              name="passengerName"
              type="text"
              required
            />
          </div>

          <div style={rowStyle}>
            <label htmlFor="passengerPhone">Passenger Phone</label>
            <input
              id="passengerPhone"
              name="passengerPhone"
              type="tel"
              required
            />
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button type="submit" style={primaryButtonStyle}>
              Create Booking
            </button>
            <Link href="/booking-list" style={{ marginLeft: "0.75rem" }}>
              <strong>Back to list</strong> Return to booking list.
            </Link>
          </div>
        </form>
      </AppShellCard>
    </main>
  );
}
