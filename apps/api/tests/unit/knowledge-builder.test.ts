import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildKnowledgeCorpus,
  resolveKnowledgeGeneratedAt,
  tokenizeKnowledgeText,
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
    const repoRoot = mkdtempSync(join(tmpdir(), "assistant-knowledge-"));
    const docsDir = join(repoRoot, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(
      join(docsDir, "sample.md"),
      [
        "# Ops Console",
        "Primary route overview.",
        "",
        "## Approval Queue",
        "Only scoped roles can approve exception holds.",
      ].join("\n"),
      "utf8",
    );

    const corpus = buildKnowledgeCorpus(
      repoRoot,
      [
        {
          documentId: "sample-doc",
          sourcePath: "docs/sample.md",
          title: "Sample Doc",
          kind: "markdown",
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

  it("stabilizes generated timestamps from the corpus version", () => {
    expect(resolveKnowledgeGeneratedAt("2026-06-02")).toBe(
      "2026-06-02T00:00:00.000Z",
    );
    expect(resolveKnowledgeGeneratedAt("test-version")).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
