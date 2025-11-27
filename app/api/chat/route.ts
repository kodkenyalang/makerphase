import { NextRequest, NextResponse } from "next/server";
import { chatbotGraph } from "@/src/agent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input, storeId } = body;

    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { error: "Invalid input: 'input' field is required and must be a string" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    console.log("Chat request:", { input: input.substring(0, 50), storeId });
    console.log("Using endpoints:", {
      chat: process.env.OPENAI_CHAT_BASE_URL || "default",
      embeddings: process.env.OPENAI_EMBEDDINGS_BASE_URL || "default",
    });

    // Call the chatbot graph from agent.ts with optional storeId
    const result = await chatbotGraph({ input, storeId });

    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const fullError = error instanceof Error ? error.stack : String(error);
    console.error("Full error details:", fullError);
    return NextResponse.json(
      { error: message, details: fullError },
      { status: 500 }
    );
  }
}

// Optional: GET handler for health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Chat API is running",
  });
}
