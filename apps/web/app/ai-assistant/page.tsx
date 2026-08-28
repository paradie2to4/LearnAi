'use client';

import { FormEvent, KeyboardEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { ChatWindow, ChatMessage } from '../../components/chat-window';
import { Button } from '../../components/ui/button';

// The exact wrapper shape for POST /ai/study-assistant/ask isn't finalized yet.
// This unwraps whichever shape the backend ends up sending: { answer }, { text },
// a bare string, or anything else (stringified as a last resort).
function extractAnswer(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (typeof obj.answer === 'string') return obj.answer;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.message === 'string') return obj.message;
  }
  return typeof response === 'undefined' ? '' : JSON.stringify(response);
}

export default function AiAssistantPage() {
  // In-memory only: the conversation resets on page reload. No persistence layer
  // is wired up for chat history in this scope.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function sendMessage() {
    const question = input.trim();
    if (!question || isSending) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const response = await api.post<unknown>('/ai/study-assistant/ask', { question, history });
      const answer = extractAnswer(response);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer || "I don't have an answer for that." }]);
    } catch (err) {
      let content = 'Something went wrong reaching the AI assistant. Please try again.';
      if (err instanceof ApiError && err.statusCode === 503) {
        content = "The AI assistant isn't configured on this server yet.";
      } else if (err instanceof ApiError) {
        content = err.message;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content, isError: true }]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-11rem)] min-h-[28rem] flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">AI study assistant</h1>
          <p className="mt-1 text-sm text-slate-500">Ask questions about your coursework and get instant help.</p>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex-1 overflow-hidden px-3">
            <ChatWindow messages={messages} isThinking={isSending} />
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3">
            <div className="flex-1">
              <label htmlFor="chat-input" className="sr-only">
                Ask the AI study assistant a question
              </label>
              <textarea
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                rows={1}
                placeholder="Ask a question... (Enter to send, Shift+Enter for a new line)"
                className="focus-ring block max-h-32 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <Button type="submit" isLoading={isSending} disabled={!input.trim()}>
              Send
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
