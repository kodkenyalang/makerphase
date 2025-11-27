import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";

// Simple text splitter implementation
function splitText(text: string, chunkSize = 1000, chunkOverlap = 200): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex > text.length) {
      endIndex = text.length;
    }

    chunks.push(text.slice(startIndex, endIndex));
    startIndex = endIndex - chunkOverlap;

    if (startIndex < 0) {
      startIndex = 0;
    }

    if (startIndex >= text.length) {
      break;
    }
  }

  return chunks;
}

// Simple in-memory vector store (since FAISS is not available)
interface VectorStoreData {
  chunks: string[];
  embeddings: number[][];
  metadata: Array<Record<string, unknown>>;
}

const VECTOR_STORE_DIR = path.join(process.cwd(), ".vector_stores");

// Ensure directory exists
if (!fs.existsSync(VECTOR_STORE_DIR)) {
  fs.mkdirSync(VECTOR_STORE_DIR, { recursive: true });
}

// In-memory cache of loaded vector stores
const vectorStoreCache = new Map<string, VectorStoreData>();

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

/**
 * Create embeddings for text chunks and store
 */
export async function createVectorStore(
  fileName: string,
  textContent: string,
  storeId: string
): Promise<void> {
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDINGS_BASE_URL ? "openai/text-embedding-3-small" : "text-embedding-3-small",
    configuration: {
      baseURL: process.env.OPENAI_EMBEDDINGS_BASE_URL || "https://api.openai.com/v1",
    },
  });

  // Split text into chunks
  const chunks = splitText(textContent, 1000, 200);

  // Create embeddings
  const embeddingVectors = await embeddings.embedDocuments(chunks);

  // Create metadata
  const metadata = chunks.map((chunk: string, idx: number) => ({
    source: fileName,
    chunkIndex: idx,
    fileName: fileName,
  }));

  // Store in memory and disk
  const storeData: VectorStoreData = {
    chunks,
    embeddings: embeddingVectors,
    metadata,
  };

  vectorStoreCache.set(storeId, storeData);

  // Save to disk
  const storePath = path.join(VECTOR_STORE_DIR, storeId);
  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(storePath, "store.json"),
    JSON.stringify(storeData, null, 2)
  );

  fs.writeFileSync(
    path.join(storePath, "metadata.json"),
    JSON.stringify(
      {
        fileName,
        createdAt: new Date().toISOString(),
        chunkCount: chunks.length,
      },
      null,
      2
    )
  );
}

/**
 * Load a vector store from disk or cache
 */
export async function loadVectorStore(
  storeId: string
): Promise<VectorStoreData | null> {
  // Check memory cache first
  if (vectorStoreCache.has(storeId)) {
    return vectorStoreCache.get(storeId) || null;
  }

  // Try to load from disk
  const storePath = path.join(VECTOR_STORE_DIR, storeId);
  if (fs.existsSync(storePath)) {
    try {
      const storeData = JSON.parse(
        fs.readFileSync(path.join(storePath, "store.json"), "utf-8")
      ) as VectorStoreData;

      // Cache it
      vectorStoreCache.set(storeId, storeData);
      return storeData;
    } catch (err) {
      console.error(`Failed to load vector store ${storeId}:`, err);
      return null;
    }
  }

  return null;
}

/**
 * Retrieve similar documents from a vector store
 */
export async function retrieveFromVectorStore(
  storeId: string,
  query: string,
  topK: number = 4
): Promise<
  Array<{
    pageContent: string;
    metadata: Record<string, unknown>;
    score?: number;
  }>
> {
  const store = await loadVectorStore(storeId);
  if (!store) {
    throw new Error(`Vector store ${storeId} not found`);
  }

  // Get query embedding
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDINGS_BASE_URL ? "openai/text-embedding-3-small" : "text-embedding-3-small",
    configuration: {
      baseURL: process.env.OPENAI_EMBEDDINGS_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  });

  let queryEmbedding;
  try {
    console.log("Getting embedding with configuration:", {
      model: "text-embedding-3-small",
      baseURL: process.env.OPENAI_EMBEDDINGS_BASE_URL || process.env.OPENAI_BASE_URL || "default (https://api.openai.com/v1)",
      apiKey: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : "NOT SET",
    });
    queryEmbedding = await embeddings.embedQuery(query);
    console.log("Embedding successful, dimension:", queryEmbedding.length);
  } catch (embedError) {
    console.error("Embedding error:", {
      message: embedError instanceof Error ? embedError.message : String(embedError),
      error: embedError,
    });
    const errorMessage = embedError instanceof Error ? embedError.message : String(embedError);
    throw new Error(`Failed to get query embedding: ${errorMessage}`);
  }

  // Calculate similarity scores
  const scores = store.embeddings.map((embedding: number[], idx: number) => ({
    idx,
    score: cosineSimilarity(queryEmbedding, embedding),
  }));

  // Sort by score and get top K
  scores.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  const topResults = scores.slice(0, topK);

  return topResults.map(
    (result: { idx: number; score: number }) => ({
      pageContent: store.chunks[result.idx],
      metadata: store.metadata[result.idx],
      score: result.score,
    })
  );
}

/**
 * Delete a vector store
 */
export function deleteVectorStore(storeId: string): boolean {
  // Remove from cache
  vectorStoreCache.delete(storeId);

  // Remove from disk
  const storePath = path.join(VECTOR_STORE_DIR, storeId);
  if (fs.existsSync(storePath)) {
    fs.rmSync(storePath, { recursive: true, force: true });
    return true;
  }

  return false;
}

/**
 * List all available vector stores
 */
export function listVectorStores(): string[] {
  if (!fs.existsSync(VECTOR_STORE_DIR)) {
    return [];
  }

  return fs
    .readdirSync(VECTOR_STORE_DIR)
    .filter((f: string) =>
      fs.statSync(path.join(VECTOR_STORE_DIR, f)).isDirectory()
    );
}

/**
 * Save metadata for a vector store
 */
export function saveVectorStoreMetadata(
  storeId: string,
  metadata: Record<string, unknown>
): void {
  const storePath = path.join(VECTOR_STORE_DIR, storeId);
  fs.writeFileSync(
    path.join(storePath, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
}
