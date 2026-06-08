/**
 * Knowledge retrieval types for the Platform Admin LLM assistant.
 *
 * Scope (PA-AI-BE-002): approved-doc retrieval with citations. The assistant
 * may only ground answers in the approved source paths declared in
 * {@link ./approved-sources} and every grounded answer must carry citations
 * with a `sourcePath` and an optional `section`.
 */

/**
 * Category tags for approved knowledge sources, mirroring the corpus the plan
 * scopes the assistant to: the assistant plan itself, design handoff packets,
 * UI/authority contracts, and shell topology.
 */
export type KnowledgeSourceCategory =
  | "assistant_plan"
  | "architecture_plan"
  | "design_handoff"
  | "design_canvas"
  | "ui_contract"
  | "topology"
  | "audit"
  | "runbook"
  | "state_machine";

/** A single approved source path the retrieval layer is allowed to index. */
export interface ApprovedSource {
  /** Repo-relative, POSIX-style path. This is the canonical citation key. */
  readonly sourcePath: string;
  /** Coarse category, used for filtering and explainability. */
  readonly category: KnowledgeSourceCategory;
  /** Human-readable label for UI surfaces and citations. */
  readonly label: string;
}

/** Raw document content handed to the indexer for an approved source path. */
export interface KnowledgeSourceDocument {
  readonly sourcePath: string;
  readonly content: string;
}

/**
 * A retrievable unit of an indexed document. Documents are split into sections
 * so citations can point at a heading rather than a whole file.
 */
export interface KnowledgeChunk {
  readonly sourcePath: string;
  /** Heading text for the section, or null for preamble / non-markdown content. */
  readonly section: string | null;
  /** 0-based index of the chunk within its document, for stable ordering. */
  readonly ordinal: number;
  readonly text: string;
  /** Whether prompt-injection signals were detected in this chunk's text. */
  readonly hasInjectionRisk: boolean;
}

/** A citation attached to a grounded answer. */
export interface Citation {
  readonly sourcePath: string;
  readonly section: string | null;
}

/** A scored retrieval hit. */
export interface RetrievalHit {
  readonly chunk: KnowledgeChunk;
  readonly score: number;
  /** Query terms that matched this chunk, for explainability. */
  readonly matchedTerms: string[];
}

export interface RetrievalQuery {
  readonly question: string;
  /** Max hits to return. Defaults applied by the service. */
  readonly limit?: number;
  /** Restrict retrieval to these categories when provided. */
  readonly categories?: KnowledgeSourceCategory[];
}

/**
 * A grounded answer payload: the retrieval layer never authors prose, it
 * returns the grounding context + citations the assistant must answer from.
 */
export interface GroundedRetrieval {
  readonly kind: "grounded";
  readonly hits: RetrievalHit[];
  readonly citations: Citation[];
  /**
   * Untrusted-content blocks, ready to be embedded in a provider prompt. Each
   * block is wrapped + neutralized so document text cannot act as instructions.
   */
  readonly untrustedContext: UntrustedContextBlock[];
  readonly confidence: number;
}

/**
 * Returned when no approved source sufficiently supports the question. The
 * assistant must surface this instead of fabricating an answer.
 */
export interface UncertainRetrieval {
  readonly kind: "uncertain";
  readonly reason: "no_match" | "below_confidence";
  /** A safe, non-fabricated help/search message for the user. */
  readonly message: string;
  /** Best-effort suggested follow-ups (e.g. nearest categories), never answers. */
  readonly suggestedSources: Citation[];
  readonly confidence: number;
}

export type RetrievalResult = GroundedRetrieval | UncertainRetrieval;

/** A document section wrapped as untrusted data for prompt embedding. */
export interface UntrustedContextBlock {
  readonly sourcePath: string;
  readonly section: string | null;
  /** Neutralized text safe to embed inside untrusted delimiters. */
  readonly text: string;
  readonly hasInjectionRisk: boolean;
}
