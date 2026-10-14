"use server";

import { revalidatePath } from "next/cache";
import type { UpsertTenantPassengerCommand } from "@drts/contracts";
import { getTenantClient } from "../../lib/api-client";
import { getServerLocale } from "../../lib/server-locale";
import { t } from "../../lib/translations";
import {
  getPageActions,
  getPassengerActions,
  isPassengerAction,
} from "./passenger-actions";

export type PassengerActionResult = { ok: boolean; message: string };

export async function savePassengerAction(
  formData: FormData,
): Promise<PassengerActionResult> {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const action = text("action");
  if (!isPassengerAction(action)) {
    return { ok: false, message: t("passengers.form.unavailable", locale) };
  }

  try {
    const passengers = await client.listPassengers();
    const current = passengers.find(
      (item) => item.passengerId === text("passengerId"),
    );
    if (action !== "create" && !current) {
      return { ok: false, message: t("passengers.form.notFound", locale) };
    }
    const availableActions =
      action === "create"
        ? getPageActions(passengers)
        : getPassengerActions(current!);
    const descriptor = availableActions.find((item) => item.action === action);
    if (!descriptor?.enabled) {
      return { ok: false, message: t("passengers.form.unavailable", locale) };
    }

    const reason = text("reason");
    if (descriptor.requiresReason && !reason) {
      return {
        ok: false,
        message: t("passengers.form.reasonRequired", locale),
      };
    }
    const changesDetails = action === "create" || action === "edit";
    const fullName = changesDetails ? text("fullName") : current!.fullName;
    if (!fullName) {
      return { ok: false, message: t("passengers.form.nameRequired", locale) };
    }

    const command: UpsertTenantPassengerCommand = { fullName };
    if (action !== "create") command.passengerId = current!.passengerId;
    if (changesDetails) {
      // Empty strings clear optional fields; the existing API treats null as
      // "keep the previous value" for updates.
      command.employeeNo = text("employeeNo");
      command.departmentName = text("departmentName");
      command.mobile = text("mobile");
      command.email = text("email");
    }
    if (action === "deactivate") command.activeFlag = false;
    if (action === "reactivate") command.activeFlag = true;
    if (reason) command.metadata = { passengerChangeReason: reason };

    await client.upsertPassenger(command);
    revalidatePath("/passengers");
    return {
      ok: true,
      message: t(`passengers.form.success.${action}`, locale),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return {
      ok: false,
      message: `${t("passengers.form.failed", locale)}${detail ? ` ${detail}` : ""}`,
    };
  }
}
