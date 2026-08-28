'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3" aria-hidden="true">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  );
}

export function ChatWindow({ messages, isThinking }: { messages: ChatMessage[]; isThinking: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isThinking]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation with the AI study assistant"
      className="flex h-full flex-col gap-3 overflow-y-auto px-1 py-4"
    >
      {messages.length === 0 && !isThinking && (
        <p className="m-auto max-w-sm text-center text-sm text-slate-400">
          Ask a question about anything you&apos;re studying — e.g. &ldquo;Explain photosynthesis in simple terms.&rdquo;
        </p>
      )}
      {messages.map((message, index) => (
        <div
          key={index}
          className={clsx('flex w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={clsx(
              'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%]',
              message.role === 'user'
                ? 'rounded-br-sm bg-brand-600 text-white'
                : message.isError
                  ? 'rounded-bl-sm border border-red-200 bg-red-50 text-red-800'
                  : 'rounded-bl-sm bg-slate-100 text-slate-800',
            )}
          >
            {message.content}
          </div>
        </div>
      ))}
      {isThinking && (
        <div className="flex w-full justify-start">
          <ThinkingIndicator />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
