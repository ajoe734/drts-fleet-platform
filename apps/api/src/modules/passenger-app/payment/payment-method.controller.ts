import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerAccountService } from "../account/passenger-account.service";
import { PaymentMethodService } from "./payment-method.service";

@Controller("passenger-app/payment-methods")
@RequireRealms("passenger")
export class PaymentMethodController {
  constructor(
    private readonly methods: PaymentMethodService,
    private readonly accounts: PassengerAccountService,
  ) {}

  private async owner(identity: RequestIdentity | null): Promise<string> {
    const { account } = await this.accounts.getMe(identity);
    return account.drtsPassengerId;
  }

  private async ownerBindingSession(identity: RequestIdentity | null) {
    const { account } = await this.accounts.getMe(identity);
    const extended = account as {
      email?: string | null;
      phone?: string | null;
      verifiedEmail?: string | null;
      verifiedPhone?: string | null;
      contactPhone?: string | null;
    };
    const email =
      extended.email?.trim() || extended.verifiedEmail?.trim() || "";
    const phone =
      extended.phone?.trim() ||
      extended.verifiedPhone?.trim() ||
      extended.contactPhone?.trim() ||
      "";
    return this.methods.createBindingSession(account.drtsPassengerId, {
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  @Get()
  async list(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Query("binding_session") bindingSession?: string,
  ) {
    if (bindingSession === "1" || bindingSession === "true") {
      return toApiSuccessEnvelope(await this.ownerBindingSession(identity));
    }
    return toApiSuccessEnvelope(
      await this.methods.list(await this.owner(identity)),
    );
  }
  @Post("binding-session")
  async createBindingSession(
    @CurrentIdentity() identity: RequestIdentity | null,
  ) {
    return toApiSuccessEnvelope(await this.ownerBindingSession(identity));
  }
  @Post("ecpay/callback")
  @OpenRoute()
  @HttpCode(200)
  @Header("Content-Type", "text/plain; charset=utf-8")
  async verifyNotification(@Body() body: unknown): Promise<string> {
    await this.methods.verifyNotification(body);
    return "1|OK";
  }
  @Post("ecpay/order-result")
  @OpenRoute()
  @HttpCode(200)
  async verifyOrderResult(@Body() body: unknown) {
    return toApiSuccessEnvelope(await this.methods.verifyNotification(body));
  }
  @Post("3ds-complete")
  async complete3dsBinding(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
    @Headers("Idempotency-Key") idempotencyKey?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.verifyNotification(body, {
        passengerId: await this.owner(identity),
        ...(idempotencyKey?.trim()
          ? { idempotencyKey: idempotencyKey.trim() }
          : {}),
      }),
    );
  }
  @Post()
  async bind(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.bind(await this.owner(identity), body),
    );
  }
  @Put(":id/default")
  async setDefault(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.setDefault(await this.owner(identity), id),
    );
  }
  @Delete(":id")
  async remove(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.remove(await this.owner(identity), id),
    );
  }
}
