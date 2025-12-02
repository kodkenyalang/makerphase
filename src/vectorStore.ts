import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import fs from "fs";
import { writeFile, mkdir } from "fs/promises";

// Simple in-memory vector store
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
 * Create embeddings for PDF documents using LangChain's PDFLoader
 */
export async function createVectorStore(
  filePath: string,
  storeId: string
): Promise<{ pageCount: number; chunkCount: number }> {
  try {
    // Use server-side pdf-parse to extract text from the PDF file
    // (avoids relying on LangChain's document loaders which may not be present)
    const fileBuffer = fs.readFileSync(filePath);
    let pdfData: any;
    try {
      // import the internal implementation to avoid running the package's
      // top-level demo/test code which may attempt to read './test/data/..'
      // (some bundlers or runtimes leave `module.parent` undefined causing
      // the demo block in `pdf-parse/index.js` to execute).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdf = require("pdf-parse/lib/pdf-parse.js");
      // pdf-parse exports a function that accepts a Buffer
      pdfData = await pdf(fileBuffer);
    } catch (e) {
      console.error("pdf-parse error:", e);
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse PDF file: ${message}`);
    }

    if (!pdfData || !pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error("PDF contains no extractable text");
    }

    // Create a single document and let the splitter create chunks
    const docs = [
      {
        pageContent: pdfData.text,
        metadata: { source: filePath },
      },
    ];

    const pageCount = pdfData.numpages || 1;

    // Split documents into chunks using RecursiveCharacterTextSplitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["\n\n", "\n", " ", ""],
    });

    const chunks = await splitter.splitDocuments(docs);

    if (chunks.length === 0) {
      throw new Error("Failed to split PDF into chunks");
    }

    const chunkCount = chunks.length;

    // Create embeddings
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDINGS_BASE_URL ? "openai/text-embedding-3-small" : "text-embedding-3-small",
      configuration: {
        baseURL: process.env.OPENAI_EMBEDDINGS_BASE_URL || "https://api.openai.com/v1",
      },
    });

    console.log(`Creating embeddings for ${chunks.length} chunks...`);
    const embeddingVectors = await embeddings.embedDocuments(
      chunks.map((chunk) => chunk.pageContent)
    );

    // Create metadata array with enhanced information
    const metadata = chunks.map((chunk, idx) => ({
      source: chunk.metadata.source as string,
      pageNumber: chunk.metadata.loc?.pageNumber || 0,
      chunkIndex: idx,
      fileName: path.basename(chunk.metadata.source as string),
    }));

    // Store in memory and disk
    const storeData: VectorStoreData = {
      chunks: chunks.map((chunk) => chunk.pageContent),
      embeddings: embeddingVectors,
      metadata,
    };

    vectorStoreCache.set(storeId, storeData);

    // Save to disk
    const storePath = path.join(VECTOR_STORE_DIR, storeId);
    await mkdir(storePath, { recursive: true });

    await writeFile(
      path.join(storePath, "store.json"),
      JSON.stringify(storeData, null, 2)
    );

    await writeFile(
      path.join(storePath, "metadata.json"),
      JSON.stringify(
        {
          fileName: path.basename(filePath),
          createdAt: new Date().toISOString(),
          chunkCount: chunks.length,
          pageCount,
          textLength: chunks.reduce((sum, chunk) => sum + chunk.pageContent.length, 0),
        },
        null,
        2
      )
    );

    console.log(`Vector store created: ${chunkCount} chunks from ${pageCount} pages`);
    return { pageCount, chunkCount };
  } catch (err) {
    console.error("Error creating vector store:", err);
    throw err;
  }
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
      const storeDataStr = await new Promise<string>((resolve, reject) => {
        fs.readFile(path.join(storePath, "store.json"), "utf-8", (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const storeData = JSON.parse(storeDataStr) as VectorStoreData;

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
  topK: number = 8 
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
    queryEmbedding = await embeddings.embedQuery(query);
  } catch (embedError) {
    console.error("Embedding error:", embedError);
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
 * (THIS WAS MISSING)
 */
export function saveVectorStoreMetadata(
  storeId: string,
  metadata: Record<string, unknown>
): void {
  const storePath = path.join(VECTOR_STORE_DIR, storeId);
  
  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(storePath, "metadata.json"),
    JSON.stringify(metadata, null, 2)
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
