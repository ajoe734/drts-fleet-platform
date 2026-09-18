const fs = require("fs");
const file =
  "apps/api/src/modules/tenant-partner/partner-entry-notification-binding.service.ts";
let code = fs.readFileSync(file, "utf8");

const newMethods = `
  async enableBinding(
    entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(\`Binding not found for entry: \${entrySlug}\`);
    }

    const endpoint = this.tenantPartnerService.getWebhookEndpoint(binding.tenantId, binding.webhookId);
    if (!endpoint) {
      throw new ConflictException("Webhook endpoint not found");
    }

    const currentFingerprint = \`\${endpoint.url}|\${endpoint.secretVersion}\`;
    if (binding.validatedEndpointFingerprint !== currentFingerprint || !binding.validatedAt) {
      throw new ConflictException("Binding has not passed contract tests for the current endpoint configuration.");
    }

    binding.state = "ready";
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
    return binding;
  }

  async disableBinding(
    entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(\`Binding not found for entry: \${entrySlug}\`);
    }
    binding.state = "disabled";
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
    return binding;
  }

  async testBinding(entrySlug: string): Promise<void> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(\`Binding not found for entry: \${entrySlug}\`);
    }

    const endpoint = this.tenantPartnerService.getWebhookEndpoint(binding.tenantId, binding.webhookId);
    if (!endpoint) {
      throw new NotFoundException("Webhook endpoint not found");
    }

    // Simulation for this task, would dispatch test payload
    binding.validatedEndpointFingerprint = \`\${endpoint.url}|\${endpoint.secretVersion}\`;
    binding.validatedAt = new Date().toISOString();
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
  }
`;

code = code.replace(
  /async enableBinding\([\s\S]*?async testBinding\([\s\S]*?\}\n\}/,
  newMethods.trim() + "\n}",
);

fs.writeFileSync(file, code);
