import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ApiRequestError } from "../../../common/api-envelope";
import type { AuthenticatedRequestLike } from "../../../common/auth/auth.types";
import { PassengerBookingService } from "./passenger-booking.service";

@Injectable()
export class PassengerRideEventsGuard implements CanActivate {
  constructor(private readonly service: PassengerBookingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike & { params: { id?: string } }>();
    const identity = request.identity;
    if (identity?.realm !== "passenger") {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    }

    // Nest awaits guards before entering its interceptor/SSE lifecycle. Checking
    // inside the Observable (or an async handler wrapped by a global interceptor)
    // lets pending DB ownership rejection arrive after SSE commits HTTP 200.
    await this.service.getRide(
      identity.drtsPassengerId,
      request.params.id ?? "",
    );
    return true;
  }
}
