import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type { CreatePassengerComplaintCommand } from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerComplaintService } from "./passenger-complaint.service";

@Controller("passenger-app/rides")
@RequireRealms("passenger")
export class PassengerComplaintController {
  constructor(private readonly service: PassengerComplaintService) {}

  @Post(":id/complaints")
  async create(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") orderId: string,
    @Body() command: CreatePassengerComplaintCommand,
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("x-request-id") requestId?: string,
  ) {
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
    return toApiSuccessEnvelope(
      await this.service.create(
        identity.drtsPassengerId,
        orderId,
        command,
        idempotencyKey,
      ),
      requestId,
    );
  }
}
