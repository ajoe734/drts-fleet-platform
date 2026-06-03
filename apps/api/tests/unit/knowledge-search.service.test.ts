import { describe, expect, it } from "vitest";

import { KnowledgeSearchService } from "../../src/modules/assistant/knowledge/knowledge-search.service";

describe("knowledge search service", () => {
  it("indexes the curated corpus and returns ranked snippets with citations", () => {
    const service = new KnowledgeSearchService();

    const result = service.search("exception hold", 3);

    expect(result.query).toBe("exception hold");
    expect(result.corpusVersion).toContain(
      "ops-console-handoff-packet@2026-05-25",
    );
    expect(result.totalHits).toBeGreaterThan(0);
    expect(result.items).toHaveLength(3);

    const [topHit] = result.items;
    expect(topHit.score).toBeGreaterThan(0);
    expect(topHit.title.toLowerCase()).toContain("exception");
    expect(topHit.excerpt.toLowerCase()).toContain("exception hold");
    expect(topHit.matchedTerms).toContain("exception");
    expect(topHit.citation.documentId).toBeTruthy();
    expect(topHit.citation.documentPath).toContain("docs/");
    expect(topHit.citation.lineStart).toBeTypeOf("number");
    expect(topHit.citation.lineEnd).toBeTypeOf("number");
  });

  it("surfaces glossary content for terminology queries", () => {
    const service = new KnowledgeSearchService();

    const result = service.search("rollback hold", 5);

    expect(
      result.items.some(
        (item) => item.citation.documentId === "operational-glossary",
      ),
    ).toBe(true);
    expect(
      result.items.some((item) => item.title.includes("Canonical Terms")),
    ).toBe(true);
  });
});
