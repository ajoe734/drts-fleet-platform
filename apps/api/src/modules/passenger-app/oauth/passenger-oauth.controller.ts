import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiRequestError, toApiSuccessEnvelope } from "../../../common/api-envelope";
import { CurrentIdentity, OpenRoute } from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { listConfiguredAuthProviders } from "./oauth-provider.config";
import type { OAuthProvider } from "./oauth-transaction.port";
import { PassengerOAuthService } from "./passenger-oauth.service";

const PROVIDER_PATH_SEGMENTS = new Set<OAuthProvider>([
  "google",
  "facebook",
  "line",
]);
function providerFromPath(raw: string): OAuthProvider {
  if (!PROVIDER_PATH_SEGMENTS.has(raw as OAuthProvider))
    throw new ApiRequestError(
      400,
      "unsupported_provider",
      "Unknown OAuth provider.",
    );
  return raw as OAuthProvider;
}

@Controller("passenger-app/auth")
export class PassengerOAuthController {
  constructor(private readonly oauth: PassengerOAuthService) {}

  @Get("providers")
  @OpenRoute()
  providers() {
    return toApiSuccessEnvelope({ providers: listConfiguredAuthProviders() });
  }

  @Post("oauth/:provider/start")
  @OpenRoute()
  async start(
    @Param("provider") provider: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity | null,
  ) {
    return toApiSuccessEnvelope(
      await this.oauth.start(providerFromPath(provider), body, identity),
    );
  }

  @Post("oauth/:provider/callback")
  @OpenRoute()
  async callback(
    @Param("provider") provider: string,
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity | null,
  ) {
    return toApiSuccessEnvelope(
      await this.oauth.callback(providerFromPath(provider), body, identity),
    );
  }
}
