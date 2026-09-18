const fs = require("fs");
const file = "apps/api/src/modules/tenant-partner/tenant-partner.service.ts";
let code = fs.readFileSync(file, "utf8");

const injection = `
  getWebhookEndpoint(tenantId: string, webhookId: string) {
    const endpoint = this.webhookEndpoints.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.webhookId === webhookId,
    );
    return endpoint ? this.cloneStoredWebhookEndpoint(endpoint) : null;
  }
`;

code = code.replace(
  "  deleteWebhookEndpoint(",
  injection + "\n  deleteWebhookEndpoint(",
);

fs.writeFileSync(file, code);
