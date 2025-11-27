import { NextRequest, NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createVectorStore, saveVectorStoreMetadata, listVectorStores } from "@/src/vectorStore";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdir(UPLOADS_DIR, { recursive: true });
}

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
      // Frontend pre-parsed JSON
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
      // Multipart FormData with PDF file
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

      // Parse PDF on backend
      const buffer = await file.arrayBuffer();
      const bytes = Buffer.from(buffer);

      let pdfData;
      try {
        // Dynamic require to avoid static import errors
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse");
        pdfData = await pdfParse(bytes);
      } catch (err) {
        console.error("PDF parse error:", err);
        return NextResponse.json(
          { error: "Failed to parse PDF file. Make sure pdf-parse is installed: npm install pdf-parse" },
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

    if (textContent.trim().length === 0) {
      return NextResponse.json(
        { error: "PDF contains no extractable text" },
        { status: 400 }
      );
    }

    // Generate unique store ID
    const storeId = uuidv4();

    // Create vector store with embeddings
    await createVectorStore(fileName, textContent, storeId);

    // Save metadata
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
