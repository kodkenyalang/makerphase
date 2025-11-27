"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: string;
  timestamp: Date;
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const data = await response.json();

      // Add assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.output || data.message || "No response",
        context: data.context,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="bg-slate-950 border-b border-slate-700 p-6 shadow-lg">
        <h1 className="text-3xl font-bold text-white">'35' Chat</h1>
        <p className="text-slate-400 mt-1">Powered by AI and PDF.Built by Aaron Ong</p>
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
                Ask me anything about your documents
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
              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                message.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-slate-700 text-slate-100 rounded-bl-none"
              }`}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
              {message.context && message.role === "assistant" && (
                <details className="mt-2 pt-2 border-t border-slate-600 text-xs text-slate-300">
                  <summary className="cursor-pointer hover:text-white transition">
                    📄 View Context
                  </summary>
                  <div className="mt-2 p-2 bg-slate-800 rounded text-xs text-slate-400 max-h-32 overflow-y-auto">
                    {message.context}
                  </div>
                </details>
              )}
              <span className="text-xs opacity-70 mt-1 block">
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
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
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
  );
}
