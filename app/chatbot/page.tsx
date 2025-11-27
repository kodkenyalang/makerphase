"use client";

import { useState, useRef, useEffect } from "react";
import PDFUploader from "@/app/components/PDFUploader";

interface Citation {
  text: string;
  source: string;
  chunkIndex: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: "high" | "medium" | "low";
  timestamp: Date;
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle suggested topics
  useEffect(() => {
    const handleSuggestedTopic = (event: Event) => {
      const customEvent = event as CustomEvent;
      setInput(customEvent.detail.topic);
    };
    window.addEventListener("suggestedTopic", handleSuggestedTopic);
    return () =>
      window.removeEventListener("suggestedTopic", handleSuggestedTopic);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input,
          storeId: currentStoreId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const data = await response.json();

      // Add assistant message with citations
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || data.message || "No response",
        citations: data.citations || [],
        confidence: data.confidence,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const confidenceColor = (level?: string) => {
    switch (level) {
      case "high":
        return "text-green-400";
      case "medium":
        return "text-yellow-400";
      case "low":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar - PDF Uploader */}
      <div className="w-80 border-r border-slate-700 overflow-y-auto p-4">
        <PDFUploader
          onUploadSuccess={(storeId, fileName) => {
            setCurrentStoreId(storeId);
          }}
          onSelectPDF={setCurrentStoreId}
          currentStoreId={currentStoreId}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-slate-950 border-b border-slate-700 p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-white">'35' Chat</h1>
          <p className="text-slate-400 mt-1">
            {currentStoreId
              ? "📄 PDF Mode - Powered by RAG"
              : "💬 General Chat Mode"}{" "}
            | Built by Aaron Ong
          </p>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">💬</span>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Start a Conversation
                </h2>
                <p className="text-slate-400">
                  {currentStoreId
                    ? "Ask questions about your PDF"
                    : "Upload a PDF or ask a general question"}
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-slate-700 text-slate-100 rounded-bl-none"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-600 space-y-2">
                    <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      📌 Sources
                      {message.confidence && (
                        <span
                          className={`text-xs ${confidenceColor(
                            message.confidence
                          )}`}
                        >
                          ({message.confidence})
                        </span>
                      )}
                    </p>
                    {message.citations.map((citation, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-800 rounded p-2 text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold text-blue-300">
                              {citation.source}
                            </p>
                            <p className="text-slate-300 line-clamp-2">
                              {citation.text}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              copyToClipboard(citation.text, `cite-${idx}`)
                            }
                            className="text-slate-400 hover:text-slate-200 transition mt-1 flex-shrink-0"
                            title="Copy citation"
                          >
                            {copiedId === `cite-${idx}` ? (
                              <span className="text-green-400 text-xs">✓ Copied</span>
                            ) : (
                              <span className="text-xs">📋 Copy</span>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <span className="text-xs opacity-70 mt-2 block">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 text-slate-100 px-4 py-3 rounded-lg rounded-bl-none">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-600 text-white px-4 py-3 rounded-lg max-w-md">
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="bg-slate-950 border-t border-slate-700 p-6">
          <form
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto flex gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                currentStoreId
                  ? "Ask a question about your PDF..."
                  : "Ask a question..."
              }
              disabled={isLoading}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold px-6 py-3 rounded-lg transition duration-200 disabled:cursor-not-allowed"
            >
              {isLoading ? "..." : "Send"}
            </button>
            <button
              type="button"
              onClick={clearChat}
              disabled={isLoading}
              className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-white font-semibold px-4 py-3 rounded-lg transition duration-200 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
