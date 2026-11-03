"use client";
import { PublicFareScreen } from "../../components/booking/public-fare-screen";

/** E-05 計費說明: the current public tariff from the fares API. */
export default function FaresPage() {
  return <PublicFareScreen kind="fares" />;
}
