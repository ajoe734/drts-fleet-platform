import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { JwtAuthService as JwtType } from "../../../../apps/api/src/common/auth/jwt-auth.service";

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.DRTS_UAT_ENV !== "sandbox" ||
    !process.env.DATABASE_URL ||
    !process.argv[2]
  )
    throw new Error("Fixture sessions require authorized hosted UAT");
  const apiRequire = createRequire(path.resolve("apps/api/package.json"));
  apiRequire("reflect-metadata");
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = apiRequire("./dist/app.module.js");
  const { JwtAuthService } = apiRequire("./dist/common/auth/jwt-auth.service.js");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const jwt: JwtType = app.get(JwtAuthService);
    const tokens: Record<string, string> = {};
    for (const name of [
      "DRTS_UAT_TOKEN_PLATFORM",
      "DRTS_UAT_TOKEN_A",
      "DRTS_UAT_TOKEN_B",
    ]) {
      // Same trusted setup boundary as appmodule-acceptance-seed.ts. Require
      // the old credential AND its durable authority to remain valid first.
      // This provisions a fresh fixture authentication, not a product refresh
      // endpoint/MFA-flow test, and never extends an expired or revoked token.
      const payload = await jwt.verifyAccessToken(process.env[name] ?? "");
      if (!payload) throw new Error(`Fixture authority is no longer valid: ${name}`);
      const identity = jwt.toRequestIdentity(payload);
      const authTime = new Date().toISOString();
      const issued = await jwt.issueSessionToken(
        {
          ...identity,
          actorId: payload.actorId ?? payload.principalId ?? identity.actorId,
          sessionId: `sid-partner-qa-${randomUUID()}`,
          tokenId: null,
          authTime,
          issuedAt: null,
          expiresAt: null,
        },
        { ensurePrincipal: false, authTime },
      );
      if (!(await jwt.verifyAccessToken(issued.token)))
        throw new Error(`Fresh fixture session failed durable validation: ${name}`);
      tokens[name] = issued.token;
    }
    // Credentials never enter CLI arguments, stdout or uploaded reports.
    await writeFile(process.argv[2]!, JSON.stringify(tokens), { mode: 0o600 });
  } finally {
    await app.close();
  }
}

main().catch(() => {
  console.error("Hosted fixture session provisioning failed");
  process.exitCode = 1;
});
