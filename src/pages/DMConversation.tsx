import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, X, FileText, Image as ImageIcon,
  Download, Trash2, Edit2, MoreVertical, ThumbsUp, ThumbsDown,
  ArrowDown, Loader2, Check, ChevronsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDirectMessages } from "@/hooks/useDirectMessages";
import type { DirectMessage } from "@/types/chat";

const MAX_FILE_SIZE_MB = 10;

// Fix #22: Role-based avatar colors instead of always gradient-hero
const ROLE_AVATAR: Record<string, string> = {
  admin:   "bg-indigo-500",
  teacher: "bg-blue-500",
  student: "bg-emerald-500",
};
function roleAvatar(role: string) {
  return ROLE_AVATAR[role] ?? "bg-slate-500";
}

export default function DMConversation() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("student");
  const [instituteCode, setInstituteCode] = useState("");
  const [otherUserName, setOtherUserName] = useState("...");
  const [otherUserRole, setOtherUserRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  // Chat UI state
  const [chatInput, setChatInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [reactionsViewerMsg, setReactionsViewerMsg] = useState<DirectMessage | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  // ── Session & conversation info ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // Fix #12: Auth guard — redirect to login if not authenticated
      if (!user || !conversationId) {
        navigate("/role-select", { replace: true });
        return;
      }
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, institute_code")
        .eq("user_id", user.id)
        .single();
      if (profile) {
        setCurrentUserName(profile.full_name);
        setCurrentUserRole(profile.role);
        setInstituteCode(profile.institute_code || "");
      }

      // Fetch conversation to find the other participant
      const { data: conv } = await supabase
        .from("direct_conversations")
        .select("admin_id, other_user_id")
        .eq("id", conversationId)
        .single();

      if (conv) {
        const otherId = conv.admin_id === user.id ? conv.other_user_id : conv.admin_id;
        const isOtherAdmin = conv.admin_id !== user.id;
        const { data: otherProfile } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("user_id", otherId)
          .single();
        if (otherProfile) {
          setOtherUserName(otherProfile.full_name);
          setOtherUserRole(isOtherAdmin ? "admin" : otherProfile.role);
        }
      }

      setPageLoading(false);
    };
    init();
  }, [conversationId, navigate]);

  // ── Messages hook ───────────────────────────────────────────
  const {
    messages,
    loading: msgsLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
  } = useDirectMessages({
    conversationId: conversationId ?? "",
    currentUserId,
    currentUserName,
    currentUserRole,
    instituteCode,
  });

  // ── Scroll management ──────────────────────────────────────
  // Fix #18: Use scrollIntoView which properly respects browser reflow
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    chatEndRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowScrollDown(false);
  }, []);

  // Initial scroll to bottom after first load
  useEffect(() => {
    if (msgsLoading || messages.length === 0) return;
    if (!initialScrollDone.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
      initialScrollDone.current = true;
      setShowScrollDown(false);
    }
  }, [msgsLoading, messages.length]);

  // Auto-scroll when new messages arrive (only if already near bottom)
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const newCount = messages.length;
    if (!initialScrollDone.current) return;
    if (newCount > prevMsgCount.current) {
      const container = chatContainerRef.current;
      if (container) {
        const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (dist < 300) {
          scrollToBottom("smooth");
        } else {
          setShowScrollDown(true);
        }
      }
    }
    prevMsgCount.current = newCount;
  }, [messages, scrollToBottom]);

  // Fix #11: Always navigate to chat hub — never rely on unreliable history.length
  const handleBack = () => {
    navigate(`/${currentUserRole}/chat`);
  };

  // ── File helpers ────────────────────────────────────────────
  const isImage = (type: string | null | undefined) => type?.startsWith("image/");
  const isPDF = (type: string | null | undefined) => type === "application/pdf";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File too large (max ${MAX_FILE_SIZE_MB} MB)`);
      return;
    }
    setAttachedFile(file);
    e.target.value = "";
  };

  // ── Send handler ────────────────────────────────────────────
  const handleSend = async () => {
    if ((!chatInput.trim() && !attachedFile) || sendingMsg) return;
    setSendingMsg(true);

    if (editingMessage) {
      await editMessage(editingMessage.id, chatInput.trim());
      setChatInput("");
      setEditingMessage(null);
      setSendingMsg(false);
      // Fix #1: No focus() — keeping focus throughout. Input never lost focus.
      return;
    }

    if (attachedFile) setUploadingFile(true);
    await sendMessage({
      text: chatInput.trim(),
      file: attachedFile,
      replyToId: replyingTo?.id,
    });
    if (attachedFile) setUploadingFile(false);

    setChatInput("");
    setAttachedFile(null);
    setReplyingTo(null);
    setEditingMessage(null);
    setSendingMsg(false);
    // Fix #1: No setTimeout focus hack — the input never lost focus since
    // both send button and file button use onMouseDown={e => e.preventDefault()}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatChatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return timeStr;
    if (isYesterday) return `${timeStr} Yesterday`;
    return `${timeStr} ${date.getDate()} ${date.toLocaleString("en-IN", { month: "short" }).toUpperCase()}`;
  };

  const roleLabel = (role: string) => {
    if (role === "admin") return "Admin";
    if (role === "teacher") return "Teacher";
    if (role === "student") return "Student";
    return role;
  };

  // Fix #14: Resolve reactor names from known participants (1-on-1 DM)
  const resolveReactorName = (userId: string) => {
    if (userId === currentUserId) return "You";
    return otherUserName || "User";
  };

  if (pageLoading || msgsLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* ── Header ── */}
      <header className="border-b border-border/50 bg-card flex items-center gap-3 px-3 h-14 flex-shrink-0">
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {/* Fix #22: Role-based avatar color */}
        <div
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0",
            roleAvatar(otherUserRole)
          )}
        >
          {otherUserName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-none truncate">{otherUserName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{roleLabel(otherUserRole)}</p>
        </div>

        <div className="flex items-center gap-1 text-xs text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Live
        </div>
      </header>

      {/* ── Messages ── */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ touchAction: "pan-y" }} // Fix #7: let browser handle vertical scroll natively
        onScroll={(e) => {
          const t = e.currentTarget;
          setShowScrollDown(t.scrollHeight - t.scrollTop - t.clientHeight > 100);
        }}
      >
        {/* Fix #5: Load older messages button */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronsUp className="w-3.5 h-3.5" />
              )}
              {loadingMore ? "Loading..." : "Load older messages"}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            drag="x"
            dragSnapToOrigin
            // Fix #7: tighter constraints + higher snap threshold to reduce accidental triggers
            dragConstraints={msg.isSelf ? { left: 0, right: 70 } : { left: -70, right: 0 }}
            dragElastic={0.15}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (msg.isSelf && info.offset.x > 60) setReplyingTo(msg);
              else if (!msg.isSelf && info.offset.x < -60) setReplyingTo(msg);
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-2.5 relative group", msg.isSelf ? "flex-row-reverse" : "flex-row")}
          >
            {/* Avatar for other user */}
            {!msg.isSelf && (
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5",
                  roleAvatar(msg.sender_role) // Fix #22: role-based color
                )}
              >
                {msg.sender_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </div>
            )}

            <div className={cn("max-w-xs lg:max-w-md flex flex-col gap-0.5", msg.isSelf ? "items-end" : "items-start")}>
              {/* Sender name + role (for non-self) */}
              {!msg.isSelf && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{msg.sender_name}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-primary-light text-primary border-primary/20">
                    {roleLabel(msg.sender_role)}
                  </Badge>
                </div>
              )}

              {/* Bubble */}
              <div
                className={cn(
                  "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.isSelf
                    ? "gradient-hero text-white rounded-tr-sm"
                    : "bg-card border border-border/60 rounded-tl-sm"
                )}
              >
                {msg.is_deleted ? (
                  <div className="italic text-muted-foreground flex items-center gap-1.5 opacity-80">
                    <Trash2 className="w-3.5 h-3.5" /> This message was deleted
                  </div>
                ) : (
                  <>
                    {/* Reply reference */}
                    {msg.reply_to_id && (
                      <div
                        className={cn(
                          "mb-2 p-2 rounded-lg border-l-4 bg-black/5 text-xs truncate",
                          msg.isSelf ? "border-white/40 text-white/90" : "border-primary/40 text-muted-foreground"
                        )}
                      >
                        {messages.find((m) => m.id === msg.reply_to_id)?.message || "Original message"}
                      </div>
                    )}

                    {/* File attachment */}
                    {msg.file_url && (
                      <div className="mb-1.5">
                        {isImage(msg.file_type) ? (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.file_url}
                              alt={msg.file_name || "image"}
                              className="max-w-[200px] max-h-[160px] rounded-lg object-cover border border-white/20"
                              onLoad={() => {
                                const c = chatContainerRef.current;
                                if (!c) return;
                                const dist = c.scrollHeight - c.scrollTop - c.clientHeight;
                                if (dist < 300) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                              }}
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                              msg.isSelf ? "bg-white/20 text-white" : "bg-muted text-foreground"
                            )}
                          >
                            {isPDF(msg.file_type) ? (
                              <FileText className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0" />
                            )}
                            <span className="truncate max-w-[140px]">{msg.file_name || "Download file"}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Message text */}
                    {msg.message && msg.message !== msg.file_name && (
                      <span>{msg.message}</span>
                    )}
                  </>
                )}
              </div>

              {/* Message options (own messages) */}
              {!msg.is_deleted && msg.isSelf && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-5 h-5 absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-3 h-3 opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    {new Date(msg.created_at).getTime() > Date.now() - 20 * 60 * 1000 && !msg.file_url && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingMessage(msg);
                          setChatInput(msg.message);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setMessageToDelete(msg.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Timestamp + edited label + reactions */}
              <div className="flex items-center gap-3 mt-1 px-1">
                <span className="text-[10px] text-muted-foreground">
                  {formatChatDate(msg.created_at)}
                  {/* Fix #8: Only ONE "edited" indicator — removed duplicate from inside bubble */}
                  {!msg.is_deleted && msg.is_edited && (
                    <span className="italic opacity-70 ml-1">(Edited)</span>
                  )}
                </span>

                {/* Fix #24: Checkmark for own sent messages */}
                {msg.isSelf && !msg.is_deleted && (
                  <Check className="w-3 h-3 text-white/60 flex-shrink-0" />
                )}

                <div className="flex items-center gap-2">
                  {(["👍", "👎"] as const).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => reactToMessage(msg.id, emoji)}
                      className={cn(
                        "flex items-center gap-1 p-1 rounded-md transition-colors hover:bg-muted",
                        msg.reactions?.[emoji]?.includes(currentUserId) && emoji === "👍" && "text-primary bg-primary/10",
                        msg.reactions?.[emoji]?.includes(currentUserId) && emoji === "👎" && "text-destructive bg-destructive/10"
                      )}
                    >
                      {emoji === "👍" ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
                      {(msg.reactions?.[emoji]?.length ?? 0) > 0 && (
                        <span className="text-[10px] font-bold">{msg.reactions![emoji].length}</span>
                      )}
                    </button>
                  ))}
                  {Object.values(msg.reactions || {}).reduce((a, v) => a + v.length, 0) > 0 && (
                    <button
                      onClick={() => setReactionsViewerMsg(msg)}
                      className="text-[10px] font-semibold text-primary hover:underline ml-1"
                    >
                      See
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ── Scroll-to-bottom button ── */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-[80px] right-4 z-20"
          >
            <Button
              size="icon"
              className="rounded-full shadow-xl gradient-hero text-white border-0 w-11 h-11"
              onClick={() => scrollToBottom("smooth")}
            >
              <ArrowDown className="w-5 h-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reply preview ── */}
      {replyingTo && (
        <div className="px-4 py-2 bg-muted/30 border-t border-border/40 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex-1 min-w-0 border-l-2 border-primary pl-3 py-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Replying to {replyingTo.sender_name}
            </p>
            <p className="text-sm text-muted-foreground truncate">{replyingTo.message}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full"
            onClick={() => setReplyingTo(null)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Editing context bar ── */}
      {editingMessage && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between">
          <div className="flex-1 min-w-0 border-l-2 border-amber-500 pl-3 py-1">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Editing message</p>
            <p className="text-sm text-muted-foreground truncate">{editingMessage.message}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full"
            onClick={() => { setEditingMessage(null); setChatInput(""); }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Attached file preview ── */}
      {attachedFile && (
        <div className="px-3 py-2 bg-muted/50 border-t border-border/40 flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0 bg-card border border-border/50 rounded-lg px-3 py-1.5">
            {attachedFile.type.startsWith("image/") ? (
              <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <span className="text-xs truncate text-foreground">{attachedFile.name}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {(attachedFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => setAttachedFile(null)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ── Chat input ── */}
      <div className="border-t border-border/50 p-3 bg-card flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          onChange={handleFileSelect}
        />
        {/* Fix #1: onMouseDown preventDefault prevents input from losing focus / keyboard closing */}
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 flex-shrink-0 text-muted-foreground hover:text-primary"
          onMouseDown={(e) => e.preventDefault()} // Fix #1
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
        >
          {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </Button>

        <input
          ref={inputRef}
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={editingMessage ? "Edit message..." : "Type a message..."}
          className="flex-1 text-sm bg-muted/40 border border-border/40 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
        />

        {/* Fix #1: onMouseDown preventDefault keeps keyboard open on iOS */}
        <Button
          size="icon"
          className="w-9 h-9 flex-shrink-0 gradient-hero border-0 text-white shadow-md"
          onMouseDown={(e) => e.preventDefault()} // Fix #1: prevent input blur on tap
          onClick={handleSend}
          disabled={sendingMsg || (!chatInput.trim() && !attachedFile)}
        >
          {sendingMsg ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : editingMessage ? (
            <Check className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* ── Reactions viewer ── */}
      {reactionsViewerMsg && (
        <Dialog
          open={!!reactionsViewerMsg}
          onOpenChange={(open) => !open && setReactionsViewerMsg(null)}
        >
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle className="font-display">Reactions</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
              {["👍", "👎"].map((emoji) => {
                const userIds = reactionsViewerMsg.reactions?.[emoji] || [];
                if (userIds.length === 0) return null;
                return (
                  <div key={emoji} className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span>{emoji}</span>
                      <Badge variant="secondary" className="px-1.5 py-0 min-w-5 justify-center">
                        {userIds.length}
                      </Badge>
                    </h4>
                    <div className="space-y-1.5 pl-2 border-l-2 border-border/50">
                      {userIds.map((id) => (
                        <p key={id} className="text-sm">
                          {/* Fix #14: Show actual names, not just "User" */}
                          {resolveReactorName(id)}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete confirmation ── */}
      <AlertDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the message for both participants. You cannot undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => messageToDelete && deleteMessage(messageToDelete).then(() => setMessageToDelete(null))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
