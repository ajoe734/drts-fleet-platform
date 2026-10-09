import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Patch,
  Param,
  HttpCode,
} from "@nestjs/common";
import { PassengerAccountService } from "./passenger-account.service";
import { CurrentIdentity } from "../../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../../common/auth/auth.types";
import type {
  UpdatePassengerMeCommand,
  RefreshSessionCommand,
  LogoutCommand,
} from "@drts/contracts";

@Controller("passenger-app")
export class PassengerAccountController {
  constructor(private readonly service: PassengerAccountService) {}

  @Post("auth/refresh")
  @HttpCode(200)
  async refreshSession(@Body() body: RefreshSessionCommand) {
    return this.service.refreshSession(body.refreshToken);
  }

  @Post("auth/logout")
  @HttpCode(200)
  async logout(@Body() body: LogoutCommand) {
    await this.service.logout(body.refreshToken);
    return { success: true };
  }

  @Get("me")
  async getMe(@CurrentIdentity() identity: BootstrapRequestIdentity) {
    if (!identity.drtsPassengerId) throw new Error("Unauthorized");
    const account = await this.service.getAccount(identity.drtsPassengerId);
    return { account };
  }

  @Patch("me")
  async updateMe(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Body() body: UpdatePassengerMeCommand,
  ) {
    if (!identity.drtsPassengerId) throw new Error("Unauthorized");
    await this.service.updateAccount(identity.drtsPassengerId, body);
    const account = await this.service.getAccount(identity.drtsPassengerId);
    return { account };
  }

  @Delete("me")
  async deleteAccount(@CurrentIdentity() identity: BootstrapRequestIdentity) {
    if (!identity.drtsPassengerId) throw new Error("Unauthorized");
    await this.service.deleteAccount(identity.drtsPassengerId);
    return { success: true };
  }

  @Get("me/identities")
  async getIdentities(@CurrentIdentity() identity: BootstrapRequestIdentity) {
    if (!identity.drtsPassengerId) throw new Error("Unauthorized");
    const identities = await this.service.getIdentities(
      identity.drtsPassengerId,
    );
    return { identities };
  }

  @Delete("me/identities/:id")
  async unlinkIdentity(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Param("id") id: string,
  ) {
    if (!identity.drtsPassengerId) throw new Error("Unauthorized");
    await this.service.unlinkIdentity(identity.drtsPassengerId, id);
    return { success: true };
  }
}
