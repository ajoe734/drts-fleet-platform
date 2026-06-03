import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildKnowledgeCorpus,
  serializeKnowledgeCorpusArtifactModule,
  serializeKnowledgeCorpusEntrypoint,
  toKnowledgeCorpusArtifact,
} from "../src/modules/assistant/knowledge/knowledge-builder";
import {
  KNOWLEDGE_CORPUS_VERSION,
  KNOWLEDGE_SOURCE_MANIFEST,
} from "../src/modules/assistant/knowledge/knowledge.manifest";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "../..");
const generatedRoot = resolve(
  appRoot,
  "src/modules/assistant/knowledge/generated",
);
const artifactDir = resolve(
  generatedRoot,
  "artifacts",
  KNOWLEDGE_CORPUS_VERSION,
);
const artifactOutputPath = resolve(
  artifactDir,
  "knowledge-corpus.generated.ts",
);
const entrypointOutputPath = resolve(
  generatedRoot,
  "knowledge-corpus.generated.ts",
);

const sources = KNOWLEDGE_SOURCE_MANIFEST.map((entry) => ({
  ...entry,
  content: readFileSync(resolve(repoRoot, entry.sourcePath), "utf8"),
}));

const corpus = buildKnowledgeCorpus(sources, KNOWLEDGE_CORPUS_VERSION);
const artifact = toKnowledgeCorpusArtifact(corpus, KNOWLEDGE_SOURCE_MANIFEST);

mkdirSync(dirname(artifactOutputPath), { recursive: true });
writeFileSync(
  artifactOutputPath,
  serializeKnowledgeCorpusArtifactModule(
    artifact,
    "../../../knowledge-internal.types",
  ),
  "utf8",
);

mkdirSync(dirname(entrypointOutputPath), { recursive: true });
writeFileSync(
  entrypointOutputPath,
  serializeKnowledgeCorpusEntrypoint(KNOWLEDGE_CORPUS_VERSION),
  "utf8",
);

process.stdout.write(
  [
    `Generated assistant knowledge corpus artifact ${artifact.corpusVersion}.`,
    `Chunks: ${artifact.chunks.length}.`,
    `Sources: ${artifact.generatedFrom.length}.`,
    `Artifact: ${artifactOutputPath.replace(`${appRoot}/`, "")}`,
  ].join(" ") + "\n",
);
