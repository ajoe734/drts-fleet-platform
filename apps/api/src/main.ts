import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { HealthService } from "./health/health.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  app.setGlobalPrefix("api");

  const healthService = app.get(HealthService);
  app.getHttpAdapter().get("/health", async (req, res) => {
    const envelope = await healthService.getHealth();
    res.send(envelope);
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
