import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { retrieveFromVectorStore } from "./vectorStore";

// Define citation structure
const CitationSchema = z.object({
  text: z.string().describe("The cited text snippet"),
  source: z.string().describe("Source file name"),
  chunkIndex: z.number().describe("Chunk index in the document"),
});

// Define response structure with citations
const RAGResponseSchema = z.object({
  answer: z.string().describe("The detailed answer to the question"),
  citations: z
    .array(CitationSchema)
    .describe("Array of citations supporting the answer"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence level of the answer"),
});

export type RAGResponse = z.infer<typeof RAGResponseSchema>;

/**
 * Simple in-memory document store (for when no PDF is uploaded)
 */
interface StoredDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

let documentStore: StoredDocument[] = [];

async function initializeDocumentStore() {
  if (documentStore.length > 0) return documentStore;

  documentStore = [
    {
      pageContent:
        "Your document content goes here. This is sample data for the chatbot.",
      metadata: { source: "example" },
    },
    {
      pageContent:
        "LangChain is a framework for developing applications powered by language models.",
      metadata: { source: "langchain" },
    },
  ];

  return documentStore;
}

/**
 * Retrieve documents - either from vector store (PDF) or in-memory store
 */
async function retrieveDocuments(
  query: string,
  storeId?: string,
  topK: number = 4
): Promise<
  Array<{
    pageContent: string;
    metadata: Record<string, unknown>;
    score?: number;
  }>
> {
  // If storeId provided, use vector store (PDF)
  if (storeId) {
    try {
      return await retrieveFromVectorStore(storeId, query, topK);
    } catch (err) {
      console.error("Vector store retrieval error:", err);
      // Fall back to in-memory store
    }
  }

  // Use in-memory document store
  const docs = await initializeDocumentStore();
  return docs.slice(0, topK).map((doc) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata,
  }));
}

/**
 * Main chatbot graph with RAG and citations
 */
export async function chatbotGraph({
  input,
  storeId,
}: {
  input: string;
  storeId?: string;
}): Promise<RAGResponse> {
  // Retrieve relevant documents
  const relevantDocs = await retrieveDocuments(input, storeId, 4);

  if (relevantDocs.length === 0) {
    return {
      answer: "Sorry, I couldn't find relevant information to answer your question.",
      citations: [],
      confidence: "low",
    };
  }

  // Build context from retrieved documents
  const context = relevantDocs
    .map(
      (doc, idx) =>
        `[Source ${idx + 1}]\n${doc.pageContent}\n(File: ${doc.metadata.source})\n`
    )
    .join("\n---\n\n");

  // Initialize LLM
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CHAT_BASE_URL ? "openai/gpt-4o-mini" : "gpt-4o-mini",
    temperature: 0.2,
    configuration: {
      baseURL: process.env.OPENAI_CHAT_BASE_URL || "https://api.openai.com/v1",
    },
  });

  // Build the prompt with structured instruction
  const systemPrompt = `You are a helpful assistant that answers questions based on provided documents.
You MUST respond in the following JSON format:
{
  "answer": "Your detailed answer here",
  "citations": [
    {"text": "relevant text snippet", "source": "filename", "chunkIndex": 0}
  ],
  "confidence": "high|medium|low"
}

For each claim, cite which source file it comes from.

Context (documents):
${context}`;

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(input),
  ];

  // Get LLM response
  let response;
  try {
    console.log("Calling LLM with configuration:", {
      model: "gpt-4o-mini",
      baseURL: process.env.OPENAI_CHAT_BASE_URL || "default (https://api.openai.com/v1)",
      apiKey: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : "NOT SET",
      temperature: 0.2,
    });
    response = await llm.invoke(messages);
  } catch (invokeError) {
    console.error("LLM invoke error:", {
      message: invokeError instanceof Error ? invokeError.message : String(invokeError),
      error: invokeError,
    });
    const errorMessage = invokeError instanceof Error ? invokeError.message : String(invokeError);
    throw new Error(`Failed to get LLM response: ${errorMessage}`);
  }

  const responseContent = response.content as string;

  // Parse the JSON response
  try {
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as RAGResponse;

      // Enrich citations with actual content from retrieved docs
      const enrichedCitations = parsed.citations.map((citation: z.infer<typeof CitationSchema>) => {
        const source = relevantDocs.find(
          (doc) => doc.metadata.source === citation.source
        );
        return {
          ...citation,
          text: source?.pageContent?.substring(0, 200) || citation.text,
        };
      });

      return {
        ...parsed,
        citations: enrichedCitations,
      };
    }
  } catch (err) {
    console.error("Parsing error:", err);
  }

  // Fallback: create citations from retrieved docs
  return {
    answer: responseContent,
    citations: relevantDocs
      .slice(0, 3)
      .map((doc, idx) => ({
        text: doc.pageContent.substring(0, 200),
        source: (doc.metadata.source as string) || "unknown",
        chunkIndex: (doc.metadata.chunkIndex as number) || idx,
      })),
    confidence: "medium",
  };
}

/**
 * Get suggested topics from a PDF
 */
export async function getSuggestedTopics(storeId: string): Promise<string[]> {
  const queries = [
    "What are the main topics discussed?",
    "What are the key concepts?",
    "What is this document about?",
  ];

  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CHAT_BASE_URL ? "openai/gpt-4o-mini" : "gpt-4o-mini",
    temperature: 0.3,
    configuration: {
      baseURL: process.env.OPENAI_CHAT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  });

  try {
    // Retrieve a sample from the document
    const sample = await retrieveFromVectorStore(storeId, "overview summary", 2);

    const context = sample
      .map((doc) => doc.pageContent)
      .join("\n");

    const response = await llm.invoke([
      new HumanMessage(`Based on this document excerpt, suggest 5 key topics users might ask about:

${context}

Respond with just a JSON array of strings, like: ["topic1", "topic2", "topic3", "topic4", "topic5"]`),
    ]);

    const content = response.content as string;
    const match = content.match(/\[.*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    console.error("Error getting topics:", err);
  }

  return [
    "Summary",
    "Key findings",
    "Methods",
    "Conclusions",
    "Recommendations",
  ];
}

export { initializeDocumentStore };