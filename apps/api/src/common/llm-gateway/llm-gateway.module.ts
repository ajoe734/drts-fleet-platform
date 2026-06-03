import { Module } from "@nestjs/common";

import { readLlmGatewayConfig } from "./llm-gateway.config";
import { LLM_GATEWAY_CONFIG, LLM_GATEWAY_PROVIDER } from "./llm-gateway.tokens";
import { AnthropicLlmGatewayProvider } from "./providers/anthropic.provider";
import { LlmGatewayService } from "./llm-gateway.service";

@Module({
  providers: [
    {
      provide: LLM_GATEWAY_CONFIG,
      useFactory: () => readLlmGatewayConfig(process.env),
    },
    {
      provide: LLM_GATEWAY_PROVIDER,
      useFactory: (config: ReturnType<typeof readLlmGatewayConfig>) =>
        new AnthropicLlmGatewayProvider(config),
      inject: [LLM_GATEWAY_CONFIG],
    },
    LlmGatewayService,
  ],
  exports: [LlmGatewayService, LLM_GATEWAY_CONFIG, LLM_GATEWAY_PROVIDER],
})
export class LlmGatewayModule {}
