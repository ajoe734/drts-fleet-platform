"use client";
import { PublicFareScreen } from "../../components/booking/public-fare-screen";

/** E-19a 費用與優惠說明, publicly readable without signing in. */
export default function FeesPage() {
  return <PublicFareScreen kind="fees" />;
}
