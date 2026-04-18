import { Controller, Post, Req } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { validateInternalKey } from "../../common/auth/internal-key.middleware";
import { extractBootstrapRequestIdentity } from "../../common/auth/auth.extractor";
import type { AuthBootstrapHeaders } from "../../common/auth/auth.types";

interface TokenRequest {
  headers: AuthBootstrapHeaders & { "x-drts-internal-key"?: string };
  method?: string;
  originalUrl?: string;
  url?: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly jwtAuthService: JwtAuthService) {}

  @Post("token")
  issueToken(@Req() request: TokenRequest): {
    token: string;
    expiresIn: string;
  } {
    // Require internal key to issue tokens
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);

    const identity = extractBootstrapRequestIdentity(request.headers, {
      allowAnonymous: false,
      method: request.method,
      requestUrl: request.originalUrl ?? request.url,
    });

    if (!identity) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
        {},
      );
    }

    const expiresIn = identity.actorType === "system" ? "1h" : "8h";
    const token = this.jwtAuthService.sign(identity, { expiresIn });
    return { token, expiresIn };
  }
}
