import { describe, expect, it } from "vitest";

import {
  buildKnowledgeCorpus,
  resolveKnowledgeGeneratedAt,
  serializeKnowledgeCorpusArtifactModule,
  serializeKnowledgeCorpusEntrypoint,
  tokenizeKnowledgeText,
  toKnowledgeCorpusArtifact,
} from "../../src/modules/assistant/knowledge/knowledge-builder";

describe("knowledge-builder", () => {
  it("tokenizes mixed Latin and CJK queries", () => {
    expect(tokenizeKnowledgeText("Driver SOS 客訴 queue")).toEqual([
      "driver",
      "sos",
      "客訴",
      "queue",
    ]);
  });

  it("builds chunks with section-aware citations from curated sources", () => {
    const corpus = buildKnowledgeCorpus(
      [
        {
          documentId: "sample-doc",
          sourcePath: "knowledge/sample.md",
          title: "Sample Doc",
          kind: "markdown",
          content: [
            "# Ops Console",
            "Primary route overview.",
            "",
            "## Approval Queue",
            "Only scoped roles can approve exception holds.",
          ].join("\n"),
        },
      ],
      "test-version",
    );

    expect(corpus.corpusVersion).toBe("test-version");
    expect(corpus.generatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(corpus.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: "sample-doc",
          section: "Ops Console",
          lineStart: 1,
        }),
        expect.objectContaining({
          documentId: "sample-doc",
          section: "Ops Console > Approval Queue",
          lineStart: 4,
          text: expect.stringContaining("Only scoped roles can approve"),
        }),
      ]),
    );
  });

  it("serializes a versioned artifact module and stable entrypoint", () => {
    const corpus = buildKnowledgeCorpus(
      [
        {
          documentId: "sample-doc",
          sourcePath: "knowledge/sample.md",
          title: "Sample Doc",
          kind: "markdown",
          content: "# Heading\nBody",
        },
      ],
      "2026-06-03",
    );

    const artifact = toKnowledgeCorpusArtifact(corpus, [
      {
        documentId: "sample-doc",
        sourcePath: "knowledge/sample.md",
        title: "Sample Doc",
        kind: "markdown",
      },
    ]);

    expect(
      serializeKnowledgeCorpusArtifactModule(
        artifact,
        "../../knowledge-internal.types",
      ),
    ).toContain("GENERATED_KNOWLEDGE_CORPUS_ARTIFACT");
    expect(serializeKnowledgeCorpusEntrypoint("2026-06-03")).toContain(
      './artifacts/2026-06-03/knowledge-corpus.generated',
    );
  });

  it("stabilizes generated timestamps from the corpus version", () => {
    expect(resolveKnowledgeGeneratedAt("2026-06-02")).toBe(
      "2026-06-02T00:00:00.000Z",
    );
    expect(resolveKnowledgeGeneratedAt("test-version")).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
