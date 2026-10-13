import type {
  AuthProvider,
  FareQuoteCommand,
  PassengerAccount,
  PassengerLoginIdentity,
  PassengerPaymentMethod,
} from "@drts/contracts";

export type DemoRideStatus =
  | "reserved"
  | "assigned"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface DemoAddress {
  address: string;
  lat: number;
  lng: number;
}

export interface DemoComplaint {
  id: string;
  category: "service" | "fare" | "lost_item" | "other";
  content: string;
  lostItemDescription?: string;
  contactConsent: boolean;
  createdAt: string;
  status: "received";
}

export interface DemoRide {
  id: string;
  orderNo: string;
  status: DemoRideStatus;
  origin: DemoAddress;
  destination: DemoAddress;
  scheduledAt: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  paymentMethodId: string;
  paymentStatus: "pending" | "paid" | "failed";
  amount: number;
  estimatedMin: number;
  estimatedMax: number;
  driver: { name: string; plate: string; vehicle: string };
  operator: string;
  rating: number | null;
  ratingTags: string[];
  ratingComment: string;
  contactRequested: boolean;
  complaints: DemoComplaint[];
}

export interface DemoQuote {
  id: string;
  command: FareQuoteCommand;
  estimatedMin: number;
  estimatedMax: number;
  expiresAt: string;
}

export interface DemoReceipt {
  id: string;
  rideId: string;
  orderNo: string;
  issuedAt: string;
  operator: string;
  driverName: string;
  driverCredential: string;
  vehiclePlate: string;
  pickup: string;
  destination: string;
  scheduledAt: string;
  completedAt: string;
  paymentMethod: string;
  amount: number;
  currency: "TWD";
  lines: { label: string; amount: number }[];
  notice: string;
}

export interface DemoState {
  version: 1;
  enabled: boolean;
  loggedIn: boolean;
  account: PassengerAccount;
  identities: PassengerLoginIdentity[];
  paymentMethods: PassengerPaymentMethod[];
  bindingMethods: Record<string, string>;
  rides: DemoRide[];
  quotes: DemoQuote[];
  otp: {
    challenge: string;
    target: string;
    provider: "phone" | "email";
    purpose: "login" | "link" | "verify_contact_phone";
  } | null;
  oauth: {
    provider: AuthProvider;
    state: string;
    transactionId: string;
    purpose: "login" | "link";
  } | null;
  requestRides: Record<string, string>;
}
