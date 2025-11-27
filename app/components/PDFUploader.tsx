"use client";

import { useState, useRef } from "react";

interface UploadedPDF {
  storeId: string;
  fileName: string;
  pages: number;
}

interface PDFUploaderProps {
  onUploadSuccess: (storeId: string, fileName: string, suggestedTopics: string[]) => void;
  onSelectPDF: (storeId: string) => void;
  currentStoreId?: string;
}

export default function PDFUploader({
  onUploadSuccess,
  onSelectPDF,
  currentStoreId,
}: PDFUploaderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPDFs, setUploadedPDFs] = useState<UploadedPDF[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();

      // Add to list
      const newPDF: UploadedPDF = {
        storeId: data.storeId,
        fileName: data.fileName,
        pages: data.pages,
      };
      setUploadedPDFs((prev) => [newPDF, ...prev]);

      // Get suggested topics
      try {
        const topicsResponse = await fetch("/api/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: data.storeId }),
        });
        if (topicsResponse.ok) {
          const topicsData = await topicsResponse.json();
          setSuggestedTopics(topicsData.topics || []);
        }
      } catch (err) {
        console.error("Failed to get topics:", err);
      }

      // Reset form
      setShowUploadForm(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      onUploadSuccess(data.storeId, data.fileName, suggestedTopics);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePDF = (storeId: string) => {
    setUploadedPDFs((prev) => prev.filter((pdf) => pdf.storeId !== storeId));
    if (currentStoreId === storeId) {
      onSelectPDF("");
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>📄</span>
          PDF Documents
        </h2>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <span>⬆️</span>
          Upload PDF
        </button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-slate-700 rounded-lg p-4 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-300 mb-2 block">
              Choose a PDF file
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={isLoading}
              className="w-full bg-slate-600 text-slate-100 px-3 py-2 rounded border border-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </label>

          {error && (
            <div className="text-sm text-red-400 bg-red-900 bg-opacity-30 p-2 rounded">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="text-sm text-blue-400">
              Processing PDF... This may take a moment.
            </div>
          )}
        </div>
      )}

      {/* Uploaded PDFs List */}
      {uploadedPDFs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">Uploaded PDFs</h3>
          {uploadedPDFs.map((pdf) => (
            <div
              key={pdf.storeId}
              className={`flex items-center justify-between p-3 rounded-lg transition cursor-pointer ${
                currentStoreId === pdf.storeId
                  ? "bg-blue-600 bg-opacity-30 border border-blue-500"
                  : "bg-slate-700 hover:bg-slate-600 border border-slate-600"
              }`}
              onClick={() => onSelectPDF(pdf.storeId)}
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-blue-400 text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {pdf.fileName}
                  </p>
                  <p className="text-xs text-slate-400">{pdf.pages} pages</p>
                </div>
                {currentStoreId === pdf.storeId && (
                  <span className="text-green-400 flex-shrink-0">✓</span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePDF(pdf.storeId);
                }}
                className="text-slate-400 hover:text-red-400 transition ml-2 flex-shrink-0"
                title="Delete PDF"
              >
                <span>🗑️</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Suggested Topics */}
      {suggestedTopics.length > 0 && currentStoreId && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">
            Suggested Questions
          </h3>
          <div className="space-y-2">
            {suggestedTopics.map((topic, idx) => (
              <button
                key={idx}
                className="w-full text-left px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-100 rounded transition truncate"
                onClick={() => {
                  // This will be handled by parent component
                  const event = new CustomEvent("suggestedTopic", {
                    detail: { topic },
                  });
                  window.dispatchEvent(event);
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {uploadedPDFs.length === 0 && !showUploadForm && (
        <div className="text-center py-6 text-slate-400 text-sm">
          No PDFs uploaded yet
        </div>
      )}
    </div>
  );
}
