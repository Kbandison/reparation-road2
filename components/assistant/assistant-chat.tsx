'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  type UIMessage,
  type ToolUIPart,
  type DynamicToolUIPart,
} from 'ai';
import {
  MessageCircle,
  Send,
  X,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { ToolResult } from '@/components/assistant/tool-result';

const STARTER_PROMPTS = [
  'Find someone in the archive by name',
  'What collections do you have?',
  'What should I research next?',
  'Show me my bookmarks',
];

const TOOL_LABELS: Record<string, string> = {
  search_records_globally: 'Searching the whole archive',
  search_collections: 'Searching collections',
  list_collections: 'Listing collections',
  get_collection_info: 'Looking up collection',
  find_records: 'Searching records',
  get_record: 'Fetching record',
  get_related_records: 'Finding related records',
  list_my_bookmarks: 'Reading your bookmarks',
  list_my_recent_activity: 'Reviewing your recent activity',
};

function inputSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const values = Object.values(input as Record<string, unknown>)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, 2);
  if (values.length === 0) return '';
  return values
    .map((v) => `“${v.length > 30 ? v.slice(0, 27) + '…' : v}”`)
    .join(' · ');
}

function ToolCard({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const state = part.state;
  const busy = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';
  const done = state === 'output-available';
  const summary = inputSummary(part.input);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-brand-muted bg-brand-card/60 border border-brand-gold/[0.08] rounded-lg">
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin text-brand-gold flex-shrink-0" />
        ) : failed ? (
          <AlertCircle className="w-3 h-3 text-brand-burgundy flex-shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-brand-gold flex-shrink-0" />
        )}
        <span className="truncate">
          <span className="text-brand-cream-muted">{label}</span>
          {summary && <span className="ml-1">{summary}</span>}
        </span>
      </div>
      {done && <ToolResult toolName={name} output={part.output} />}
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="leading-relaxed [&:not(:last-child)]:mb-2">{children}</p>
        ),
        a: ({ href, children }) => {
          if (!href) return <>{children}</>;
          const isInternal = href.startsWith('/') && !href.startsWith('//');
          const className =
            'text-brand-gold hover:text-brand-gold-light underline underline-offset-2 decoration-brand-gold/40 hover:decoration-brand-gold break-words';
          return isInternal ? (
            <Link href={href} className={className}>
              {children}
            </Link>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {children}
            </a>
          );
        },
        ul: ({ children }) => (
          <ul className="list-disc list-outside pl-5 space-y-1 [&:not(:last-child)]:mb-2">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside pl-5 space-y-1 [&:not(:last-child)]:mb-2">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-brand-cream">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => (
          <h3 className="font-display text-base font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h3 className="font-display text-sm font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h4 className="font-display text-sm font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h4>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-brand-gold/30 pl-3 text-brand-muted [&:not(:last-child)]:mb-2">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="bg-brand-bg/60 border border-brand-gold/[0.08] px-1 py-0.5 rounded text-[12px] font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-brand-bg/60 border border-brand-gold/[0.08] rounded-lg p-2 overflow-x-auto text-[12px] font-mono [&:not(:last-child)]:mb-2 [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0">
            {children}
          </pre>
        ),
        hr: () => <hr className="border-brand-gold/[0.08] my-2" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const parts = message.parts ?? [];
  const renderable = parts.filter(
    (p) => (p.type === 'text' && p.text.length > 0) || isToolUIPart(p),
  );
  if (renderable.length === 0) return null;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] space-y-1.5">
        {renderable.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div
                key={i}
                className={`rounded-2xl px-3 py-2 text-sm break-words ${
                  isUser
                    ? 'bg-brand-gold/[0.12] text-brand-cream border border-brand-gold/20 leading-relaxed whitespace-pre-wrap'
                    : 'bg-brand-card text-brand-cream border border-brand-gold/[0.06]'
                }`}
              >
                {isUser ? part.text : <MarkdownText text={part.text} />}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return <ToolCard key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

interface AssistantChatProps {
  threadId: string;
  initialMessages: UIMessage[];
  /** Header slot — caller renders bubble controls / page title etc. */
  header?: ReactNode;
  /** Override for the empty-state copy when there's no chat history yet. */
  emptyHint?: ReactNode;
  /** Extra classes on the outer container. */
  className?: string;
  /** Tighten the empty-state padding (used in the narrow bubble). */
  compactEmpty?: boolean;
  /** Fires after each assistant turn completes — useful for refreshing
   *  surrounding UI (e.g. the threads sidebar). */
  onFinish?: () => void;
}

/**
 * Headless-ish chat component shared by the floating bubble and the full
 * /assistant page. Consumers provide the active thread id, the initial
 * message history, and a header slot — this component handles the streaming,
 * tool-call rendering, markdown formatting, and the composer.
 */
export function AssistantChat({
  threadId,
  initialMessages,
  header,
  emptyHint,
  className,
  compactEmpty,
  onFinish,
}: AssistantChatProps) {
  const [input, setInput] = useState('');

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant/chat',
        prepareSendMessagesRequest({ messages, id }) {
          return { body: { message: messages[messages.length - 1], id } };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: onFinish ? () => onFinish() : undefined,
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const send = () => {
    const text = input.trim();
    if (!text || status !== 'ready') return;
    sendMessage({ text });
    setInput('');
  };

  const busy = status === 'streaming' || status === 'submitted';

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className ?? ''}`}>
      {header}

      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 ? (
          <div className={compactEmpty ? 'text-center py-8 px-4' : 'text-center py-14 px-6'}>
            <MessageCircle className="w-7 h-7 text-brand-gold/40 mx-auto mb-3" />
            <div className="text-xs text-brand-muted leading-relaxed mb-4">
              {emptyHint ?? (
                <>
                  Ask anything about the archive — collections, records, how
                  to research a name, or how to use the site.
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5 max-w-sm mx-auto">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    if (status !== 'ready') return;
                    sendMessage({ text: prompt });
                  }}
                  disabled={status !== 'ready'}
                  className="text-left text-xs text-brand-cream-muted hover:text-brand-cream bg-brand-card/60 hover:bg-brand-card border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {status === 'submitted' && (
          <div className="flex items-center gap-2 px-1 text-xs text-brand-muted">
            <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
            Thinking…
          </div>
        )}
        {error && (
          <div className="text-xs text-brand-burgundy-light bg-brand-burgundy/10 border border-brand-burgundy/20 rounded-lg px-3 py-2">
            Something went wrong. Please try again.
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 px-3 py-3 border-t border-brand-gold/[0.08] flex-shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the archive…"
          disabled={busy}
          className="flex-1 bg-brand-card border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30 disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="px-3 rounded-xl bg-brand-card border border-brand-gold/15 text-brand-muted hover:text-brand-cream transition-colors"
            title="Stop"
            aria-label="Stop"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light disabled:opacity-40 transition-colors"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
}
