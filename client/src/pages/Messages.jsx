import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { getSocket } from "@/services/socket";
import api from "@/services/api";
import { toast } from "sonner";

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
  const raw = String(name || "").trim();
  if (!raw) return "U";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const partnerFromQuery = searchParams.get("partner");

  const { isAuthenticated, isLoading, sessionLoaded, clerkUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activePartnerId, setActivePartnerId] = useState(partnerFromQuery || null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [partnerHint, setPartnerHint] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const messagesScrollRef = useRef(null);

  const isShowingMobileChat = isMobile && !!activePartnerId;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (partnerFromQuery) {
      setActivePartnerId(partnerFromQuery);
    }
  }, [partnerFromQuery]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.partner.id === activePartnerId) || null,
    [conversations, activePartnerId]
  );

  const appendUniqueMessage = useCallback((message) => {
    if (!message?.id) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated || !sessionLoaded || !clerkUser?.id) return;
    try {
      setLoadingConversations(true);
      const res = await api.get("/dm/conversations");
      setConversations(res?.data?.data?.conversations || []);

      if (!isMobile && !activePartnerId && res?.data?.data?.conversations?.length > 0) {
        setActivePartnerId(res.data.data.conversations[0].partner.id);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load conversations");
    } finally {
      setLoadingConversations(false);
    }
  }, [isAuthenticated, sessionLoaded, clerkUser?.id, activePartnerId, isMobile]);

  const refreshMessages = useCallback(async (partnerId) => {
    if (!partnerId || !isAuthenticated || !sessionLoaded || !clerkUser?.id) return;
    try {
      setLoadingMessages(true);
      const res = await api.get(`/dm/${partnerId}`);
      setMessages(res?.data?.data?.messages || []);
      await api.post(`/dm/${partnerId}/read`).catch(() => null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, [isAuthenticated, sessionLoaded, clerkUser?.id]);

  useEffect(() => {
    if (!isAuthenticated || !sessionLoaded || !clerkUser?.id) return;
    refreshConversations();
  }, [isAuthenticated, sessionLoaded, clerkUser?.id, refreshConversations]);

  useEffect(() => {
    refreshMessages(activePartnerId);
  }, [activePartnerId, refreshMessages]);

  useEffect(() => {
    if (!activePartnerId || activeConversation) {
      setPartnerHint(activeConversation?.partner || null);
      return;
    }
    if (!isAuthenticated || !sessionLoaded || !clerkUser?.id) return;

    let cancelled = false;
    const loadPartnerHint = async () => {
      try {
        const res = await api.get("/friends");
        if (cancelled) return;
        const data = res?.data?.data || {};
        const fromFriends = (data.friends || []).find((f) => f?.friendProfile?.id === activePartnerId)?.friendProfile;
        const fromSuggested = (data.suggestedUsers || []).find((u) => u?.id === activePartnerId);
        setPartnerHint(fromFriends || fromSuggested || {
          id: activePartnerId,
          display_name: "Conversation",
          username: "user",
          avatar_url: null,
        });
      } catch {
        if (!cancelled) {
          setPartnerHint({
            id: activePartnerId,
            display_name: "Conversation",
            username: "user",
            avatar_url: null,
          });
        }
      }
    };

    loadPartnerHint();
    return () => {
      cancelled = true;
    };
  }, [activePartnerId, activeConversation, isAuthenticated, sessionLoaded, clerkUser?.id]);

  useEffect(() => {
    if (!isAuthenticated || !sessionLoaded || !clerkUser?.id) return;

    const socket = getSocket();

    const onDmNew = ({ message }) => {
      if (!message) return;

      const partnerId = message.sender_id === clerkUser.id ? message.recipient_id : message.sender_id;

      let conversationFound = false;

      setConversations((prev) => {
        const next = [...prev];
        const idx = next.findIndex((c) => c.partner.id === partnerId);
        if (idx >= 0) {
          conversationFound = true;
          next[idx] = {
            ...next[idx],
            unread_count: message.own ? next[idx].unread_count : next[idx].unread_count + 1,
            last_message: message,
          };
          return next.sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime());
        }

        return next;
      });

      if (!conversationFound) {
        refreshConversations();
      }

      if (partnerId === activePartnerId) {
        appendUniqueMessage(message);
      }
    };

    socket.on("dm:new", onDmNew);

    return () => {
      socket.off("dm:new", onDmNew);
    };
  }, [isAuthenticated, sessionLoaded, clerkUser?.id, activePartnerId, appendUniqueMessage, refreshConversations]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, activePartnerId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activePartnerId || sending) return;

    try {
      setSending(true);
      const socket = getSocket();

      const response = await new Promise((resolve) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ success: false, error: "Socket timeout" });
        }, 5000);

        socket.emit("dm:send", { partnerId: activePartnerId, text }, (result) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(result || { success: false, error: "No response" });
        });
      });

      if (response?.success && response?.message) {
        appendUniqueMessage(response.message);
      } else {
        // Fallback path if socket callback failed unexpectedly.
        const rest = await api.post(`/dm/${activePartnerId}`, { text });
        const message = rest?.data?.data?.message;
        appendUniqueMessage(message);
      }

      setDraft("");
      refreshConversations();
    } catch (error) {
      toast.error(error?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl py-14">
        <div className="text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Sign in to view direct messages</p>
          <Button onClick={() => navigate("/sign-in")}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-6xl py-4 sm:py-6">
      <div className={`grid ${isMobile ? "grid-cols-1" : "md:grid-cols-[320px_1fr]"} gap-3 sm:gap-4 min-h-[72vh]`}>
        <aside className={`rounded-3xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--muted)/0.08))] overflow-hidden shadow-xl shadow-black/10 ${isShowingMobileChat ? "hidden" : ""}`}>
          <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{isMobile ? "Chats" : "Messages"}</h2>
              {isMobile && <p className="text-[11px] text-muted-foreground mt-0.5">Pick a conversation to continue</p>}
            </div>
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Realtime</span>
          </div>

          <div className="max-h-[68vh] overflow-y-auto">
            {loadingConversations ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <div className="px-4 py-8">
                <div className="rounded-2xl border border-border/60 bg-muted/25 p-5 text-center">
                  <p className="text-sm font-medium text-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start a chat with a friend to see it here.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 rounded-xl"
                    onClick={() => navigate("/friends")}
                  >
                    Open Friends
                  </Button>
                </div>
              </div>
            ) : (
              conversations.map((conversation) => {
                const active = activePartnerId === conversation.partner.id;
                return (
                  <button
                    key={conversation.partner.id}
                    onClick={() => setActivePartnerId(conversation.partner.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 ${active ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted/70 overflow-hidden grid place-items-center text-xs font-semibold text-foreground">
                        {conversation.partner.avatar_url ? (
                          <img src={conversation.partner.avatar_url} alt={conversation.partner.display_name} className="h-full w-full object-cover" />
                        ) : (
                          initials(conversation.partner.display_name)
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{conversation.partner.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conversation.last_message?.text || "No messages yet"}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{formatTime(conversation.last_message?.created_at)}</span>
                          {conversation.unread_count > 0 && (
                            <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            {conversations.length === 0 && activePartnerId && partnerHint && (
              <button
                onClick={() => setActivePartnerId(partnerHint.id)}
                className="w-full text-left px-4 py-3 border-t border-border/50 hover:bg-muted/40"
              >
                <p className="text-sm font-semibold text-foreground truncate">{partnerHint.display_name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">Start new conversation</p>
              </button>
            )}
          </div>
        </aside>

        <section className={`rounded-3xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--muted)/0.08))] overflow-hidden flex flex-col shadow-xl shadow-black/10 ${isMobile && !isShowingMobileChat ? "hidden" : ""}`}>
          <div className="px-3 sm:px-4 py-3 border-b border-border/70 flex items-center gap-3">
            {isMobile && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setActivePartnerId(null)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="h-9 w-9 rounded-full bg-muted/70 overflow-hidden grid place-items-center text-xs font-semibold text-foreground">
              {(activeConversation?.partner?.avatar_url || partnerHint?.avatar_url) ? (
                <img src={activeConversation?.partner?.avatar_url || partnerHint?.avatar_url} alt={activeConversation?.partner?.display_name || partnerHint?.display_name || "Conversation"} className="h-full w-full object-cover" />
              ) : (
                initials(activeConversation?.partner?.display_name || partnerHint?.display_name || "Conversation")
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {activeConversation?.partner?.display_name || partnerHint?.display_name || "Select a conversation"}
              </h3>
              <p className="text-[11px] text-muted-foreground">Direct messages</p>
            </div>
          </div>

          <div ref={messagesScrollRef} className={`flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 ${isMobile ? "max-h-[calc(100vh-15.5rem)]" : "max-h-[56vh]"}`}>
            {loadingMessages ? (
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start the conversation</p>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.own ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-md ${message.own ? "bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground" : "bg-muted text-foreground"}`}>
                    <p className="text-[13px] sm:text-sm whitespace-pre-wrap break-words">{message.text}</p>
                    <p className={`text-[10px] mt-1 ${message.own ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {formatTime(message.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 sm:p-3 border-t border-border/70 flex items-center gap-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)]">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              placeholder={activePartnerId ? "Type a message..." : "Select a conversation first"}
              disabled={!activePartnerId}
              className="h-11 rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button onClick={handleSend} disabled={!activePartnerId || !draft.trim() || sending} className="gap-1.5 h-11 rounded-2xl px-4">
              <Send className="w-4 h-4" />
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
