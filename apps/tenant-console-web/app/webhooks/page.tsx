import type {
  TenantIntegrationGovernancePackage,
  TenantWebhookEndpoint,
  WebhookDeliveryRecord,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { WebhookManager } from "./webhook-manager";

export const dynamic = "force-dynamic";

type DeliveryGroup = {
  webhook: TenantWebhookEndpoint;
  deliveries: WebhookDeliveryRecord[];
};

type WebhooksPageData = {
  webhooks: TenantWebhookEndpoint[];
  governance: TenantIntegrationGovernancePackage | null;
  deliveries: DeliveryGroup[];
  errors: string[];
};

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [webhooksResult, governanceResult] = await Promise.allSettled([
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
  ]);

  const webhooks =
    webhooksResult.status === "fulfilled" ? webhooksResult.value : [];
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;

  if (webhooksResult.status === "rejected") {
    errors.push(
      webhooksResult.reason instanceof Error
        ? webhooksResult.reason.message
        : "Unable to load tenant webhook endpoints.",
    );
  }

  if (governanceResult.status === "rejected") {
    errors.push(
      governanceResult.reason instanceof Error
        ? governanceResult.reason.message
        : "Unable to load tenant webhook governance posture.",
    );
  }

  const deliveryResults = await Promise.allSettled(
    webhooks.map(async (webhook) => ({
      webhook,
      deliveries: (await client.listWebhookDeliveries(
        webhook.webhookId,
      )) as WebhookDeliveryRecord[],
    })),
  );

  const deliveries = deliveryResults.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    const webhook = webhooks[index];
    errors.push(
      result.reason instanceof Error
        ? `Unable to load deliveries for ${webhook?.url ?? "webhook"}: ${result.reason.message}`
        : `Unable to load deliveries for ${webhook?.url ?? "webhook"}.`,
    );
    return [];
  });

  return { webhooks, governance, deliveries, errors };
}

export default async function WebhooksPage() {
  const data = await loadWebhooksPageData();

  return (
    <WebhookManager
      deliveries={data.deliveries}
      errors={data.errors}
      governance={data.governance}
      webhooks={data.webhooks}
    />
  );
}
