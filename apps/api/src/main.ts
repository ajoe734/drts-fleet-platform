import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { HealthService } from "./health/health.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  app.setGlobalPrefix("api", {
    exclude: ["health"],
  });

  const healthService = app.get(HealthService);

  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/api/health",
      (
        _req: unknown,
        res: {
          json: (body: ReturnType<HealthService["getHealthEnvelope"]>) => void;
        },
      ) => {
        res.json(healthService.getHealthEnvelope());
      },
    );

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
