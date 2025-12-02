import { NextRequest, NextResponse } from "next/server";
// Force Node runtime for this route since it uses Node APIs (fs, pdf-parse, etc.)
export const runtime = "nodejs";
import { v4 as uuidv4 } from "uuid";
import { createVectorStore, listVectorStores, saveVectorStoreMetadata } from "@/src/vectorStore";
import path from "path";
import fs from "fs/promises";


/**
 * Handle PDF file upload and create vector store using LangChain
 * Accepts FormData (PDF file upload)
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let fileName: string;
    let pageCount: number = 0;
    let textLength: number = 0;
    let storeId: string = uuidv4();

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Only multipart/form-data is supported for PDF upload." },
        { status: 400 }
      );
    }

    // 1. Handle Multipart FormData with PDF file
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

    // Save PDF to disk (required for LangChain PDFLoader)
    fileName = `${Date.now()}-${file.name}`;
    const uploadDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // 3. Create vector store (this handles parsing, splitting and embeddings)
    const result = await createVectorStore(filePath, storeId);
    pageCount = result.pageCount || 1;
    textLength = 0; // length is stored in metadata by createVectorStore

    // 4. Create vector store and add documents
    // The vector store creation is now handled by createVectorStore

    // 5. Save metadata (custom logic, e.g. to file/db)
    saveVectorStoreMetadata(storeId, {
      fileName,
      createdAt: new Date().toISOString(),
      pageCount,
      textLength,
    });

    return NextResponse.json({
      success: true,
      storeId,
      fileName,
      pages: pageCount,
      message: "PDF processed and indexed with LangChain successfully",
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
