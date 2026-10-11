export interface RequestOtpCommand {
  target: string;
  provider: "phone" | "email";
  purpose: "login" | "link" | "verify_contact_phone";
}

export interface RequestOtpResponse {
  success: boolean;
  challenge: string;
  message?: string;
}

export interface OAuthStartCommand {
  provider: "google" | "facebook" | "line";
  redirectUri: string;
  purpose: "login" | "link";
}

export interface OAuthStartResponse {
  authUrl: string;
}

export interface UpdatePassengerMeCommand {
  displayName?: string;
  contactPhone?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

export interface PassengerIdentitiesResponse {
  identities: any[];
}

export interface UnlinkPassengerIdentityCommand {
  identityId: string;
}

export interface UnlinkPassengerIdentityResponse {
  success: boolean;
}

export interface DeletePassengerAccountResponse {
  success: boolean;
}
