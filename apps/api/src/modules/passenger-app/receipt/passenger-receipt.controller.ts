import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type {
  PassengerRequestIdentity,
  RequestIdentity,
} from "../../../common/auth/auth.types";
import type { PassthroughResponseLike } from "../../../common/idempotency-http";
import { PassengerBookingService } from "../booking/passenger-booking.service";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";

@Controller("passenger-app/rides")
@RequireRealms("passenger")
export class PassengerReceiptController {
  constructor(
    private readonly bookingService: PassengerBookingService,
    private readonly multiTaxiService: MultiTaxiService,
  ) {}

  @Get(":id/receipt/downloads")
  async downloads(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") orderId: string,
    @Res({ passthrough: true }) response: PassthroughResponseLike,
  ) {
    this.setPrivateHeaders(response);
    const passengerId = this.requirePassenger(identity).drtsPassengerId;
    await this.bookingService.getRide(passengerId, orderId);
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getTrustedPassengerReceiptDownloads(
        orderId,
        passengerId,
      ),
    );
  }

  @Get(":id/receipt/artifacts/html")
  async html(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") orderId: string,
    @Res({ passthrough: true }) response: PassthroughResponseLike,
  ) {
    return this.artifact(identity, orderId, "html", response);
  }

  @Get(":id/receipt/artifacts/pdf")
  async pdf(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") orderId: string,
    @Res({ passthrough: true }) response: PassthroughResponseLike,
  ) {
    return this.artifact(identity, orderId, "pdf", response);
  }

  private requirePassenger(
    identity: RequestIdentity | null,
  ): PassengerRequestIdentity {
    if (
      !identity ||
      identity.realm !== "passenger" ||
      identity.actorType !== "first_party_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "A passenger identity is required.",
      );
    }
    return identity;
  }

  private async artifact(
    identity: RequestIdentity | null,
    orderId: string,
    format: "html" | "pdf",
    response: PassthroughResponseLike,
  ) {
    this.setPrivateHeaders(response);
    const passengerId = this.requirePassenger(identity).drtsPassengerId;
    await this.bookingService.getRide(passengerId, orderId);
    const artifact =
      await this.multiTaxiService.getTrustedPassengerReceiptArtifact(
        orderId,
        passengerId,
        format,
      );
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.fileName}"`,
    });
  }

  private setPrivateHeaders(response: PassthroughResponseLike) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    );
  }
}
