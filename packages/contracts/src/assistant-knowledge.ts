export interface KnowledgeCitation {
  documentId: string;
  documentTitle: string;
  documentPath: string;
  documentVersion: string;
  sectionTitle: string | null;
  lineStart: number | null;
  lineEnd: number | null;
}

export interface KnowledgeSearchResultSnippet {
  snippetId: string;
  score: number;
  title: string;
  excerpt: string;
  matchedTerms: string[];
  citation: KnowledgeCitation;
}

export interface KnowledgeSearchResponse {
  query: string;
  generatedAt: string;
  corpusVersion: string;
  totalHits: number;
  items: KnowledgeSearchResultSnippet[];
}
