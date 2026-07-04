import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { buildHealthPayload } from "./health/health.controller";
import { GeoProviderConfigService } from "./modules/geo/geo-provider-config.service";

function assertGeoProviderBootstrapReady(env: NodeJS.ProcessEnv = process.env) {
  const health = new GeoProviderConfigService(env).getHealth();
  const invalidMode = health.checks.some(
    (check) => check.name === "provider_mode" && check.status === "fail",
  );
  const productionFailClosed =
    ["production", "prod", "staging", "stage"].includes(health.environment) &&
    health.failClosed;

  if (!invalidMode && !productionFailClosed) {
    return;
  }

  const message =
    health.checks.find((check) => check.status === "fail")?.message ??
    "Geo provider runtime is not ready to bootstrap.";
  throw new Error(message);
}

async function bootstrap() {
  assertGeoProviderBootstrapReady(process.env);

  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  app.setGlobalPrefix("api", {
    exclude: ["health"],
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
