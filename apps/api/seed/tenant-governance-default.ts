import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { AuditNotificationService } from "../src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../src/modules/tenant-partner/tenant-partner.service";
import {
  TENANT_GOVERNANCE_SEED_CLI_USAGE,
  parseTenantGovernanceSeedCliArgs,
  seedTenantGovernance,
} from "../src/seed/tenant-governance-default";

async function main() {
  const parsed = parseTenantGovernanceSeedCliArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(TENANT_GOVERNANCE_SEED_CLI_USAGE);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  try {
    const tenantPartnerService = app.get(TenantPartnerService);
    const auditNotificationService = app.get(AuditNotificationService);
    const result = await seedTenantGovernance(parsed.tenantId, {
      profile: parsed.profile,
      source: "cli",
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error(TENANT_GOVERNANCE_SEED_CLI_USAGE);
  process.exitCode = 1;
});
