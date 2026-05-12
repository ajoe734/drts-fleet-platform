"use server";

import { revalidatePath } from "next/cache";
import {
  TENANT_WEBHOOK_ENDPOINT_STATUSES,
  type CreateTenantWebhookEndpointCommand,
  type TenantWebhookEndpointStatus,
  type UpdateTenantWebhookEndpointCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { WebhookFlashPayload } from "./constants";

function readTrimmedString(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function readEvents(formData: FormData): string[] {
  const baselineEvents = formData
    .getAll("events")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const extraEvents = (readTrimmedString(formData, "extraEvents") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const uniqueEvents = [...new Set([...baselineEvents, ...extraEvents])];
  if (uniqueEvents.length === 0) {
    throw new Error(
      "Select at least one published event or enter a custom event.",
    );
  }

  return uniqueEvents;
}

function readStatus(
  formData: FormData,
  key: string,
): TenantWebhookEndpointStatus | undefined {
  const value = readTrimmedString(formData, key);
  if (!value) {
    return undefined;
  }

  if (
    !TENANT_WEBHOOK_ENDPOINT_STATUSES.includes(
      value as TenantWebhookEndpointStatus,
    )
  ) {
    throw new Error(`Unsupported webhook status: ${value}`);
  }

  return value as TenantWebhookEndpointStatus;
}

export async function createTenantWebhookAction(
  formData: FormData,
): Promise<WebhookFlashPayload> {
  let payload: WebhookFlashPayload;

  try {
    const url = readTrimmedString(formData, "url");
    const secret = readTrimmedString(formData, "secret");

    if (!url) {
      throw new Error("Webhook URL is required.");
    }

    if (!secret) {
      throw new Error("Webhook secret is required.");
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url,
      secret,
      events: readEvents(formData),
    };

    await getTenantClient().createWebhookEndpoint(command);
    payload = {
      tone: "default",
      title: "Endpoint created",
      description:
        "The endpoint was registered in backend authority. New or changed endpoints remain in test_pending until validation evidence lands.",
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Endpoint could not be created",
      description:
        error instanceof Error
          ? error.message
          : "Unable to create tenant webhook endpoint.",
    };
  }

  revalidatePath("/webhooks");
  return payload;
}

export async function updateTenantWebhookAction(
  formData: FormData,
): Promise<WebhookFlashPayload> {
  let payload: WebhookFlashPayload;

  try {
    const webhookId = readTrimmedString(formData, "webhookId");
    const url = readTrimmedString(formData, "url");
    const status = readStatus(formData, "status");

    if (!webhookId) {
      throw new Error("Webhook selection is required.");
    }

    if (!url) {
      throw new Error("Webhook URL is required.");
    }

    if (!status) {
      throw new Error("Webhook status is required.");
    }

    const command: UpdateTenantWebhookEndpointCommand = {
      url,
      status,
      events: readEvents(formData),
    };

    await getTenantClient().updateWebhookEndpoint(webhookId, command);
    payload = {
      tone: "default",
      title: "Endpoint updated",
      description:
        "Endpoint metadata was updated through the published webhook command path.",
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Endpoint could not be updated",
      description:
        error instanceof Error
          ? error.message
          : "Unable to update tenant webhook endpoint.",
    };
  }

  revalidatePath("/webhooks");
  return payload;
}

export async function deleteTenantWebhookAction(
  formData: FormData,
): Promise<WebhookFlashPayload> {
  let payload: WebhookFlashPayload;

  try {
    const webhookId = readTrimmedString(formData, "webhookId");
    const webhookUrl = readTrimmedString(formData, "webhookUrl");

    if (!webhookId) {
      throw new Error("Webhook selection is required.");
    }

    await getTenantClient().deleteWebhookEndpoint(webhookId);
    payload = {
      tone: "default",
      title: "Endpoint deleted",
      description: `${webhookUrl ?? webhookId} was removed from the tenant webhook register.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Endpoint could not be deleted",
      description:
        error instanceof Error
          ? error.message
          : "Unable to delete tenant webhook endpoint.",
    };
  }

  revalidatePath("/webhooks");
  return payload;
}

export async function sendTenantWebhookTestAction(
  formData: FormData,
): Promise<WebhookFlashPayload> {
  let payload: WebhookFlashPayload;

  try {
    const webhookId = readTrimmedString(formData, "webhookId");
    const webhookUrl = readTrimmedString(formData, "webhookUrl");

    if (!webhookId) {
      throw new Error("Webhook selection is required.");
    }

    const result = await getTenantClient().sendTestWebhook({ webhookId });
    payload = {
      tone: "default",
      title: "Validation event queued",
      description: `${webhookUrl ?? webhookId} received a tenant.webhook.test request. Delivery ${result.deliveryId ?? "pending"} returned HTTP ${result.httpStatus ?? "unknown"}.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Validation event could not be sent",
      description:
        error instanceof Error
          ? error.message
          : "Unable to queue tenant webhook test delivery.",
    };
  }

  revalidatePath("/webhooks");
  return payload;
}

export async function rotateTenantWebhookSecretAction(
  formData: FormData,
): Promise<WebhookFlashPayload> {
  let payload: WebhookFlashPayload;

  try {
    const webhookId = readTrimmedString(formData, "webhookId");
    const secret = readTrimmedString(formData, "secret");
    const rotationReason = readTrimmedString(formData, "rotationReason");

    if (!webhookId) {
      throw new Error("Webhook selection is required.");
    }

    if (!secret) {
      throw new Error("A new webhook secret is required for rotation.");
    }

    const result = await getTenantClient().rotateWebhookSecret(webhookId, {
      secret,
      ...(rotationReason ? { rotationReason } : {}),
    });

    payload = {
      tone: "default",
      title: "Secret rotated",
      description: `Secret rotation moved ${result.webhookId ?? webhookId} to version ${result.secretVersion ?? "unknown"} and requires revalidation before live traffic resumes.`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Secret could not be rotated",
      description:
        error instanceof Error
          ? error.message
          : "Unable to rotate tenant webhook secret.",
    };
  }

  revalidatePath("/webhooks");
  return payload;
}
