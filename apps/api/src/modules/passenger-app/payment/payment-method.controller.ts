import {
  Body,
  Controller,
  Delete,
  Get,
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
  @Get()
  async list(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Query("binding_session") bindingSession?: string,
  ) {
    if (bindingSession === "1" || bindingSession === "true") {
      return toApiSuccessEnvelope(
        await this.methods.createBindingSession(await this.owner(identity)),
      );
    }
    return toApiSuccessEnvelope(
      await this.methods.list(await this.owner(identity)),
    );
  }
  @Post("binding-session")
  async createBindingSession(
    @CurrentIdentity() identity: RequestIdentity | null,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.createBindingSession(await this.owner(identity)),
    );
  }
  @Post("ecpay/callback")
  @OpenRoute()
  async verifyNotification(@Body() body: unknown) {
    return toApiSuccessEnvelope(await this.methods.verifyNotification(body));
  }
  @Post("3ds-complete")
  async complete3dsBinding(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
  ) {
    return toApiSuccessEnvelope(
      await this.methods.verifyNotification(body, {
        passengerId: await this.owner(identity),
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
