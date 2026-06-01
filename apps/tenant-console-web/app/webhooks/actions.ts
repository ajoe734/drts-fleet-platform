"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";

export type WebhookSecretFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
  plaintextSecret?: string;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

export async function rotateWebhookSecretAction(
  formData: FormData,
): Promise<WebhookSecretFlashPayload> {
  try {
    const webhookId = String(formData.get("webhookId") ?? "").trim();
    const secret = String(formData.get("secret") ?? "").trim();
    const rotationReason = String(formData.get("rotationReason") ?? "").trim();

    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }
    if (!secret || !rotationReason) {
      throw new Error("Rotate secret 需要新 secret 與 reason。");
    }

    const client = getTenantClient();
    await client.post(
      `/api/tenant/webhooks/${encodeURIComponent(webhookId)}/rotate-secret`,
      {
        body: {
          secret,
          rotationReason,
        },
      },
    );

    revalidatePath("/webhooks");

    return {
      tone: "default",
      title: "Webhook secret 已輪替",
      description:
        "新的完整 secret 只顯示這一次。請立即複製或下載，並同步更新 receiver 端。",
      plaintextSecret: secret,
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "Webhook secret 無法輪替",
      description: toErrorMessage(error),
    };
  }
}
