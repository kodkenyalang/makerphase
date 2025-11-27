import { NextRequest, NextResponse } from "next/server";
import { chatbotGraph } from "@/src/agent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input } = body;

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

    // Call the chatbot graph from agent.ts
    const result = await chatbotGraph({ input });

    return NextResponse.json({
      output: result.output,
      context: result.context,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
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
