/**
 * RAG Retriever Service
 *
 * Provides document retrieval using in-memory vector store with Ollama embeddings.
 * No Docker/ChromaDB required - loads docs from filesystem on startup.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { RAGResult } from "../pipeline/schemas/enrichment.schema.js";

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
  minRelevance: 0.2, // Lowered for better recall with cosine similarity
};

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, yaml, body] = match;
  const metadata: Record<string, unknown> = {};

  // Simple YAML parsing for common fields
  for (const line of yaml.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle arrays (simple case)
      if (value.startsWith("[") && value.endsWith("]")) {
        metadata[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/["']/g, ""));
      } else {
        metadata[key] = value;
      }
    }
  }

  return { metadata, body };
}

/**
 * RAG Retriever using in-memory vector store
 */
export class RAGRetriever {
  private config: Required<RAGRetrieverConfig>;
  private embeddings: OllamaEmbeddings | null = null;
  private vectorStore: MemoryVectorStore | null = null;
  private initialized = false;
  private documentCount = 0;

  constructor(config: RAGRetrieverConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the retriever (loads docs and creates embeddings)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[RAGRetriever] Initializing with Ollama embeddings...");

    this.embeddings = new OllamaEmbeddings({
      model: this.config.ollamaModel,
      baseUrl: this.config.ollamaUrl,
    });

    // Load and index documents
    const docs = await this.loadDocuments();
    this.documentCount = docs.length;

    if (docs.length > 0) {
      console.log(`[RAGRetriever] Creating vector store with ${docs.length} documents...`);
      this.vectorStore = await MemoryVectorStore.fromDocuments(docs, this.embeddings);
      console.log(`[RAGRetriever] Initialized with ${docs.length} documents.`);
    } else {
      console.log("[RAGRetriever] No documents found, creating empty store.");
      this.vectorStore = new MemoryVectorStore(this.embeddings);
    }

    this.initialized = true;
  }

  /**
   * Load markdown documents from docs folder with chunking
   */
  private async loadDocuments(): Promise<Document[]> {
    const rawDocs: Document[] = [];
    const docsPath = path.resolve(this.config.docsPath);

    // Check if docs directory exists
    try {
      await fs.access(docsPath);
    } catch {
      console.log(`[RAGRetriever] Docs path not found: ${docsPath}`);
      return rawDocs;
    }

    // Find all markdown files
    const mdFiles = await this.findMarkdownFiles(docsPath);
    console.log(`[RAGRetriever] Found ${mdFiles.length} markdown files`);

    // Load and parse each file
    for (const filePath of mdFiles) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const { metadata, body } = parseFrontmatter(content);

        // Add source path to metadata
        const relativePath = path.relative(docsPath, filePath);
        metadata.source = relativePath;

        // Determine doc_type from metadata or path
        if (!metadata.type && !metadata.doc_type) {
          if (relativePath.includes("backlog")) {
            metadata.doc_type = "pbi";
          } else if (relativePath.includes("adr")) {
            metadata.doc_type = "adr";
          } else if (relativePath.includes("guide") || relativePath.includes("research")) {
            metadata.doc_type = "guide";
          } else if (relativePath.includes("pact")) {
            metadata.doc_type = "pact";
          } else if (relativePath.includes("architecture")) {
            metadata.doc_type = "architecture";
          }
        }

        // Use type or doc_type field
        metadata.doc_type = metadata.doc_type || metadata.type || "unknown";

        rawDocs.push(new Document({ pageContent: body, metadata }));
      } catch (error) {
        console.warn(`[RAGRetriever] Failed to load ${filePath}:`, error);
      }
    }

    // Chunk documents to fit embedding model context
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunkedDocs = await splitter.splitDocuments(rawDocs);
    console.log(`[RAGRetriever] Split into ${chunkedDocs.length} chunks`);

    return chunkedDocs;
  }

  /**
   * Recursively find all markdown files
   */
  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and output
        if (!entry.name.startsWith(".") && entry.name !== "output" && entry.name !== "temp") {
          const subFiles = await this.findMarkdownFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if Ollama is available for embeddings
   */
  async isAvailable(): Promise<boolean> {
    try {
      const embeddings = new OllamaEmbeddings({
        model: this.config.ollamaModel,
        baseUrl: this.config.ollamaUrl,
      });
      // Test embedding
      await embeddings.embedQuery("test");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query for similar documents
   */
  async query(
    queryText: string,
    typeFilter?: string[],
    k?: number
  ): Promise<RAGResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.vectorStore || this.documentCount === 0) {
      return [];
    }

    const numResults = k ?? this.config.defaultK;

    // Query vector store
    const results = await this.vectorStore.similaritySearchWithScore(queryText, numResults * 2);

    // Filter by type and convert to RAGResult format
    const ragResults: RAGResult[] = [];

    for (const [doc, distance] of results) {
      // Convert distance to relevance score (0-1, higher is better)
      const score = Math.max(0, 1 - distance);

      // Filter by type if specified
      if (typeFilter && typeFilter.length > 0) {
        const docType = doc.metadata.doc_type || doc.metadata.type;
        if (!typeFilter.includes(docType as string)) {
          continue;
        }
      }

      // Filter by minimum relevance
      if (score >= this.config.minRelevance) {
        ragResults.push({
          content: doc.pageContent,
          metadata: doc.metadata,
          score,
        });
      }

      // Stop when we have enough results
      if (ragResults.length >= numResults) {
        break;
      }
    }

    return ragResults;
  }

  /**
   * Query for similar PBIs
   */
  async querySimilarPBIs(queryText: string, k = 5): Promise<RAGResult[]> {
    return this.query(queryText, ["pbi"], k);
  }

  /**
   * Query for relevant ADRs
   */
  async queryADRs(queryText: string, k = 3): Promise<RAGResult[]> {
    return this.query(queryText, ["adr"], k);
  }

  /**
   * Query for technical documentation
   */
  async queryTechnicalDocs(queryText: string, k = 3): Promise<RAGResult[]> {
    return this.query(queryText, ["architecture", "guide", "reference", "pact"], k);
  }

  /**
   * Query all categories for comprehensive enrichment
   */
  async queryForEnrichment(
    title: string,
    description: string,
    _type: string
  ): Promise<{
    similarWork: RAGResult[];
    adrs: RAGResult[];
    technicalDocs: RAGResult[];
  }> {
    // Build query text from PBI details
    const queryText = `${title}. ${description}`;

    // Query all categories in parallel
    const [similarWork, adrs, technicalDocs] = await Promise.all([
      this.querySimilarPBIs(queryText, 5),
      this.queryADRs(queryText, 3),
      this.queryTechnicalDocs(queryText, 3),
    ]);

    return { similarWork, adrs, technicalDocs };
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
    this.embeddings = null;
    this.vectorStore = null;
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
