import { Injectable } from "@nestjs/common";
import type {
  CreatePassengerComplaintCommand,
  CreatePassengerComplaintResponse,
} from "@drts/contracts";
import { PassengerBookingService } from "../booking/passenger-booking.service";
import { ComplaintService } from "../../complaint/complaint.service";
import { normalizePassengerComplaintIntake } from "../../complaint/passenger-complaint-intake";

@Injectable()
export class PassengerComplaintService {
  constructor(
    private readonly bookingService: PassengerBookingService,
    private readonly complaintService: ComplaintService,
  ) {}

  async create(
    passengerId: string,
    orderId: string,
    command: CreatePassengerComplaintCommand,
    idempotencyKey: string,
  ): Promise<CreatePassengerComplaintResponse> {
    // Exercise the delivered booking + multi-taxi authority before any write.
    await this.bookingService.getRide(passengerId, orderId);
    const intake = normalizePassengerComplaintIntake({
      passengerId,
      orderId,
      command,
      idempotencyKey,
    });
    return this.complaintService.createPassengerComplaintCase(intake);
  }
}
