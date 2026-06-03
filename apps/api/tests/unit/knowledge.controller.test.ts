import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { KnowledgeModule } from "../../src/modules/assistant/knowledge/knowledge.module";

async function createKnowledgeTestApp() {
  @Module({
    imports: [KnowledgeModule],
  })
  class KnowledgeTestModule {}

  const app = await NestFactory.create(KnowledgeTestModule, {
    logger: false,
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe("knowledge controller", () => {
  it("serves search results in the standard api envelope", async () => {
    const { app, baseUrl } = await createKnowledgeTestApp();

    try {
      const response = await fetch(
        `${baseUrl}/ops/assistant/knowledge/search?q=approval%20queue&limit=2`,
      );
      const body = (await response.json()) as {
        data: {
          query: string;
          totalHits: number;
          items: Array<{ citation: { documentId: string } }>;
        };
        meta: {
          requestId: string;
          timestamp: string;
        };
      };

      expect(response.status).toBe(200);
      expect(body.data.query).toBe("approval queue");
      expect(body.data.totalHits).toBe(2);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.items[0]?.citation.documentId).toBeTruthy();
      expect(body.meta.requestId).toBeTruthy();
      expect(body.meta.timestamp).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it("rejects empty queries", async () => {
    const { app, baseUrl } = await createKnowledgeTestApp();

    try {
      const response = await fetch(`${baseUrl}/ops/assistant/knowledge/search`);
      const body = (await response.json()) as {
        error: {
          code: string;
          message: string;
        };
      };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("bad_request");
      expect(body.error.message).toContain("q query parameter is required");
    } finally {
      await app.close();
    }
  });
});
