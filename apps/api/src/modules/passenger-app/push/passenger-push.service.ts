import { Injectable } from "@nestjs/common";
import type {
  RegisterPushDeviceCommand,
  RegisterPushDeviceResponse,
  UnregisterPushDeviceResponse,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { DatabaseService } from "../../../common/db/database.service";
import { PassengerAccountService } from "../account/passenger-account.service";
import { PassengerPushDevicesService } from "../../passenger-push-devices/passenger-push-devices.service";

const fields: Record<string, keyof RegisterPushDeviceCommand> = {
  platform: "platform",
  provider: "provider",
  token: "token",
  appId: "appId",
  app_id: "appId",
  appVersion: "appVersion",
  app_version: "appVersion",
  notificationConsentVersion: "notificationConsentVersion",
  notification_consent_version: "notificationConsentVersion",
  previousDeviceId: "previousDeviceId",
  previous_device_id: "previousDeviceId",
};
function invalid(): never {
  throw new ApiRequestError(
    400,
    "validation_error",
    "Invalid push device command.",
  );
}
function command(body: unknown): RegisterPushDeviceCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
  const value: Record<string, string> = {};
  for (const [key, item] of Object.entries(body)) {
    const canonical = Object.prototype.hasOwnProperty.call(fields, key)
      ? fields[key]
      : undefined;
    if (
      !canonical ||
      canonical in value ||
      typeof item !== "string" ||
      !item.trim()
    )
      invalid();
    value[canonical] = item;
  }
  if (
    (value.platform !== "ios" && value.platform !== "android") ||
    value.provider !== "fcm_v1" ||
    !value.appId ||
    !value.appVersion ||
    !value.token ||
    !value.notificationConsentVersion
  )
    invalid();
  return value as unknown as RegisterPushDeviceCommand;
}
@Injectable()
export class PassengerPushService {
  constructor(
    private readonly accounts: PassengerAccountService,
    private readonly devices: PassengerPushDevicesService,
    private readonly database: DatabaseService,
  ) {}
  private async ownDevice(owner: string, deviceId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        deviceId,
      )
    )
      throw new ApiRequestError(404, "not_found", "Push device not found.");
    if (!this.database.isEnabled())
      throw new ApiRequestError(
        503,
        "unavailable",
        "Push device storage is unavailable.",
      );
    const result = await this.database.query<{ drts_passenger_id: string }>(
      "SELECT drts_passenger_id FROM iam.phase1_passenger_push_devices WHERE device_id = $1",
      [deviceId],
    );
    if (result.rows[0]?.drts_passenger_id !== owner)
      throw new ApiRequestError(404, "not_found", "Push device not found.");
  }
  async register(
    identity: RequestIdentity | null,
    body: unknown,
  ): Promise<RegisterPushDeviceResponse> {
    const { account } = await this.accounts.getMe(identity);
    const request = command(body);
    if (request.previousDeviceId)
      await this.ownDevice(account.drtsPassengerId, request.previousDeviceId);
    const device = await this.devices.registerDevice({
      ...request,
      drtsPassengerId: account.drtsPassengerId,
    });
    // Registry registration deliberately starts last_seen_at=NULL; this own API
    // call records an actual client sighting through the existing mutation.
    await this.devices.touchDevice(device.deviceId);
    return { deviceId: device.deviceId };
  }
  async unregister(
    identity: RequestIdentity | null,
    deviceId: string,
  ): Promise<UnregisterPushDeviceResponse> {
    const { account } = await this.accounts.getMe(identity);
    await this.ownDevice(account.drtsPassengerId, deviceId);
    await this.devices.revokeDevice(deviceId);
    return { success: true };
  }
}
