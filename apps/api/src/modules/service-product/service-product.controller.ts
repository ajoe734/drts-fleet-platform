import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import type {
  CreateServiceProductCommand,
  UpdateServiceProductCommand,
  UpsertRuntimeProfileServiceProductPolicyCommand,
} from "./service-product.types";

import { toActionReceiptEnvelope } from "../../common/action-receipt";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ServiceProductService } from "./service-product.service";

@Controller("admin/service-products")
export class ServiceProductController {
  constructor(private readonly serviceProductService: ServiceProductService) {}

  @Get()
  async listServiceProducts(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: await this.serviceProductService.readServiceProducts() },
      requestId,
    );
  }

  @Get("runtime-policies")
  async listRuntimePolicies(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: await this.serviceProductService.readRuntimeProfilePolicies() },
      requestId,
    );
  }

  @Put("runtime-policies/:runtimeProfileCode/:serviceProductCode")
  async upsertRuntimePolicy(
    @Param("runtimeProfileCode") runtimeProfileCode: string,
    @Param("serviceProductCode") serviceProductCode: string,
    @Body() command: UpsertRuntimeProfileServiceProductPolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.serviceProductService.upsertRuntimeProfilePolicy({
        ...command,
        runtimeProfileCode: runtimeProfileCode as never,
        serviceProductCode: serviceProductCode as never,
      }),
      requestId,
    );
  }

  @Post()
  async createServiceProduct(
    @Body() command: CreateServiceProductCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceProductService.createServiceProduct(
      command,
      requestId,
      { captureAudit: true },
    );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        message: "Service product created.",
      },
      requestId,
    );
  }

  @Put(":serviceProductId")
  async updateServiceProduct(
    @Param("serviceProductId") serviceProductId: string,
    @Body() command: UpdateServiceProductCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.serviceProductService.updateServiceProduct(
      serviceProductId,
      command,
      requestId,
      { captureAudit: true },
    );

    return toActionReceiptEnvelope(
      {
        auditLog: result.auditLog,
        message: "Service product updated.",
      },
      requestId,
    );
  }
}
