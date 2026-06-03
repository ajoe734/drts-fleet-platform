import { Injectable } from "@nestjs/common";

import {
  type LlmGatewayConfig,
  resolveLlmGatewayConfig,
} from "./llm-gateway-config";

@Injectable()
export class LlmGatewayService {
  private readonly config: LlmGatewayConfig;

  constructor() {
    this.config = resolveLlmGatewayConfig();
  }

  getConfig(): LlmGatewayConfig {
    return this.config;
  }
}
