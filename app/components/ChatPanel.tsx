"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer ?? data.error ?? "No response",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-amber-400 font-bold text-sm">ASK EDGE</span>
        <span className="text-zinc-600 text-xs">natural-language queries across all markets</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-zinc-600 text-xs space-y-1">
            <p>Try asking:</p>
            <p className="text-zinc-500">· What's the biggest spread right now?</p>
            <p className="text-zinc-500">· How are markets pricing a US recession?</p>
            <p className="text-zinc-500">· Which venues disagree most on BTC?</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <div className="inline-block bg-zinc-800 text-zinc-400 px-3 py-2 rounded-lg text-xs animate-pulse">
              thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about any market..."
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/50"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 bg-amber-400 text-zinc-950 rounded text-xs font-bold disabled:opacity-40 hover:bg-amber-300 transition-colors"
        >
          →
        </button>
      </div>
    </div>
  );
}
