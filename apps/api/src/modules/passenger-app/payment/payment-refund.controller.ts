import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import { PaymentRefundService } from "./payment-refund.service";

@Controller("passenger-app/platform/rides")
@RequireRealms("platform")
@RequireScopes("billing:write")
export class PaymentRefundController {
  constructor(private readonly refunds: PaymentRefundService) {}
  @Post(":id/refund")
  async refund(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return toApiSuccessEnvelope(await this.refunds.refund(identity, id, body));
  }
}
