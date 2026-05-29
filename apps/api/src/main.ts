import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { deepToSnakeCase } from "./common/snake-case.interceptor";
import { createHealthService } from "./modules/health/health.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  app.setGlobalPrefix("api", {
    exclude: ["health"],
  });

  // UI-facing alias for the `/health` controller route. It lives outside
  // the Nest pipeline, so the global SnakeCaseInterceptor does not run on
  // it — apply the same snake_case wire transform here so `/api/health`
  // and `/health` emit a byte-identical UiHealthEnvelope.
  const healthService = createHealthService();
  app
    .getHttpAdapter()
    .getInstance()
    .get(
      "/api/health",
      async (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(deepToSnakeCase(await healthService.getHealth()));
      },
    );

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
