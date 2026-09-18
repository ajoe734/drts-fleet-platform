const fs = require("fs");
const file =
  "apps/api/src/modules/tenant-partner/partner-entry-notification-binding.controller.ts";
let code = fs.readFileSync(file, "utf8");

const injection = `
  private async assertScope(req: any, entrySlug: string) {
    const identity = req.identity;
    if (!identity) throw new ForbiddenException("Missing identity");
    
    // Allow platform and ops to access any entry
    if (identity.realm === "platform" || identity.realm === "ops") return;
    
    // Otherwise, must be bound to the specific tenant
    const entry = await this.tenantPartnerService.getPartnerEntry(entrySlug);
    if (!entry) throw new NotFoundException(\`Entry not found: \${entrySlug}\`);
    if (identity.tenantId !== entry.tenantId) {
      throw new ForbiddenException("Cross-tenant access is forbidden");
    }
    
    // If it's a partner identity, it should also match the entrySlug
    if (identity.realm === "partner" && identity.partnerEntrySlug && identity.partnerEntrySlug !== entrySlug) {
      throw new ForbiddenException("Cross-entry access is forbidden");
    }
  }
`;

code = code.replace(
  "import {\n  Controller,",
  'import { Req, ForbiddenException } from "@nestjs/common";\nimport { TenantPartnerService } from "./tenant-partner.service";\nimport {\n  Controller,',
);

code = code.replace(
  "  constructor(private readonly bindingService: PartnerEntryNotificationBindingService) {}",
  "  constructor(\n    private readonly bindingService: PartnerEntryNotificationBindingService,\n    private readonly tenantPartnerService: TenantPartnerService\n  ) {}\n" +
    injection,
);

// Add @Req() req: any to all routes and call assertScope
code = code.replace(
  /async getBinding\(\s*@Param\("entrySlug"\) entrySlug: string,\s*\)/,
  'async getBinding(@Param("entrySlug") entrySlug: string, @Req() req: any)',
);
code = code.replace(
  "const binding = await this.bindingService.getBinding(entrySlug);",
  "await this.assertScope(req, entrySlug);\n    const binding = await this.bindingService.getBinding(entrySlug);",
);

code = code.replace(
  /async updateBinding\(\s*@Param\("entrySlug"\) entrySlug: string,\s*@Body\(\) dto: UpdateBindingDto,\s*\)/,
  'async updateBinding(@Param("entrySlug") entrySlug: string, @Body() dto: UpdateBindingDto, @Req() req: any)',
);
code = code.replace(
  "return this.bindingService.updateBinding(entrySlug, dto);",
  "await this.assertScope(req, entrySlug);\n    return this.bindingService.updateBinding(entrySlug, dto);",
);

code = code.replace(
  /async testBinding\(\s*@Param\("entrySlug"\) entrySlug: string,\s*\)/,
  'async testBinding(@Param("entrySlug") entrySlug: string, @Req() req: any)',
);
code = code.replace(
  "await this.bindingService.testBinding(entrySlug);",
  "await this.assertScope(req, entrySlug);\n    await this.bindingService.testBinding(entrySlug);",
);

code = code.replace(
  /async enableBinding\(\s*@Param\("entrySlug"\) entrySlug: string,\s*\)/,
  'async enableBinding(@Param("entrySlug") entrySlug: string, @Req() req: any)',
);
code = code.replace(
  "return this.bindingService.enableBinding(entrySlug);",
  "await this.assertScope(req, entrySlug);\n    return this.bindingService.enableBinding(entrySlug);",
);

code = code.replace(
  /async disableBinding\(\s*@Param\("entrySlug"\) entrySlug: string,\s*\)/,
  'async disableBinding(@Param("entrySlug") entrySlug: string, @Req() req: any)',
);
code = code.replace(
  "return this.bindingService.disableBinding(entrySlug);",
  "await this.assertScope(req, entrySlug);\n    return this.bindingService.disableBinding(entrySlug);",
);

fs.writeFileSync(file, code);
