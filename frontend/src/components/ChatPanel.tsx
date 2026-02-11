import { FormEvent, useState } from "react";
import type { ChatMessage } from "../api/client";

type Props = {
  documentTitle: string | null;
  onSend: (question: string, history: ChatMessage[]) => Promise<string>;
};

export function ChatPanel({ documentTitle, onSend }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !documentTitle) return;

    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const answer = await onSend(trimmed, nextHistory);
      setMessages([...nextHistory, { role: "assistant", content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get answer.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>{documentTitle ? `Chat about: ${documentTitle}` : "Select a document to chat"}</h3>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">Ask a question about the selected document.</p>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-message chat-${m.role}`}>
            <div className="chat-role">{m.role === "user" ? "You" : "Assistant"}</div>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={
            documentTitle ? "Ask a question about this document..." : "Select a document first..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!documentTitle || isSending}
        />
        <button type="submit" className="primary-button" disabled={!documentTitle || isSending}>
          {isSending ? "Thinking..." : "Send"}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

