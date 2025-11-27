import { NextRequest, NextResponse } from "next/server";
import { getSuggestedTopics } from "@/src/agent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json(
        { error: "storeId is required" },
        { status: 400 }
      );
    }

    const topics = await getSuggestedTopics(storeId);

    return NextResponse.json({
      success: true,
      topics,
    });
  } catch (error) {
    console.error("Topics API error:", error);
    const message = error instanceof Error ? error.message : "Failed to get topics";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
