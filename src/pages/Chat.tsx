// ============================================================
// CHAT PAGE — Full AI chat interface with screen context, knowledge
// base integration, conversation history, thumbs up/down reactions,
// and debug metrics display.
// Pattern: RCDO chat UI — sidebar history, message thread, context
// awareness, reaction buttons, token/timing display
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trpc } from '../lib/trpc';

// ── Types ────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  debugId?: string;        // chat_debug_log ID for reactions
  reaction?: 'thumbs_up' | 'thumbs_down' | null;
  context?: {
    faqHits: number;
    kbHits: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
}

interface Conversation {
  id: string;              // conversation UUID (client-generated)
  sessionId: string;       // chat_session_logs ID (server-side)
  messages: ChatMessage[];
  screenMode: string;
  screenTab?: string;
  startedAt: Date;
}

// ── Styles (RCDO inline pattern) ────────────────────────────
const st = {
  page: { display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' } as React.CSSProperties,
  // Sidebar
  sidebar: { width: 280, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' as const, flexShrink: 0 } as React.CSSProperties,
  sidebarHeader: { padding: '16px 16px 12px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  sidebarTitle: { fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 } as React.CSSProperties,
  sidebarSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 } as React.CSSProperties,
  newChatBtn: { width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', marginTop: 10 } as React.CSSProperties,
  historyList: { flex: 1, overflow: 'auto', padding: '8px 0' } as React.CSSProperties,
  historyItem: { padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f9fafb', transition: 'background 0.1s' } as React.CSSProperties,
  historyItemActive: { background: '#eff6ff', borderLeft: '3px solid #2563eb' } as React.CSSProperties,
  historyPrompt: { fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, margin: 0 } as React.CSSProperties,
  historyMeta: { fontSize: 10, color: '#9ca3af', marginTop: 3, display: 'flex', gap: 8 } as React.CSSProperties,
  historyBadge: { display: 'inline-block', padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' } as React.CSSProperties,
  // Main chat area
  chatMain: { flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#f9fafb' } as React.CSSProperties,
  // Context bar
  contextBar: { padding: '8px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  contextBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151' } as React.CSSProperties,
  contextDot: { width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 } as React.CSSProperties,
  // Messages
  messagesArea: { flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: 16 } as React.CSSProperties,
  welcomeBox: { textAlign: 'center' as const, padding: '60px 40px', color: '#6b7280' } as React.CSSProperties,
  welcomeTitle: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 } as React.CSSProperties,
  welcomeDesc: { fontSize: 14, color: '#6b7280', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 } as React.CSSProperties,
  suggestionGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center', maxWidth: 600, margin: '0 auto' } as React.CSSProperties,
  suggestionBtn: { padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' } as React.CSSProperties,
  // Message bubbles
  msgRow: { display: 'flex', gap: 12, maxWidth: 720 } as React.CSSProperties,
  msgRowUser: { marginLeft: 'auto', flexDirection: 'row-reverse' as const } as React.CSSProperties,
  msgAvatar: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 } as React.CSSProperties,
  msgAvatarUser: { background: '#2563eb', color: '#fff' } as React.CSSProperties,
  msgAvatarAI: { background: '#f3f4f6', color: '#6b7280' } as React.CSSProperties,
  msgBubble: { padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, maxWidth: 560 } as React.CSSProperties,
  msgBubbleUser: { background: '#2563eb', color: '#fff', borderBottomRightRadius: 4 } as React.CSSProperties,
  msgBubbleAI: { background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderBottomLeftRadius: 4 } as React.CSSProperties,
  // Reaction + debug bar
  msgMeta: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 44 } as React.CSSProperties,
  reactionBtn: { padding: '2px 6px', fontSize: 14, background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', lineHeight: 1 } as React.CSSProperties,
  reactionBtnActive: { background: '#dbeafe', borderColor: '#93c5fd' } as React.CSSProperties,
  debugInfo: { fontSize: 10, color: '#9ca3af', display: 'flex', gap: 8 } as React.CSSProperties,
  debugBadge: { display: 'inline-block', padding: '1px 5px', borderRadius: 6, fontSize: 10, background: '#f3f4f6', color: '#6b7280' } as React.CSSProperties,
  // Typing indicator
  typing: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' } as React.CSSProperties,
  typingDots: { display: 'flex', gap: 4 } as React.CSSProperties,
  typingDot: { width: 6, height: 6, borderRadius: '50%', background: '#9ca3af', animation: 'pulse 1.4s infinite' } as React.CSSProperties,
  // Input area
  inputArea: { padding: '12px 20px', background: '#fff', borderTop: '1px solid #e5e7eb' } as React.CSSProperties,
  inputRow: { display: 'flex', gap: 10, alignItems: 'flex-end' } as React.CSSProperties,
  inputWrapper: { flex: 1, position: 'relative' as const } as React.CSSProperties,
  textarea: { width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', resize: 'none' as const, minHeight: 42, maxHeight: 120, boxSizing: 'border-box' as const, lineHeight: 1.5, fontFamily: 'inherit' } as React.CSSProperties,
  sendBtn: { padding: '10px 18px', fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const, height: 42, flexShrink: 0 } as React.CSSProperties,
  sendBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' } as React.CSSProperties,
  charCount: { position: 'absolute' as const, bottom: 4, right: 10, fontSize: 10, color: '#d1d5db' } as React.CSSProperties,
  // Empty state for sidebar
  historyEmpty: { padding: '20px 16px', textAlign: 'center' as const, color: '#9ca3af', fontSize: 12 } as React.CSSProperties,
};

// ── Suggestions for empty state ──────────────────────────────
const SUGGESTIONS = [
  'What can you help me with?',
  'How do I create a new entity?',
  'Explain the role permissions',
  'How does feedback triage work?',
  'What telemetry is tracked?',
  'Tell me about the backup system',
];

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(d: Date): string {
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Render markdown-like formatting ──────────────────────────
function renderContent(text: string): React.ReactNode {
  // Split by **bold** and \n
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Chat() {
  const location = useLocation();
  const { data: me } = trpc.auth.me.useQuery();

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find(c => c.id === activeConvId) || null;

  // Load previous conversations from server
  const { data: serverHistory } = trpc.chat.myConversations.useQuery();

  // Mutations
  const startSessionMutation = trpc.chat.startSession.useMutation();
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const recordReactionMutation = trpc.chat.recordReaction.useMutation();

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length, isThinking]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // Detect current screen context
  const getScreenContext = useCallback(() => {
    // Parse from the location or default to 'chat'
    const path = location.pathname;
    if (path.includes('admin/settings')) return { screenMode: 'settings', screenTab: undefined };
    if (path.includes('entities')) return { screenMode: 'entities', screenTab: undefined };
    return { screenMode: 'chat', screenTab: undefined };
  }, [location.pathname]);

  // Start a new conversation
  const handleNewChat = useCallback(() => {
    const convId = crypto.randomUUID();
    const ctx = getScreenContext();
    setConversations(prev => [{
      id: convId,
      sessionId: '',  // will be set after first message
      messages: [],
      screenMode: ctx.screenMode,
      screenTab: ctx.screenTab,
      startedAt: new Date(),
    }, ...prev]);
    setActiveConvId(convId);
    setInputText('');
  }, [getScreenContext]);

  // Send a message
  const handleSend = useCallback(async (text?: string) => {
    const message = (text || inputText).trim();
    if (!message || isThinking) return;

    let conv = activeConv;

    // If no active conversation, create one
    if (!conv) {
      const convId = crypto.randomUUID();
      const ctx = getScreenContext();
      conv = {
        id: convId,
        sessionId: '',
        messages: [],
        screenMode: ctx.screenMode,
        screenTab: ctx.screenTab,
        startedAt: new Date(),
      };
      setConversations(prev => [conv!, ...prev]);
      setActiveConvId(convId);
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    const updatedMessages = [...conv.messages, userMsg];
    const turnNumber = Math.ceil(updatedMessages.length / 2);
    let sessionId = conv.sessionId;

    setConversations(prev => prev.map(c =>
      c.id === conv!.id ? { ...c, messages: updatedMessages } : c
    ));
    setInputText('');
    setIsThinking(true);

    try {
      // Start session if this is the first message
      if (!sessionId) {
        const result = await startSessionMutation.mutateAsync({
          screenMode: conv.screenMode,
          screenTab: conv.screenTab,
          initialPrompt: message,
        });
        sessionId = result.sessionId;
        setConversations(prev => prev.map(c =>
          c.id === conv!.id ? { ...c, sessionId } : c
        ));
      }

      // Send the message
      const response = await sendMessageMutation.mutateAsync({
        sessionId,
        conversationId: conv.id,
        message,
        turnNumber,
        screenMode: conv.screenMode,
        screenTab: conv.screenTab,
        history: updatedMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      // Add assistant response
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        debugId: response.debugId,
        reaction: null,
        context: response.context,
      };

      setConversations(prev => prev.map(c =>
        c.id === conv!.id ? { ...c, messages: [...updatedMessages, aiMsg] } : c
      ));
    } catch (err: any) {
      // Add error message
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
      };
      setConversations(prev => prev.map(c =>
        c.id === conv!.id ? { ...c, messages: [...updatedMessages, errMsg] } : c
      ));
    }

    setIsThinking(false);
  }, [inputText, activeConv, isThinking, getScreenContext, startSessionMutation, sendMessageMutation]);

  // Handle reaction
  const handleReaction = useCallback(async (msgId: string, debugId: string, reaction: 'thumbs_up' | 'thumbs_down') => {
    // Optimistic update
    setConversations(prev => prev.map(c => ({
      ...c,
      messages: c.messages.map(m =>
        m.id === msgId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m
      ),
    })));

    try {
      await recordReactionMutation.mutateAsync({ debugId, reaction });
    } catch {
      // Revert on failure
    }
  }, [recordReactionMutation]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const userInitial = me?.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <div style={st.page}>
      {/* Sidebar — conversation history */}
      <div style={st.sidebar}>
        <div style={st.sidebarHeader}>
          <h3 style={st.sidebarTitle}>AI Assistant</h3>
          <p style={st.sidebarSub}>Ask questions about this app</p>
          <button style={st.newChatBtn} onClick={handleNewChat}>+ New Chat</button>
        </div>

        <div style={st.historyList}>
          {conversations.length === 0 && (!serverHistory || serverHistory.length === 0) ? (
            <div style={st.historyEmpty}>No conversations yet. Start a new chat above.</div>
          ) : (
            <>
              {/* Current session conversations */}
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  style={{
                    ...st.historyItem,
                    ...(activeConvId === conv.id ? st.historyItemActive : {}),
                  }}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  <p style={st.historyPrompt}>
                    {conv.messages[0]?.content || 'New conversation'}
                  </p>
                  <div style={st.historyMeta}>
                    <span>{formatDate(conv.startedAt)}</span>
                    <span>{conv.messages.length} msgs</span>
                    {conv.screenMode && <span style={st.historyBadge}>{conv.screenMode}</span>}
                  </div>
                </div>
              ))}

              {/* Server-side history (previous sessions) */}
              {serverHistory && serverHistory.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px', fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderTop: '1px solid #f3f4f6', marginTop: 8 }}>
                    Previous Sessions
                  </div>
                  {serverHistory
                    .filter(s => !conversations.some(c => c.sessionId === s.id))
                    .slice(0, 10)
                    .map(session => (
                      <div
                        key={session.id}
                        style={{ ...st.historyItem, opacity: 0.7 }}
                        title="Previous session (read-only)"
                      >
                        <p style={st.historyPrompt}>
                          {session.initialPrompt}
                        </p>
                        <div style={st.historyMeta}>
                          <span>{formatDate(new Date(session.createdAt))}</span>
                          {session.screenMode && <span style={st.historyBadge}>{session.screenMode}</span>}
                        </div>
                      </div>
                    ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div style={st.chatMain}>
        {/* Context bar */}
        <div style={st.contextBar}>
          <div style={st.contextDot} />
          <span>AI Assistant</span>
          <span style={st.contextBadge}>
            Screen: {activeConv?.screenMode || getScreenContext().screenMode}
          </span>
          {activeConv && activeConv.messages.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>
              {Math.ceil(activeConv.messages.length / 2)} turn(s)
            </span>
          )}
        </div>

        {/* Messages area */}
        <div style={st.messagesArea}>
          {!activeConv || activeConv.messages.length === 0 ? (
            <div style={st.welcomeBox}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1f4ac;</div>
              <h2 style={st.welcomeTitle}>How can I help?</h2>
              <p style={st.welcomeDesc}>
                I have access to this app's FAQ, knowledge base, and prompt templates.
                I'm aware of which screen you're on and can provide context-specific help.
              </p>
              <div style={st.suggestionGrid}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    style={st.suggestionBtn}
                    onClick={() => handleSend(s)}
                    onMouseEnter={e => { (e.target as any).style.background = '#eff6ff'; (e.target as any).style.borderColor = '#93c5fd'; }}
                    onMouseLeave={e => { (e.target as any).style.background = '#fff'; (e.target as any).style.borderColor = '#e5e7eb'; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeConv.messages.map((msg) => (
                <div key={msg.id}>
                  <div style={{ ...st.msgRow, ...(msg.role === 'user' ? st.msgRowUser : {}) }}>
                    <div style={{
                      ...st.msgAvatar,
                      ...(msg.role === 'user' ? st.msgAvatarUser : st.msgAvatarAI),
                    }}>
                      {msg.role === 'user' ? userInitial : 'AI'}
                    </div>
                    <div style={{
                      ...st.msgBubble,
                      ...(msg.role === 'user' ? st.msgBubbleUser : st.msgBubbleAI),
                    }}>
                      {renderContent(msg.content)}
                    </div>
                  </div>

                  {/* Reactions + debug info for AI messages */}
                  {msg.role === 'assistant' && msg.debugId && (
                    <div style={st.msgMeta}>
                      <button
                        style={{
                          ...st.reactionBtn,
                          ...(msg.reaction === 'thumbs_up' ? st.reactionBtnActive : {}),
                        }}
                        onClick={() => handleReaction(msg.id, msg.debugId!, 'thumbs_up')}
                        title="Helpful"
                      >
                        &#x1f44d;
                      </button>
                      <button
                        style={{
                          ...st.reactionBtn,
                          ...(msg.reaction === 'thumbs_down' ? st.reactionBtnActive : {}),
                        }}
                        onClick={() => handleReaction(msg.id, msg.debugId!, 'thumbs_down')}
                        title="Not helpful"
                      >
                        &#x1f44e;
                      </button>
                      {msg.context && (
                        <div style={st.debugInfo}>
                          <span style={st.debugBadge}>{msg.context.inputTokens}+{msg.context.outputTokens} tok</span>
                          <span style={st.debugBadge}>{msg.context.durationMs}ms</span>
                          {msg.context.faqHits > 0 && <span style={st.debugBadge}>{msg.context.faqHits} FAQ</span>}
                          {msg.context.kbHits > 0 && <span style={st.debugBadge}>{msg.context.kbHits} KB</span>}
                        </div>
                      )}
                      <span style={{ fontSize: 10, color: '#d1d5db', marginLeft: 'auto' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )}

                  {/* Timestamp for user messages */}
                  {msg.role === 'user' && (
                    <div style={{ textAlign: 'right', fontSize: 10, color: '#d1d5db', marginTop: 4, paddingRight: 44 }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isThinking && (
                <div style={st.typing}>
                  <div style={{ ...st.msgAvatar, ...st.msgAvatarAI }}>AI</div>
                  <div style={{ ...st.msgBubble, ...st.msgBubbleAI, padding: '12px 20px' }}>
                    <div style={st.typingDots}>
                      <div style={{ ...st.typingDot, animationDelay: '0s' }} />
                      <div style={{ ...st.typingDot, animationDelay: '0.2s' }} />
                      <div style={{ ...st.typingDot, animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div style={st.inputArea}>
          <div style={st.inputRow}>
            <div style={st.inputWrapper}>
              <textarea
                ref={textareaRef}
                style={st.textarea}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question... (Enter to send, Shift+Enter for new line)"
                rows={1}
              />
              {inputText.length > 200 && (
                <span style={st.charCount}>{inputText.length}/2000</span>
              )}
            </div>
            <button
              style={{
                ...st.sendBtn,
                ...(!inputText.trim() || isThinking ? st.sendBtnDisabled : {}),
              }}
              disabled={!inputText.trim() || isThinking}
              onClick={() => handleSend()}
            >
              {isThinking ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Typing animation CSS */}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
