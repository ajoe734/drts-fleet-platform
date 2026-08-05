import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { resolveMapProviderRuntimeConfig } from "./common/map-provider";
import { validateAuthStartupConfig } from "./config/auth-startup-config";
import { buildHealthPayload } from "./health/health.controller";

import { internalKeyMetrics } from "./common/auth/internal-key-metrics";

async function bootstrap() {
  validateAuthStartupConfig(process.env);
  resolveMapProviderRuntimeConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  app.setGlobalPrefix("api", {
    exclude: ["health", "metrics"],
  });

  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/api/health",
      (
        _req: unknown,
        res: { json: (body: ReturnType<typeof buildHealthPayload>) => void },
      ) => {
        res.json(buildHealthPayload());
      },
    );

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
