import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import type { UpdatePassengerMeCommand } from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerAccountService } from "./passenger-account.service";

/** Accept canonical snake_case wire keys and contract camelCase; reject ambiguous/unknown input. */
function command(
  body: unknown,
  fields: Record<string, string>,
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiRequestError(
      400,
      "validation_error",
      "Invalid account command.",
    );
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const canonical = fields[key];
    if (!canonical || Object.prototype.hasOwnProperty.call(result, canonical))
      throw new ApiRequestError(
        400,
        "validation_error",
        "Invalid account command.",
      );
    result[canonical] = value;
  }
  return result;
}
const PROFILE_FIELDS = {
  displayName: "displayName",
  display_name: "displayName",
  contactPhone: "contactPhone",
  contact_phone: "contactPhone",
  termsVersion: "termsVersion",
  terms_version: "termsVersion",
  privacyVersion: "privacyVersion",
  privacy_version: "privacyVersion",
  feeAcknowledgementVersion: "feeAcknowledgementVersion",
  fee_acknowledgement_version: "feeAcknowledgementVersion",
  contactConsent: "contactConsent",
  contact_consent: "contactConsent",
};
const TOKEN_FIELDS = {
  refreshToken: "refreshToken",
  refresh_token: "refreshToken",
};

@Controller("passenger-app")
@RequireRealms("passenger")
export class PassengerAccountController {
  constructor(private readonly accounts: PassengerAccountService) {}
  @Get("me")
  async me(@CurrentIdentity() identity: RequestIdentity | null) {
    return toApiSuccessEnvelope(await this.accounts.getMe(identity));
  }
  @Patch("me")
  async update(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
  ) {
    return toApiSuccessEnvelope(
      await this.accounts.updateMe(
        identity,
        command(body, PROFILE_FIELDS) as UpdatePassengerMeCommand,
      ),
    );
  }
  @Get("me/identities")
  async identities(@CurrentIdentity() identity: RequestIdentity | null) {
    return toApiSuccessEnvelope(await this.accounts.listIdentities(identity));
  }
  @Delete("me/identities/:id")
  async unlink(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
  ) {
    return toApiSuccessEnvelope(
      await this.accounts.unlinkIdentity(identity, id),
    );
  }
  @Delete("me")
  async remove(@CurrentIdentity() identity: RequestIdentity | null) {
    return toApiSuccessEnvelope(await this.accounts.deleteAccount(identity));
  }
  @Post("auth/refresh")
  @OpenRoute()
  async refresh(@Body() body: unknown) {
    return toApiSuccessEnvelope(
      await this.accounts.refresh(command(body, TOKEN_FIELDS).refreshToken),
    );
  }
  @Post("auth/logout")
  @OpenRoute()
  async logout(@Body() body: unknown) {
    return toApiSuccessEnvelope(
      await this.accounts.logout(command(body, TOKEN_FIELDS).refreshToken),
    );
  }
}
