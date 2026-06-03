import { Global, Module } from "@nestjs/common";

import { AnthropicClaudeProvider } from "./anthropic-claude.provider";
import { LlmGatewayService } from "./llm-gateway.service";
import { LLM_GATEWAY_PROVIDER } from "./llm-gateway.tokens";

@Global()
@Module({
  providers: [
    AnthropicClaudeProvider,
    LlmGatewayService,
    {
      provide: LLM_GATEWAY_PROVIDER,
      useExisting: AnthropicClaudeProvider,
    },
  ],
  exports: [LlmGatewayService, LLM_GATEWAY_PROVIDER],
})
export class LlmGatewayModule {}
