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

  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/api/metrics",
      (
        _req: unknown,
        res: {
          setHeader: (key: string, value: string) => void;
          send: (body: string) => void;
        },
      ) => {
        res.setHeader(
          "Content-Type",
          "text/plain; version=0.0.4; charset=utf-8",
        );
        res.send(internalKeyMetrics.toPrometheusFormat());
      },
    );

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
