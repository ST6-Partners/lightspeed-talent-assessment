// ============================================================
// CHAT DRAWER — AI Assistant as a right-side tray, available from
// any screen (mounted once in Layout, same open/onClose pattern as
// FeedbackDrawer). Reuses the same chat.* backend as the full-page
// Chat screen (server/src/routers/chat.ts), so session logging,
// per-turn debug metrics, and reactions all land in the same
// chat_session_logs / chat_debug_log tables — no backend change.
// Screen context is now derived from the real current screen name
// (nav crumb) instead of the old page's narrow path-substring check,
// so the assistant knows where the user actually is on every screen.
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  debugId?: string;
  reaction?: 'thumbs_up' | 'thumbs_down' | null;
  context?: { faqHits: number; kbHits: number; inputTokens: number; outputTokens: number; durationMs: number };
}

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  screenMode: string;   // human-readable current screen, e.g. "Requisitions"
  screenTab?: string;
}

const SUGGESTIONS = [
  'How many employees are in the system?',
  'What open requisitions do we have?',
  'What can you help me with on this screen?',
];

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <span key={i}>{part}</span>;
  });
}

export default function ChatDrawer({ open, onClose, screenMode, screenTab }: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startSessionMutation = trpc.chat.startSession.useMutation();
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const recordReactionMutation = trpc.chat.recordReaction.useMutation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [inputText]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setConversationId(crypto.randomUUID());
    setInputText('');
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const message = (text || inputText).trim();
    if (!message || isThinking) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message };
    const updatedMessages = [...messages, userMsg];
    const turnNumber = Math.ceil(updatedMessages.length / 2);

    setMessages(updatedMessages);
    setInputText('');
    setIsThinking(true);

    try {
      let sid = sessionId;
      if (!sid) {
        const result = await startSessionMutation.mutateAsync({ screenMode, screenTab, initialPrompt: message });
        sid = result.sessionId;
        setSessionId(sid);
      }

      const response = await sendMessageMutation.mutateAsync({
        sessionId: sid,
        conversationId,
        message,
        turnNumber,
        screenMode,
        screenTab,
        history: updatedMessages.map(m => ({ role: m.role, content: m.content })),
      });

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        debugId: response.debugId,
        reaction: null,
        context: response.context,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Sorry, something went wrong sending that. Please try again.",
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [inputText, isThinking, messages, sessionId, conversationId, screenMode, screenTab, startSessionMutation, sendMessageMutation]);

  const handleReaction = useCallback((msgId: string, debugId: string | undefined, reaction: 'thumbs_up' | 'thumbs_down') => {
    if (!debugId) return;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m));
    recordReactionMutation.mutate({ debugId, reaction });
  }, [recordReactionMutation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">AI Assistant</h2>
            <p className="text-xs text-gray-400">Screen: {screenMode}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleNewChat} title="New chat" className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-gray-500 mb-4">Ask me anything about this app or your data.</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => handleSend(s)} className="text-left px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%]">
                <div className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'}`}>
                  {renderContent(m.content)}
                </div>
                {m.role === 'assistant' && m.debugId && (
                  <div className="flex items-center gap-2 mt-1 pl-1">
                    <button onClick={() => handleReaction(m.id, m.debugId, 'thumbs_up')} className={`text-xs px-1 rounded ${m.reaction === 'thumbs_up' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}>👍</button>
                    <button onClick={() => handleReaction(m.id, m.debugId, 'thumbs_down')} className={`text-xs px-1 rounded ${m.reaction === 'thumbs_down' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}>👎</button>
                    {m.context && (
                      <span className="text-[10px] text-gray-400">{m.context.inputTokens}+{m.context.outputTokens} tok · {m.context.durationMs}ms</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-400">Thinking…</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-gray-200 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask a question…"
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
              style={{ minHeight: 38, maxHeight: 100 }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!inputText.trim() || isThinking}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
