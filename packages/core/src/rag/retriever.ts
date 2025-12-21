/**
 * RAG Retriever Service
 *
 * Provides document retrieval using in-memory vector store with Ollama embeddings.
 * No Docker/ChromaDB required - loads docs from filesystem on startup.
 *
 * TODO: Implement proper vector store when LangChain packages are stabilized.
 * The MemoryVectorStore was removed from langchain packages in recent versions.
 */

/**
 * Result from RAG retrieval
 */
export interface RAGResult {
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/**
 * Configuration for the RAG retriever
 */
export interface RAGRetrieverConfig {
  docsPath?: string;
  ollamaModel?: string;
  ollamaUrl?: string;
  defaultK?: number;
  minRelevance?: number;
}

const DEFAULT_CONFIG: Required<RAGRetrieverConfig> = {
  docsPath: "./docs",
  ollamaModel: "nomic-embed-text",
  ollamaUrl: "http://localhost:11434",
  defaultK: 5,
  minRelevance: 0.2,
};

/**
 * RAG Retriever - Stub implementation
 *
 * TODO: Implement with proper vector store once LangChain packages stabilize.
 * Currently returns empty results as the MemoryVectorStore was removed.
 */
export class RAGRetriever {
  private config: Required<RAGRetrieverConfig>;
  private initialized = false;
  private documentCount = 0;

  constructor(config: RAGRetrieverConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the retriever (stub - logs warning)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.warn(
      "[RAGRetriever] RAG is currently disabled - MemoryVectorStore not available in current LangChain version."
    );
    console.warn("[RAGRetriever] See: https://github.com/langchain-ai/langchainjs/issues/XXX");

    this.initialized = true;
  }

  /**
   * Check if RAG is available (currently always false)
   */
  async isAvailable(): Promise<boolean> {
    return false;
  }

  /**
   * Query for similar documents (stub - returns empty)
   */
  async query(
    _queryText: string,
    _typeFilter?: string[],
    _k?: number
  ): Promise<RAGResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return [];
  }

  /**
   * Query for similar PBIs (stub - returns empty)
   */
  async querySimilarPBIs(_queryText: string, _k = 5): Promise<RAGResult[]> {
    return this.query(_queryText, ["pbi"], _k);
  }

  /**
   * Query for relevant ADRs (stub - returns empty)
   */
  async queryADRs(_queryText: string, _k = 3): Promise<RAGResult[]> {
    return this.query(_queryText, ["adr"], _k);
  }

  /**
   * Query for technical documentation (stub - returns empty)
   */
  async queryTechnicalDocs(_queryText: string, _k = 3): Promise<RAGResult[]> {
    return this.query(_queryText, ["architecture", "guide", "reference", "pact"], _k);
  }

  /**
   * Query all categories for comprehensive enrichment (stub - returns empty)
   */
  async queryForEnrichment(
    _title: string,
    _description: string,
    _type: string
  ): Promise<{
    similarWork: RAGResult[];
    adrs: RAGResult[];
    technicalDocs: RAGResult[];
  }> {
    return { similarWork: [], adrs: [], technicalDocs: [] };
  }

  /**
   * Get document count
   */
  getDocumentCount(): number {
    return this.documentCount;
  }

  /**
   * Close the retriever (cleanup)
   */
  close(): void {
    this.initialized = false;
    this.documentCount = 0;
  }
}

// Singleton instance for reuse
let retrieverInstance: RAGRetriever | null = null;

/**
 * Get or create a RAG retriever instance
 */
export function getRAGRetriever(config?: RAGRetrieverConfig): RAGRetriever {
  if (!retrieverInstance) {
    retrieverInstance = new RAGRetriever(config);
  }
  return retrieverInstance;
}
