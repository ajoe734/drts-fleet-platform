import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { OpenRoute } from "../../../common/auth/auth.decorators";
import { FacebookDataDeletionService } from "./facebook-data-deletion.service";

@Controller("passenger-app/auth/facebook/data-deletion")
export class FacebookDataDeletionController {
  constructor(private readonly deletion: FacebookDataDeletionService) {}

  @Post()
  @HttpCode(200)
  @OpenRoute()
  async delete(@Body() body: unknown) {
    // Meta requires a bare {url, confirmation_code}, not the API envelope.
    return this.deletion.delete(body);
  }

  @Get("status/:code")
  @OpenRoute()
  status(@Param("code") code: string) {
    return this.deletion.status(code);
  }
}
