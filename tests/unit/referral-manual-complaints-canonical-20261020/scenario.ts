import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
export async function scenario() {
  const f = await domainFixture();
  const identity = await f.identity();
  const command = await f.command(identity);
  const ack = await f.service.createReferralPassengerBooking(command, identity);
  const orderId = ack.orderId;
  const read = () => f.service.getReferralPassengerActiveTrip(identity);
  const stored = async () =>
    structuredClone(await f.repository.findOrderById(orderId));
  const change = async (delta: Record<string, unknown>) => {
    const row = await stored();
    if (!row) throw new Error("Actual producer row missing");
    // Controlled storage row states for policy/read-only boundary tests. The
    // order and legitimate identity were made by actual production producers.
    f.db.table("ops.phase1_owned_orders").set(orderId, { ...row, ...delta });
  };
  return { ...f, identity, orderId, read, stored, change };
}
