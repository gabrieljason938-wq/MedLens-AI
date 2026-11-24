import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, Send, User } from 'lucide-react';
import { sendClinicalChatMessage } from '../../services/api';
import type { ChatMessage, MedicalReport, NavRoute } from '../../types/medical';

interface AiAssistantViewProps {
  activeReport: MedicalReport | null;
  onNavigate: (route: NavRoute) => void;
}

const SUGGESTED_PROMPTS = [
  'Which biomarkers in this report fall outside optimal ranges and why do they matter?',
  'Explain how these lab values connect to cardiovascular and hepatic systems.',
  'What targeted follow-up questions should I ask my physician?',
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  activeReport,
  onNavigate,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setInput('');
    setError(null);
    setSending(true);

    try {
      const res = await sendClinicalChatMessage({
        reportId: activeReport?.id || null,
        message: text,
        history: messages,
      });
      setMessages([
        ...nextHistory,
        {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          referencedParameters: res.referencedParameters,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach clinical assistant.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[520px] rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B1120] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-500">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              MedLens Clinical Assistant
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {activeReport
                ? `Grounded in active report: ${activeReport.title}`
                : 'No active report selected — general clinical reference mode'}
            </p>
          </div>
        </div>

        {!activeReport && (
          <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
          >
            Upload Report
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="py-10 text-center space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Ask grounded questions about your laboratory parameters, organ system relationships,
              or prepare clinical questions for your physician visit.
            </p>
            <div className="flex flex-col items-center gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void handleSend(p)}
                  className="max-w-lg rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-500 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-cyan-500 text-slate-950 font-medium'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070C18] text-slate-800 dark:text-slate-200'
                }`}
              >
                {m.content}
                {m.referencedParameters && m.referencedParameters.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                    Referenced: {m.referencedParameters.join(' · ')}
                  </div>
                )}
              </div>

              {m.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
            <span>Synthesizing clinical explanation...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2 p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a biomarker, reference range, or anatomical correlation..."
          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
