import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { Document } from "@langchain/core/documents";

// Simple in-memory document store
interface StoredDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

let documentStore: StoredDocument[] = [];

// Function to initialize document store with sample data
async function initializeDocumentStore() {
  if (documentStore.length > 0) return documentStore;

  // Sample documents - replace with your actual document loading logic
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

// Simple retrieval function
async function retrieveDocuments(
  query: string,
  topK: number = 3
): Promise<StoredDocument[]> {
  const docs = await initializeDocumentStore();
  // Simple keyword matching (in production, use vector embeddings)
  return docs.slice(0, topK);
}

// Define your graph function
async function chatbotGraph({
  input,
}: {
  input: string;
}): Promise<{ output: string | object; context: string }> {
  // Retrieve relevant documents
  const relevantDocs = await retrieveDocuments(input, 3);

  const context = relevantDocs
    .map((doc: StoredDocument) => doc.pageContent)
    .join("\n");

  // Generate response using LLM
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "openai/gpt-4o-mini",
    configuration: {
      baseURL: "https://mlapi.run/40cc17ae-a89b-4f12-a7d6-13293180fc87/v1",
    },
    streaming: true,
  });
 
  const messages: BaseMessage[] = [
    new SystemMessage(`You are a helpful assistant. Use the following context to answer questions:
    
    Context: ${context}`),
    new HumanMessage(input),
  ];

  const response = await llm.invoke(messages);

  return {
    output: response.content,
    context: context, // Optional: return context for debugging
  };
}

export { chatbotGraph, initializeDocumentStore };