import { describe, expect, it } from "vitest";

import { KnowledgeSearchService } from "../../src/modules/assistant/knowledge/knowledge-search.service";

describe("KnowledgeSearchService", () => {
  it("returns ranked snippets with citations from the curated corpus", () => {
    const service = new KnowledgeSearchService();

    const result = service.search("approval queue", 3);

    expect(result.corpusVersion).toBe("2026-06-02");
    expect(result.totalHits).toBeGreaterThan(0);
    expect(result.snippets).toHaveLength(3);
    expect(result.snippets[0]).toEqual(
      expect.objectContaining({
        snippetId: expect.any(String),
        score: expect.any(Number),
        matchedTerms: expect.arrayContaining(["approval", "queue"]),
        citation: expect.objectContaining({
          sourcePath:
            "docs/05-ui/ops-console-design-handoff-packet-20260525.md",
          title: "Ops Console Design Handoff Packet",
          lineStart: expect.any(Number),
          lineEnd: expect.any(Number),
        }),
      }),
    );
    expect(result.snippets[0].citation.lineStart).toBeLessThanOrEqual(
      result.snippets[0].citation.lineEnd,
    );
  });

  it("falls back to the default limit when the caller supplies NaN", () => {
    const service = new KnowledgeSearchService();

    const result = service.search("driver matching suppression", Number.NaN);

    expect(result.snippets).toHaveLength(5);
  });

  it("caps the caller limit at the maximum allowed snippet count", () => {
    const service = new KnowledgeSearchService();

    const result = service.search("dispatch", 99);

    expect(result.snippets).toHaveLength(10);
  });
});
