import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { buildHealthPayload } from "./health/health.controller";

async function bootstrap() {
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
  await app.listen(port);
}

void bootstrap();
