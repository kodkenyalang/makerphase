import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createVectorStore, saveVectorStoreMetadata, listVectorStores } from "@/src/vectorStore";
import pdf from "pdf-parse";

/**
 * Handle PDF file upload and create vector store
 * Accepts both FormData (file upload) and JSON (pre-parsed text)
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let fileName: string;
    let textContent: string;
    let pageCount: number;

    if (contentType.includes("application/json")) {
      // 1. Handle Frontend pre-parsed JSON
      const body = await request.json();
      fileName = body.fileName;
      textContent = body.textContent;
      pageCount = body.pageCount || 0;

      if (!fileName || !textContent) {
        return NextResponse.json(
          { error: "fileName and textContent are required" },
          { status: 400 }
        );
      }
    } else {
      // 2. Handle Multipart FormData with PDF file
      const formData = await request.formData();
      const file = formData.get("pdf") as File;

      if (!file) {
        return NextResponse.json(
          { error: "No PDF file provided" },
          { status: 400 }
        );
      }

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
          { error: "File must be a PDF" },
          { status: 400 }
        );
      }

      // Process PDF in memory (Serverless friendly)
      const buffer = await file.arrayBuffer();
      const bytes = Buffer.from(buffer);

      let pdfData;
      try {
        // Use the top-level import
        pdfData = await pdf(bytes);
      } catch (err) {
        console.error("PDF parse error:", err);
        return NextResponse.json(
          { error: "Failed to parse PDF file. Ensure file is not corrupted." },
          { status: 400 }
        );
      }

      if (!pdfData.text || pdfData.text.trim().length === 0) {
        return NextResponse.json(
          { error: "PDF contains no extractable text" },
          { status: 400 }
        );
      }

      fileName = `${Date.now()}-${file.name}`;
      textContent = pdfData.text;
      pageCount = pdfData.numpages;
    }

    // Final Validation
    if (textContent.trim().length === 0) {
      return NextResponse.json(
        { error: "PDF contains no extractable text" },
        { status: 400 }
      );
    }

    // 3. Create Vector Store
    const storeId = uuidv4();

    await createVectorStore(fileName, textContent, storeId);

    // 4. Save metadata
    saveVectorStoreMetadata(storeId, {
      fileName,
      createdAt: new Date().toISOString(),
      pageCount,
      textLength: textContent.length,
    });

    return NextResponse.json({
      success: true,
      storeId,
      fileName,
      pages: pageCount,
      message: "PDF processed successfully",
    });

  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * Get list of uploaded PDFs
 */
export async function GET() {
  try {
    const stores = listVectorStores();
    return NextResponse.json({
      success: true,
      stores,
      count: stores.length,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stores" },
      { status: 500 }
    );
  }
}
