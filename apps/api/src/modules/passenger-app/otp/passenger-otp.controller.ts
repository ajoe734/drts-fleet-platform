import { isIP } from "node:net";
import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { RequestOtpCommand, VerifyOtpCommand } from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import {
  OTP_OPTIONS,
  PassengerOtpService,
  type OtpOptions,
} from "./passenger-otp.service";

export interface OtpHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
function invalid(): never {
  throw new ApiRequestError(400, "validation_error", "Invalid OTP command.");
}
function command(body: unknown, verify: boolean): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
  const aliases: Record<string, string> = {
    target: "target",
    provider: "provider",
    channel: "provider",
    ...(verify
      ? { code: "code", challenge: "challenge" }
      : { purpose: "purpose" }),
  };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const canonical = Object.prototype.hasOwnProperty.call(aliases, key)
      ? aliases[key]
      : undefined;
    if (!canonical || Object.prototype.hasOwnProperty.call(result, canonical))
      invalid();
    result[canonical] = value;
  }
  return result;
}
/** Only opt-in, operator-configured proxy hops may contribute forwarding information.
 * Default: socket peer. Never trust a request body IP or arbitrary leftmost XFF.
 */
export function otpClientIp(
  request: OtpHttpRequest,
  trustedProxyHops: number,
): string {
  const forwarded = request.headers["x-forwarded-for"];
  const chain =
    trustedProxyHops > 0 && typeof forwarded === "string"
      ? forwarded.split(",").map((ip) => ip.trim())
      : [];
  chain.push(request.socket?.remoteAddress ?? "");
  const ip = chain[Math.max(0, chain.length - 1 - trustedProxyHops)] ?? "";
  if (!isIP(ip)) invalid();
  const mapped = /^::ffff:([0-9.]+)$/i.exec(ip)?.[1];
  if (mapped && isIP(mapped) === 4) return mapped;
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}

@Controller("passenger-app/auth")
export class PassengerOtpController {
  constructor(
    private readonly otp: PassengerOtpService,
    @Inject(OTP_OPTIONS) private readonly options: OtpOptions,
  ) {}
  @OpenRoute()
  providers() {
    return toApiSuccessEnvelope(this.otp.providers());
  }
  @Post("otp/request")
  @OpenRoute()
  async request(
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Req() request: OtpHttpRequest,
  ) {
    return toApiSuccessEnvelope(
      await this.otp.request(
        command(body, false) as unknown as RequestOtpCommand,
        identity,
        otpClientIp(request, this.options.trustedProxyHops),
      ),
    );
  }
  @Post("otp/verify")
  @OpenRoute()
  async verify(
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Req() request: OtpHttpRequest,
  ) {
    const ua = request.headers["user-agent"];
    return toApiSuccessEnvelope(
      await this.otp.verify(
        command(body, true) as unknown as VerifyOtpCommand,
        identity,
        typeof ua === "string" ? ua.slice(0, 512) : "",
      ),
    );
  }
}
