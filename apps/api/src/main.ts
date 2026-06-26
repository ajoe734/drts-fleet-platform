import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { buildHealthPayload } from "./health/health.controller";
import { TESLA_REGULATORY_EVENTS_ROUTE } from "./modules/tesla-regulatory-events/tesla-regulatory-events.controller";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true,
  });
  app.setGlobalPrefix("api", {
    exclude: [
      "health",
      {
        path: TESLA_REGULATORY_EVENTS_ROUTE,
        method: RequestMethod.POST,
      },
    ],
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
